'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import type { ThoughtCard, ThoughtSearchResult } from '@/lib/thought-types';

export function ThoughtDashboard({ initialThoughts }: { initialThoughts: ThoughtCard[] }) {
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [needWhen, setNeedWhen] = useState('');
  const [mantra, setMantra] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ThoughtSearchResult[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);

  const orderedThoughts = useMemo(
    () =>
      thoughts
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [thoughts],
  );

  async function refreshThoughts() {
    const res = await fetch('/api/thoughts');
    if (!res.ok) return;
    const data = (await res.json()) as { thoughts?: ThoughtCard[] };
    setThoughts(data.thoughts ?? []);
  }

  async function addThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setPending(true);
    try {
      const res = await fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needWhen, mantra }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: 'created' | 'conflict';
        thought?: ThoughtCard;
        conflicts?: unknown[];
      };

      if (data.status === 'conflict') {
        setNotice('A possible duplicate or conflict was sent to Conflicts in KG.');
        return;
      }

      if (!res.ok || !data.thought) {
        setError(data.error ?? 'Unable to add thought.');
        return;
      }

      setNeedWhen('');
      setMantra('');
      setThoughts((current) => [data.thought!, ...current.filter((thought) => thought.id !== data.thought!.id)]);
    } finally {
      setPending(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError('');
    setNotice('');
    setSearching(true);
    try {
      const res = await fetch('/api/wiki/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; results?: ThoughtSearchResult[] };
      if (!res.ok) {
        setError(data.error ?? 'Search failed.');
        return;
      }
      setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  function scrollToThought(id: string) {
    document.getElementById(`thought-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <section className="panel space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Thoughts</h1>
            <p className="text-sm text-slate-600">Latest updated cards appear first.</p>
          </div>
          <button type="button" className="btn" onClick={() => void refreshThoughts()}>
            Refresh
          </button>
        </div>

        <form className="rounded-lg border border-brand-soft bg-slate-50 p-4" onSubmit={addThought}>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              When will need this?
              <textarea
                className="min-h-24 rounded-lg border border-brand-soft p-3 text-sm font-normal"
                value={needWhen}
                onChange={(event) => setNeedWhen(event.target.value)}
                placeholder="Situation, issue, or future context..."
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              The mantra.
              <textarea
                className="min-h-24 rounded-lg border border-brand-soft p-3 text-sm font-normal"
                value={mantra}
                onChange={(event) => setMantra(event.target.value)}
                placeholder="The concise thought or mantra to recall..."
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-accent" disabled={pending}>
                {pending ? 'Checking...' : 'Add Thought'}
              </button>
              {notice ? (
                <Link className="text-sm font-semibold text-blue-700 underline" href="/conflicts">
                  {notice}
                </Link>
              ) : null}
            </div>
          </div>
        </form>

        {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="space-y-3">
          {orderedThoughts.map((thought) => (
            <article
              id={`thought-${thought.id}`}
              key={thought.id}
              className="rounded-lg border border-brand-soft bg-white p-4 scroll-mt-28 target:border-blue-400 target:bg-blue-50"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <time className="text-xs font-medium text-slate-500">
                  Updated {new Date(thought.updatedAt).toLocaleString()}
                </time>
                <span className="break-all text-xs text-slate-400">{thought.id}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">When will need this?</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{thought.needWhen}</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">The mantra.</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-base font-semibold text-brand-ink">
                {thought.mantra}
              </p>
            </article>
          ))}
          {!orderedThoughts.length ? (
            <div className="rounded-lg border border-dashed border-brand-soft p-5 text-sm text-slate-500">
              No thoughts stored yet.
            </div>
          ) : null}
        </div>
      </section>

      <aside className="panel h-fit space-y-4 lg:sticky lg:top-24">
        <div>
          <h2 className="text-lg font-semibold">Search Mantras</h2>
          <p className="text-sm text-slate-600">Results return only the top matching thought cards.</p>
        </div>
        <form className="space-y-3" onSubmit={search}>
          <textarea
            className="min-h-28 w-full rounded-lg border border-brand-soft p-3 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What issue are you facing?"
          />
          <button type="submit" className="btn-accent w-full" disabled={searching}>
            {searching ? 'Searching...' : 'Find Top 3'}
          </button>
        </form>

        <div className="space-y-3">
          {results.map((result, index) => (
            <a
              key={result.thought.id}
              href={`#thought-${result.thought.id}`}
              onClick={() => scrollToThought(result.thought.id)}
              className="block rounded-lg border border-brand-soft bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-blue-700">Match {index + 1}</span>
                <span className="text-xs text-slate-500">{Math.round(result.score)}%</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700">When will need this?</p>
              <p className="mt-1 line-clamp-3 text-sm text-slate-800">{result.thought.needWhen}</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">The mantra.</p>
              <p className="mt-1 line-clamp-3 text-sm font-semibold text-brand-ink">{result.thought.mantra}</p>
              {result.reason ? <p className="mt-3 text-xs text-slate-500">{result.reason}</p> : null}
            </a>
          ))}
          {query && !searching && !results.length ? (
            <div className="rounded-lg border border-dashed border-brand-soft p-4 text-sm text-slate-500">
              No matching thoughts found.
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
