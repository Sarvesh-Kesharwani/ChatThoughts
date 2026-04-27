'use client';

import { useState } from 'react';
import type { BaseStore } from '@/lib/base-types';
import { BASE_STATE_CHANGED_EVENT } from '@/lib/constants';

export function BaseStateDemo({ initialState }: { initialState: BaseStore }) {
  const [state, setState] = useState<BaseStore>(initialState);
  const [pending, setPending] = useState(false);

  async function persist(next: BaseStore) {
    setPending(true);
    try {
      const res = await fetch('/api/base/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) return;
      const saved = (await res.json()) as BaseStore;
      setState(saved);
      window.dispatchEvent(new CustomEvent(BASE_STATE_CHANGED_EVENT));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel space-y-4">
      <h2 className="text-lg font-semibold">Base state placeholder</h2>
      <p className="text-sm text-slate-600">
        Replace this with your business modules. Auth and Drive sync are already wired.
      </p>

      <div className="chip">Counter: {state.sampleCounter}</div>

      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => void persist({ ...state, sampleCounter: state.sampleCounter + 1 })}
      >
        Increment counter
      </button>

      <label className="block text-sm font-medium" htmlFor="base-note">
        Note
      </label>
      <textarea
        id="base-note"
        className="w-full rounded-xl border border-brand-soft p-3"
        rows={4}
        value={state.lastNote}
        onChange={(event) => setState((prev) => ({ ...prev, lastNote: event.target.value }))}
      />

      <button type="button" className="btn-accent" disabled={pending} onClick={() => void persist(state)}>
        Save note
      </button>
    </div>
  );
}
