import type { BaseStore } from '@/lib/base-types';
import { readDriveBaseStore, writeDriveBaseStore } from '@/lib/base-drive';
import {
  getCookieBaseStore,
  getCookieSyncMeta,
  hasDriveSyncHydrated,
  markCookieStoreSynced,
  markDriveSyncHydrated,
  setCookieBaseStore,
} from '@/lib/base-store';
import { getSession } from '@/lib/session';

function sameStore(a: BaseStore, b: BaseStore): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function GET() {
  const session = await getSession();
  if (!session?.accessToken) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  let cookieStore: BaseStore = { sampleCounter: 0, lastNote: '' };
  let driveData = null;
  let localMeta = { updatedAt: null as string | null, dirty: false };
  try {
    [cookieStore, driveData, localMeta] = await Promise.all([
      getCookieBaseStore(),
      readDriveBaseStore(session.accessToken),
      getCookieSyncMeta(),
    ]);
  } catch {
    return Response.json({ error: 'Failed to read Drive sync state' }, { status: 502 });
  }

  const driveStore: BaseStore = driveData
    ? { sampleCounter: driveData.sampleCounter, lastNote: driveData.lastNote }
    : { sampleCounter: 0, lastNote: '' };

  return Response.json({
    initialized: await hasDriveSyncHydrated(),
    synced: sameStore(cookieStore, driveStore) && !localMeta.dirty,
    updatedAt: driveData?.updatedAt ?? null,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session?.accessToken) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  const cookieStore = await getCookieBaseStore();
  const localMeta = await getCookieSyncMeta();

  try {
    const driveData = await readDriveBaseStore(session.accessToken);

    if (driveData && !localMeta.dirty) {
      const driveStore: BaseStore = {
        sampleCounter: driveData.sampleCounter,
        lastNote: driveData.lastNote,
      };
      const replacedLocal = !sameStore(cookieStore, driveStore);

      await setCookieBaseStore(driveStore);
      await markCookieStoreSynced(driveData.updatedAt);
      await markDriveSyncHydrated();

      return Response.json({
        ok: true,
        initialized: true,
        driveWins: true,
        replacedLocal,
        updatedAt: driveData.updatedAt,
      });
    }

    const syncedAt = await writeDriveBaseStore(session.accessToken, cookieStore);
    await markCookieStoreSynced(syncedAt);
    await markDriveSyncHydrated();

    return Response.json({
      ok: true,
      initialized: true,
      seededFromLocal: true,
      updatedAt: syncedAt,
    });
  } catch {
    return Response.json({ error: 'Failed to write Drive sync state' }, { status: 502 });
  }
}

export async function PUT() {
  const session = await getSession();
  if (!session?.accessToken) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  let driveData = null;
  try {
    driveData = await readDriveBaseStore(session.accessToken);
  } catch {
    return Response.json({ error: 'Failed to pull base data from Drive' }, { status: 502 });
  }

  if (!driveData) {
    await markDriveSyncHydrated();
    return Response.json({ ok: true, initialized: true });
  }

  await setCookieBaseStore({
    sampleCounter: driveData.sampleCounter,
    lastNote: driveData.lastNote,
  });
  await markCookieStoreSynced(driveData.updatedAt);
  await markDriveSyncHydrated();
  return Response.json({ ok: true, initialized: true });
}
