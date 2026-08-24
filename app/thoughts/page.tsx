"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";

type Thought = {
  id: string;
  raw: string | null;
  augmented: Record<string, unknown> | null;
  when_needed: string | null;
  mantra: string | null;
  created_at: string;
  updated_at: string;
};

type Field = { key: string; label: string };
type OutputSchema = { fields: Field[] };

function fieldLabel(schema: OutputSchema | null, key: string) {
  return (
    schema?.fields.find((field) => field.key === key)?.label ??
    key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function shortThought(thought: Thought) {
  const value = thought.augmented?.short;
  if (typeof value === "string" && value.trim()) return value;
  return thought.mantra || thought.raw || "Untitled thought";
}

function renderValue(value: unknown) {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-2">
        {value.map((item, index) => (
          <span key={index} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
            {String(item)}
          </span>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(value)}</p>;
}

export default function AllThoughtsPage() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [schema, setSchema] = useState<OutputSchema | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [thoughtsResponse, settingsResponse] = await Promise.all([
        fetch("/api/thoughts"),
        fetch("/api/settings"),
      ]);
      if (!thoughtsResponse.ok || !settingsResponse.ok) throw new Error("Could not load thoughts.");
      const [thoughtsJson, settingsJson] = await Promise.all([
        thoughtsResponse.json(),
        settingsResponse.json(),
      ]);
      setThoughts(thoughtsJson.thoughts ?? []);
      setSchema(settingsJson.output_schema ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load thoughts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...thoughts].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [thoughts]
  );

  useEffect(() => {
    if (!selectedId && sorted.length) setSelectedId(sorted[0].id);
  }, [selectedId, sorted]);

  const selected = sorted.find((thought) => thought.id === selectedId) ?? null;
  const detailKeys = selected
    ? [
        ...(schema?.fields.map((field) => field.key) ?? []),
        ...Object.keys(selected.augmented ?? {}).filter(
          (key) => !schema?.fields.some((field) => field.key === key)
        ),
      ]
    : [];

  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(280px,38%)_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-4 py-4">
            <h1 className="font-semibold text-slate-900">All thoughts ({sorted.length})</h1>
            <p className="mt-1 text-xs text-slate-500">Select a shortened thought to view its full details.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {loading && <p className="p-2 text-sm text-slate-500">Loading...</p>}
            {error && <p className="p-2 text-sm text-red-600">{error}</p>}
            {!loading && !error && sorted.length === 0 && (
              <p className="p-2 text-sm text-slate-500">No thoughts yet.</p>
            )}
            {sorted.map((thought) => {
              const active = thought.id === selectedId;
              return (
                <button
                  key={thought.id}
                  onClick={() => setSelectedId(thought.id)}
                  className={`block w-full rounded-xl border p-3 text-left text-sm leading-5 transition ${
                    active
                      ? "border-indigo-400 bg-indigo-50 text-indigo-950 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                  }`}
                >
                  {shortThought(thought)}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto bg-white p-5 md:p-8">
          {!selected && !loading && (
            <div className="grid h-full place-items-center text-sm text-slate-500">Select a thought.</div>
          )}
          {selected && (
            <article className="mx-auto max-w-3xl">
              <div className="mb-6 border-b border-slate-200 pb-5">
                <p className="text-[11px] uppercase tracking-wider text-indigo-600">Thought details</p>
                <h2 className="mt-2 text-xl font-semibold leading-8 text-slate-900">{shortThought(selected)}</h2>
                <p className="mt-2 text-xs text-slate-500">
                  Updated {new Date(selected.updated_at).toLocaleString()}
                </p>
              </div>

              <div className="space-y-6">
                {selected.augmented
                  ? detailKeys.map((key) => {
                      const value = selected.augmented?.[key];
                      if (value == null || value === "") return null;
                      return (
                        <section key={key}>
                          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-indigo-600">
                            {fieldLabel(schema, key)}
                          </h3>
                          {renderValue(value)}
                        </section>
                      );
                    })
                  : (
                    <>
                      {selected.when_needed && (
                        <section>
                          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-indigo-600">When</h3>
                          {renderValue(selected.when_needed)}
                        </section>
                      )}
                      {selected.mantra && (
                        <section>
                          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-indigo-600">Mantra</h3>
                          {renderValue(selected.mantra)}
                        </section>
                      )}
                    </>
                  )}

                {selected.raw && (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Original raw text</h3>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.raw}</p>
                  </section>
                )}
              </div>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}
