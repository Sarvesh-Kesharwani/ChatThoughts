import { cookies } from 'next/headers';
import type { BaseStore } from './base-types';
import { DEFAULT_BASE_STORE, DEFAULT_FEATURE_REQUEST_CATEGORIES } from './constants';

const COOKIE = 'base_app_state';
const COOKIE_CHUNKS = 'base_app_state_chunks';
const COOKIE_CHUNK_PREFIX = 'base_app_state_chunk_';
const DRIVE_READY_COOKIE = 'base_app_drive_ready';
const LOCAL_UPDATED_COOKIE = 'base_app_local_updated_at';
const LOCAL_DIRTY_COOKIE = 'base_app_local_dirty';
const MAX_AGE = 60 * 60 * 24 * 365;
const MAX_COOKIE_CHUNK_SIZE = 3000;

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

  const featureRequestCategories = Array.isArray(input?.featureRequestCategories)
    ? [
        ...DEFAULT_FEATURE_REQUEST_CATEGORIES,
        ...input.featureRequestCategories.map((category) => String(category).trim().toLowerCase().slice(0, 40)),
      ]
        .filter(Boolean)
        .filter((category, index, categories) => categories.indexOf(category) === index)
        .slice(0, 20)
    : DEFAULT_FEATURE_REQUEST_CATEGORIES;

  const featureRequests = Array.isArray(input?.featureRequests)
    ? input.featureRequests
        .map((item) => ({
          id: String(item?.id ?? '').trim(),
          description: String(item?.description ?? '').trim().slice(0, 500),
          complete: Boolean(item?.complete),
          category: featureRequestCategories.includes(String(item?.category ?? '').trim().toLowerCase())
            ? String(item?.category ?? '').trim().toLowerCase()
            : DEFAULT_FEATURE_REQUEST_CATEGORIES[0],
          createdAt: String(item?.createdAt ?? '').trim(),
        }))
        .filter((item) => item.id && item.description && item.createdAt)
        .slice(0, 200)
    : [];

  return { thoughts, insights, featureRequestCategories, featureRequests };
}

function parseState(raw: string): BaseStore {
  const value = raw.trim();
  if (!value) return DEFAULT_BASE_STORE;
  try {
    return normalizeStore(JSON.parse(value) as Partial<BaseStore>);
  } catch {
    return DEFAULT_BASE_STORE;
  }
}

export async function getCookieBaseStore(): Promise<BaseStore> {
  const jar = await cookies();
  const chunkCount = Number(jar.get(COOKIE_CHUNKS)?.value ?? '0');

  if (Number.isInteger(chunkCount) && chunkCount > 0) {
    const parts: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const value = jar.get(`${COOKIE_CHUNK_PREFIX}${index}`)?.value;
      if (!value) {
        parts.length = 0;
        break;
      }
      parts.push(value);
    }

    if (parts.length === chunkCount) {
      return parseState(parts.join(''));
    }
  }

  const raw = jar.get(COOKIE)?.value ?? '';
  return parseState(raw);
}

export async function setCookieBaseStore(store: BaseStore): Promise<void> {
  const jar = await cookies();
  const serialized = JSON.stringify(normalizeStore(store));
  const previousChunkCount = Number(jar.get(COOKIE_CHUNKS)?.value ?? '0');

  if (Number.isInteger(previousChunkCount) && previousChunkCount > 0) {
    for (let index = 0; index < previousChunkCount; index += 1) {
      jar.delete(`${COOKIE_CHUNK_PREFIX}${index}`);
    }
    jar.delete(COOKIE_CHUNKS);
  }

  if (serialized.length <= MAX_COOKIE_CHUNK_SIZE) {
    jar.set(COOKIE, serialized, { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
    return;
  }

  jar.delete(COOKIE);
  const parts: string[] = [];
  for (let start = 0; start < serialized.length; start += MAX_COOKIE_CHUNK_SIZE) {
    parts.push(serialized.slice(start, start + MAX_COOKIE_CHUNK_SIZE));
  }

  for (let index = 0; index < parts.length; index += 1) {
    jar.set(`${COOKIE_CHUNK_PREFIX}${index}`, parts[index], { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
  }
  jar.set(COOKIE_CHUNKS, String(parts.length), { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
}

export async function clearCookieBaseStore(): Promise<void> {
  const jar = await cookies();
  const chunkCount = Number(jar.get(COOKIE_CHUNKS)?.value ?? '0');
  if (Number.isInteger(chunkCount) && chunkCount > 0) {
    for (let index = 0; index < chunkCount; index += 1) {
      jar.delete(`${COOKIE_CHUNK_PREFIX}${index}`);
    }
  }

  jar.delete(COOKIE);
  jar.delete(COOKIE_CHUNKS);
  jar.delete(DRIVE_READY_COOKIE);
  jar.delete(LOCAL_UPDATED_COOKIE);
  jar.delete(LOCAL_DIRTY_COOKIE);
}

export async function hasDriveSyncHydrated(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(DRIVE_READY_COOKIE)?.value === '1';
}

export async function markDriveSyncHydrated(): Promise<void> {
  const jar = await cookies();
  jar.set(DRIVE_READY_COOKIE, '1', { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
}

export async function getCookieSyncMeta(): Promise<{ updatedAt: string | null; dirty: boolean }> {
  const jar = await cookies();
  return {
    updatedAt: jar.get(LOCAL_UPDATED_COOKIE)?.value ?? null,
    dirty: jar.get(LOCAL_DIRTY_COOKIE)?.value === '1',
  };
}

export async function markCookieStoreDirty(updatedAt = new Date().toISOString()): Promise<void> {
  const jar = await cookies();
  jar.set(LOCAL_UPDATED_COOKIE, updatedAt, { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
  jar.set(LOCAL_DIRTY_COOKIE, '1', { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
}

export async function markCookieStoreSynced(updatedAt = new Date().toISOString()): Promise<void> {
  const jar = await cookies();
  jar.set(LOCAL_UPDATED_COOKIE, updatedAt, { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
  jar.set(LOCAL_DIRTY_COOKIE, '0', { maxAge: MAX_AGE, path: '/', sameSite: 'lax' });
}
