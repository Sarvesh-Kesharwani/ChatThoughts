import type { BaseStore } from './base-types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SPACE = 'appDataFolder';
const FILE_NAME = 'base-app-state.json';

interface DriveBaseData extends BaseStore {
  updatedAt: string;
}

export interface DriveBaseState extends BaseStore {
  updatedAt: string;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeStore(input: Partial<BaseStore> | null | undefined): BaseStore {
  const thoughts = Array.isArray(input?.thoughts)
    ? input.thoughts
        .map((thought) => ({
          id: String(thought?.id ?? '').trim(),
          content: String(thought?.content ?? '').trim().slice(0, 2000),
          createdAt: String(thought?.createdAt ?? '').trim(),
        }))
        .filter((thought) => thought.id && thought.content && thought.createdAt)
        .slice(0, 300)
    : [];

  const insights = Array.isArray(input?.insights)
    ? input.insights
        .map((insight) => ({
          id: String(insight?.id ?? '').trim(),
          thoughtId: String(insight?.thoughtId ?? '').trim(),
          problem: String(insight?.problem ?? '').trim().slice(0, 500),
          solution: String(insight?.solution ?? '').trim().slice(0, 1000),
          tags: Array.isArray(insight?.tags)
            ? insight.tags.map((tag) => String(tag).trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10)
            : [],
          createdAt: String(insight?.createdAt ?? '').trim(),
        }))
        .filter((insight) => insight.id && insight.thoughtId && insight.problem && insight.solution && insight.createdAt)
        .slice(0, 1200)
    : [];

  return { thoughts, insights };
}

async function ensureDriveOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  let details = '';
  try {
    const text = await res.text();
    details = text ? ` ${text.slice(0, 280)}` : '';
  } catch {
    details = '';
  }

  throw new Error(`Google Drive ${action} failed (${res.status} ${res.statusText}).${details}`.trim());
}

async function listFiles(accessToken: string, query: string, fields = 'files(id)'): Promise<Array<{ id: string }>> {
  const qs = new URLSearchParams({ spaces: SPACE, fields, q: query });
  const res = await fetch(`${DRIVE_API}/files?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await ensureDriveOk(res, 'list request');
  const data = await res.json();
  return data.files ?? [];
}

async function findFile(accessToken: string, name = FILE_NAME, parent = SPACE): Promise<string | null> {
  const query = [`name='${escapeDriveQueryValue(name)}'`, `'${escapeDriveQueryValue(parent)}' in parents`].join(' and ');
  const files = await listFiles(accessToken, query);
  return files[0]?.id ?? null;
}

async function readFileJson<T>(accessToken: string, fileId: string): Promise<T | null> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  await ensureDriveOk(res, 'read request');
  return res.json() as Promise<T>;
}

async function uploadJsonFile(
  accessToken: string,
  name: string,
  body: string,
  options?: { fileId?: string; parents?: string[] },
): Promise<void> {
  if (options?.fileId) {
    const res = await fetch(`${UPLOAD_API}/files/${options.fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    await ensureDriveOk(res, 'update request');
    return;
  }

  const metadata = JSON.stringify({ name, parents: options?.parents ?? [SPACE] });
  const boundary = 'base_app_boundary';
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
  await ensureDriveOk(res, 'create request');
}

export async function readDriveBaseStore(accessToken: string): Promise<DriveBaseState | null> {
  const fileId = await findFile(accessToken);
  if (!fileId) return null;

  const data = await readFileJson<DriveBaseData>(accessToken, fileId);
  if (!data) return null;

  return {
    ...normalizeStore(data),
    updatedAt: data.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function writeDriveBaseStore(accessToken: string, store: BaseStore): Promise<string> {
  const fileId = await findFile(accessToken);
  const updatedAt = new Date().toISOString();
  const body = JSON.stringify({ ...normalizeStore(store), updatedAt });
  await uploadJsonFile(accessToken, FILE_NAME, body, { fileId: fileId ?? undefined, parents: [SPACE] });
  return updatedAt;
}
