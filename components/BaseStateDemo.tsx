'use client';

import { useState } from 'react';
import type { BaseStore } from '@/lib/base-types';
import { BASE_STATE_CHANGED_EVENT } from '@/lib/constants';

export function BaseStateDemo({ initialState }: { initialState: BaseStore }) {
  const [state, setState] = useState<BaseStore>(initialState);
  const [pending, setPending] = useState(false);
  const [thoughtInput, setThoughtInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatRefs, setChatRefs] = useState<
    Array<{ insightId: string; thoughtId: string; problem: string; solution: string; sourceThought: string; score: number }>
  >([]);

  async function persist(body: Record<string, unknown>) {
    setPending(true);
    try {
      const res = await fetch('/api/base/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const saved = (await res.json()) as BaseStore;
      setState(saved);
      window.dispatchEvent(new CustomEvent(BASE_STATE_CHANGED_EVENT));
    } finally {
      setPending(false);
    }
  }

  async function submitThought() {
    const content = thoughtInput.trim();
    if (!content) return;
    await persist({ action: 'add_thought', content });
    setThoughtInput('');
  }

  async function rebuildInsights() {
    await persist({ action: 'rebuild_insights' });
  }

  async function askWiki() {
    const q = query.trim();
    if (!q) return;
    setPending(true);
    try {
      const res = await fetch('/api/wiki/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, apiKey }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        answer: string;
        references: Array<{
          insightId: string;
          thoughtId: string;
          problem: string;
          solution: string;
          sourceThought: string;
          score: number;
        }>;
      };
      setChatAnswer(data.answer);
      setChatRefs(data.references ?? []);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel space-y-3">
        <h2 className="text-lg font-semibold">Layer 1: Thought Cards</h2>
        <p className="text-sm text-slate-600">Capture raw thoughts in order. Latest appears at top.</p>
        <textarea
          className="w-full rounded-xl border border-brand-soft p-3"
          rows={4}
          value={thoughtInput}
          onChange={(event) => setThoughtInput(event.target.value)}
          placeholder="Write your thought..."
        />
        <button type="button" className="btn-accent" disabled={pending} onClick={() => void submitThought()}>
          Add Thought
        </button>
        <div className="space-y-2">
          {state.thoughts
            .slice()
            .reverse()
            .map((thought) => (
              <article key={thought.id} className="rounded-xl border border-brand-soft bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{new Date(thought.createdAt).toLocaleString()}</div>
                <div className="mt-1 break-words text-sm font-medium text-slate-800">{thought.content}</div>
                <div className="mt-1 break-all text-xs text-slate-500">ID: {thought.id}</div>
              </article>
            ))}
        </div>
      </section>

      <section className="panel space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Layer 2: Problem-Solution Cards</h2>
          <button type="button" className="btn" disabled={pending} onClick={() => void rebuildInsights()}>
            Rebuild
          </button>
        </div>
        <p className="text-sm text-slate-600">Derived action cards from your thoughts, each linked to source thought.</p>
        <div className="space-y-2">
          {state.insights
            .slice()
            .reverse()
            .map((insight) => (
              <article key={insight.id} className="rounded-xl border border-brand-soft bg-white p-3">
                <p className="text-sm">
                  <span className="font-semibold">Problem:</span> {insight.problem}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Solution:</span> {insight.solution}
                </p>
                <p className="mt-1 break-all text-xs text-slate-500">Source Thought: {insight.thoughtId}</p>
              </article>
            ))}
        </div>
      </section>

      <section className="panel space-y-3">
        <h2 className="text-lg font-semibold">Layer 3: AI Recall Chat</h2>
        <p className="text-sm text-slate-600">Ask a problem. AI responds with reasoning and referenced mid-layer cards.</p>
        <input
          className="w-full rounded-xl border border-brand-soft p-3 text-sm"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="OpenAI API key (kept in this tab only)"
        />
        <textarea
          className="w-full rounded-xl border border-brand-soft p-3"
          rows={3}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Describe your current problem..."
        />
        <button type="button" className="btn-accent" disabled={pending} onClick={() => void askWiki()}>
          Ask
        </button>

        {chatAnswer ? <div className="rounded-xl border border-brand-soft bg-slate-50 p-3 text-sm">{chatAnswer}</div> : null}

        {chatRefs.length ? (
          <div className="space-y-2">
            {chatRefs.map((ref) => (
              <article key={ref.insightId} className="rounded-xl border border-brand-soft bg-white p-3 text-sm">
                <p>
                  <span className="font-semibold">Problem:</span> {ref.problem}
                </p>
                <p>
                  <span className="font-semibold">Solution:</span> {ref.solution}
                </p>
                <p className="break-all text-xs text-slate-500">Insight ID: {ref.insightId}</p>
                <p className="break-all text-xs text-slate-500">Source Thought ID: {ref.thoughtId}</p>
                <p className="mt-1 break-words text-xs text-slate-600">Source: {ref.sourceThought}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
