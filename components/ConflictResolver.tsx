'use client';

import { FormEvent, useState } from 'react';
import type { ThoughtConflict } from '@/lib/thought-types';

export function ConflictResolver({ initialConflicts }: { initialConflicts: ThoughtConflict[] }) {
  const [conflicts, setConflicts] = useState(initialConflicts);
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState('');

  async function resolve(event: FormEvent<HTMLFormElement>, conflict: ThoughtConflict) {
    event.preventDefault();
    setError('');
    setPendingId(conflict.id);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch(`/api/conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needWhen: form.get('needWhen'),
          mantra: form.get('mantra'),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Unable to resolve conflict.');
        return;
      }
      setConflicts((current) => current.filter((item) => item.id !== conflict.id));
    } finally {
      setPendingId('');
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Conflicts in KG</h1>
        <p className="mt-1 text-sm text-slate-600">Review duplicate or conflicting thought pairs and merge them.</p>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="space-y-4">
        {conflicts.map((conflict) => (
          <article key={conflict.id} className="panel space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-brand-soft bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Existing card</p>
                <p className="mt-3 text-sm font-semibold">When will need this?</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{conflict.existingNeedWhen}</p>
                <p className="mt-3 text-sm font-semibold">The mantra.</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{conflict.existingMantra}</p>
              </div>
              <div className="rounded-lg border border-brand-soft bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase text-amber-700">New candidate</p>
                <p className="mt-3 text-sm font-semibold">When will need this?</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{conflict.candidateNeedWhen}</p>
                <p className="mt-3 text-sm font-semibold">The mantra.</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{conflict.candidateMantra}</p>
              </div>
            </div>

            <form className="grid gap-3 rounded-lg border border-brand-soft bg-white p-4" onSubmit={(event) => void resolve(event, conflict)}>
              <label className="grid gap-1 text-sm font-semibold">
                Merged: when will need this?
                <textarea
                  name="needWhen"
                  className="min-h-24 rounded-lg border border-brand-soft p-3 text-sm font-normal"
                  defaultValue={conflict.existingNeedWhen || conflict.candidateNeedWhen}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Merged: the mantra.
                <textarea
                  name="mantra"
                  className="min-h-24 rounded-lg border border-brand-soft p-3 text-sm font-normal"
                  defaultValue={conflict.existingMantra || conflict.candidateMantra}
                />
              </label>
              <button type="submit" className="btn-accent w-fit" disabled={pendingId === conflict.id}>
                {pendingId === conflict.id ? 'Resolving...' : 'Save Merged Version'}
              </button>
            </form>
          </article>
        ))}

        {!conflicts.length ? (
          <div className="panel text-sm text-slate-600">No open conflicts.</div>
        ) : null}
      </div>
    </section>
  );
}
