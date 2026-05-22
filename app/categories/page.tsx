"use client";

import { useMemo, useState } from "react";
import Nav from "@/components/Nav";

type Thought = {
  id: string;
  raw: string | null;
  augmented: Record<string, unknown> | null;
  when_needed: string | null;
  mantra: string | null;
  updated_at: string;
};

type ThoughtLabel = {
  id: string;
  title: string;
  tags: string[];
};

type Category = {
  name: string;
  kind: "existing" | "new";
  thought_ids: string[];
  reason: string;
};

function shortOf(t: Thought) {
  const aug = t.augmented ?? {};
  return (
    (typeof aug.short === "string" && aug.short) ||
    (typeof aug.title === "string" && aug.title) ||
    t.mantra ||
    t.raw ||
    ""
  );
}

export default function CategoriesPage() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [labels, setLabels] = useState<ThoughtLabel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function categorize() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/categories", { method: "POST" });
    setLoading(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to categorize thoughts.");
      return;
    }
    setThoughts(json.thoughts ?? []);
    setLabels(json.thought_labels ?? []);
    setCategories(json.categories ?? []);
    setSelected(json.categories?.[0]?.name ?? "");
  }

  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels]
  );
  const thoughtById = useMemo(
    () => new Map(thoughts.map((thought) => [thought.id, thought])),
    [thoughts]
  );
  const active = categories.find((category) => category.name === selected) ?? null;
  const activeThoughts =
    active?.thought_ids
      .map((id) => thoughtById.get(id))
      .filter((thought): thought is Thought => Boolean(thought)) ?? [];

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
            <p className="text-sm text-slate-500">
              AI groups thoughts by generated titles and tags, reusing existing
              categories when possible.
            </p>
          </div>
          <button
            onClick={categorize}
            disabled={loading}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            {loading ? "Categorizing..." : "AI categorize thoughts"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {categories.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Run AI categorization to build category groups from your saved
            thoughts.
          </div>
        )}

        {categories.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <aside className="rounded-xl border border-slate-200 bg-white p-3 h-fit">
              <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
                Categories ({categories.length})
              </div>
              <div className="space-y-1">
                {categories.map((category) => (
                  <button
                    key={category.name}
                    onClick={() => setSelected(category.name)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                      selected === category.name
                        ? "bg-indigo-50 text-indigo-700"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{category.name}</span>
                      <span
                        className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded-full ${
                          category.kind === "existing"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {category.kind}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {category.thought_ids.length} thoughts
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="space-y-3">
              {active && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-slate-900">{active.name}</h2>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {active.kind}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{active.reason}</p>
                </div>
              )}

              {activeThoughts.map((thought) => {
                const label = labelById.get(thought.id);
                return (
                  <article
                    key={thought.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-slate-900">
                          {label?.title || shortOf(thought)}
                        </h3>
                        {label?.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {label.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {new Date(thought.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {shortOf(thought)}
                    </p>
                    {thought.raw && (
                      <details className="mt-3">
                        <summary className="text-[11px] text-slate-500 cursor-pointer">
                          Original raw text
                        </summary>
                        <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">
                          {thought.raw}
                        </div>
                      </details>
                    )}
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
