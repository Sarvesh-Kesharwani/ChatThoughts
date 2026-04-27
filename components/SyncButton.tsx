'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BASE_STATE_CHANGED_EVENT } from '@/lib/constants';

type SyncState = 'loading' | 'synced' | 'unsynced' | 'syncing' | 'no-auth';
const PULLED_KEY = 'base_drive_pulled';

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>('loading');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const checkingRef = useRef(false);

  const checkSync = useCallback(async () => {
    if (syncingRef.current || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const r = await fetch('/api/drive/sync');
      if (r.status === 401) return setState('no-auth');
      if (!r.ok) return setState('unsynced');
      const data = await r.json();
      setState(data.synced ? 'synced' : 'unsynced');
      setLastSynced(data.updatedAt || null);
    } catch {
      setState('unsynced');
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const pushSync = useCallback(
    async (background = false) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      if (!background) setState('syncing');
      try {
        const r = await fetch('/api/drive/sync', { method: 'POST' });
        if (r.status === 401) return setState('no-auth');
        if (!r.ok) return setState('unsynced');
        const data = await r.json();
        sessionStorage.setItem(PULLED_KEY, '1');
        setLastSynced(data.updatedAt || new Date().toISOString());
        setState('synced');
        if (data.replacedLocal) router.refresh();
      } catch {
        setState('unsynced');
      } finally {
        syncingRef.current = false;
      }
    },
    [router],
  );

  useEffect(() => {
    if (sessionStorage.getItem(PULLED_KEY)) return void checkSync();
    fetch('/api/drive/sync', { method: 'PUT' })
      .then((r) => {
        if (r.status === 401) return setState('no-auth');
        if (!r.ok) return setState('unsynced');
        sessionStorage.setItem(PULLED_KEY, '1');
        void checkSync();
        router.refresh();
      })
      .catch(() => void checkSync());
  }, [checkSync, router]);

  useEffect(() => {
    const onStateChanged = () => {
      setLastSynced(null);
      setState('unsynced');
      void pushSync(true);
    };
    window.addEventListener(BASE_STATE_CHANGED_EVENT, onStateChanged);
    return () => window.removeEventListener(BASE_STATE_CHANGED_EVENT, onStateChanged);
  }, [pushSync]);

  useEffect(() => {
    if (state === 'no-auth') return;
    const id = setInterval(() => void checkSync(), 30000);
    return () => clearInterval(id);
  }, [checkSync, state]);

  if (state === 'no-auth') return null;

  const isSynced = state === 'synced';
  const isSyncing = state === 'syncing' || state === 'loading';
  const label = isSyncing ? 'Syncing' : isSynced ? 'Synced' : 'Sync now';
  const title = isSyncing
    ? 'Syncing with Google Drive...'
    : isSynced
      ? `Synced with Drive${lastSynced ? ' at ' + new Date(lastSynced).toLocaleTimeString() : ''}`
      : 'Not synced. Click to sync now.';

  return (
    <button
      onClick={!isSynced && !isSyncing ? () => void pushSync() : undefined}
      title={title}
      disabled={isSyncing}
      className={[
        'btn',
        isSyncing ? 'cursor-wait opacity-70' : '',
        isSynced ? 'border-green-300 bg-green-50 text-green-700' : '',
        !isSynced && !isSyncing ? 'border-red-300 bg-red-50 text-red-700' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
