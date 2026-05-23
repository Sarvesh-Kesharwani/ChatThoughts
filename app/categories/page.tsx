"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type CategoryState = {
  thoughts: Thought[];
  thought_labels: ThoughtLabel[];
  categories: Category[];
  uncategorized_ids: string[];
  uncategorized_count: number;
  processed_count?: number;
};

const UNCATEGORIZED = "__uncategorized";

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
  const [uncategorizedIds, setUncategorizedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState(UNCATEGORIZED);
  const [loading, setLoading] = useState(true);
  const [categorizing, setCategorizing] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback((json: CategoryState) => {
    setThoughts(json.thoughts ?? []);
    setLabels(json.thought_labels ?? []);
    setCategories(json.categories ?? []);
    setUncategorizedIds(json.uncategorized_ids ?? []);
    const nextSelected =
      (json.uncategorized_count ?? 0) > 0
        ? UNCATEGORIZED
        : json.categories?.[0]?.name ?? UNCATEGORIZED;
    setSelected((current) => {
      if (current === UNCATEGORIZED && (json.uncategorized_count ?? 0) > 0) {
        return current;
      }
      if (json.categories?.some((category) => category.name === current)) {
        return current;
      }
      return nextSelected;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/categories");
    setLoading(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to load saved categories.");
      return;
    }
    applyState(json);
  }, [applyState]);

  useEffect(() => {
    load();
  }, [load]);

  async function categorize() {
    setCategorizing(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/categories", { method: "POST" });
    setCategorizing(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to categorize thoughts.");
      return;
    }
    applyState(json);
    const processed = json.processed_count ?? 0;
    setMessage(
      processed > 0
        ? `Categorized ${processed} uncategorized thoughts.`
        : "No uncategorized thoughts left."
    );
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setSavingCategory(true);
    setError(null);
    setMessage(null);
    const names = [...categories.map((category) => category.name), name];
    const res = await fetch("/api/categories", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categories: names }),
    });
    setSavingCategory(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to save category.");
      return;
    }
    setNewCategory("");
    applyState(json);
    setMessage(`Added category "${name}".`);
  }

  async function deleteCategory(name: string) {
    if (!confirm(`Delete category "${name}"? Thoughts in it will become uncategorized.`)) {
      return;
    }
    setSavingCategory(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/categories", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSavingCategory(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Failed to delete category.");
      return;
    }
    applyState(json);
    setMessage(`Deleted category "${name}".`);
  }

  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels]
  );
  const thoughtById = useMemo(
    () => new Map(thoughts.map((thought) => [thought.id, thought])),
    [thoughts]
  );
  const uncategorizedThoughts = useMemo(
    () =>
      uncategorizedIds
        .map((id) => thoughtById.get(id))
        .filter((thought): thought is Thought => Boolean(thought)),
    [thoughtById, uncategorizedIds]
  );
  const active = categories.find((category) => category.name === selected) ?? null;
  const activeThoughts =
    selected === UNCATEGORIZED
      ? uncategorizedThoughts
      : active?.thought_ids
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
              Create categories first. AI assigns uncategorized thoughts only to
              your saved category names.
            </p>
          </div>
          <button
            onClick={categorize}
            disabled={
              loading ||
              categorizing ||
              uncategorizedIds.length === 0 ||
              categories.length === 0
            }
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            {categorizing
              ? "Categorizing..."
              : uncategorizedIds.length
                ? categories.length
                  ? `AI categorize ${uncategorizedIds.length} uncategorized`
                  : "Add categories first"
                : "All thoughts categorized"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Loading saved categories...</p>}

        {!loading && thoughts.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            No thoughts yet.
          </div>
        )}

        {!loading && thoughts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <aside className="rounded-xl border border-slate-200 bg-white p-3 h-fit">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addCategory();
                }}
                className="mb-3 space-y-2"
              >
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  User categories
                </div>
                <div className="flex gap-2">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Add category"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                  />
                  <button
                    disabled={savingCategory || !newCategory.trim()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </form>
              <div className="space-y-1">
                <button
                  onClick={() => setSelected(UNCATEGORIZED)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                    selected === UNCATEGORIZED
                      ? "bg-indigo-50 text-indigo-700"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">Uncategorized</span>
                    <span className="shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      queue
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {uncategorizedIds.length} thoughts
                  </div>
                </button>

                {categories.map((category) => (
                  <div
                    key={category.name}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                      selected === category.name
                        ? "bg-indigo-50 text-indigo-700"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(category.name)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{category.name}</span>
                        <span className="shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          user
                        </span>
                      </div>
                    </button>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => setSelected(category.name)}
                        className="text-left"
                      >
                        {category.thought_ids.length} thoughts
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(category.name)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="space-y-3">
              {selected === UNCATEGORIZED ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="font-semibold text-slate-900">Uncategorized</h2>
                  <p className="text-sm text-slate-500">
                    These thoughts are the only ones sent to AI on the next run.
                  </p>
                </div>
              ) : active ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-slate-900">{active.name}</h2>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      user
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    AI can place uncategorized thoughts here because you created
                    this category.
                  </p>
                </div>
              ) : null}

              {activeThoughts.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  No thoughts in this group.
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
