"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Nav from "@/components/Nav";

type Thought = {
  id: string;
  when_needed: string;
  mantra: string;
  created_at: string;
  updated_at: string;
};

type SearchResult = Thought & { score: number; reason: string };

export default function Dashboard() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [whenNeeded, setWhenNeeded] = useState("");
  const [mantra, setMantra] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editMantra, setEditMantra] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // chat state
  type ChatItem =
    | { role: "user"; text: string }
    | { role: "bot"; results: SearchResult[]; empty?: boolean };
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/thoughts");
    const j = await res.json();
    setThoughts(j.thoughts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addThought() {
    if (!whenNeeded.trim() || !mantra.trim()) return;
    setAdding(true);
    setAddMsg(null);
    const res = await fetch("/api/thoughts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ when_needed: whenNeeded, mantra }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setAddMsg(j.error || "Failed");
      return;
    }
    const j = await res.json();
    setWhenNeeded("");
    setMantra("");
    if (j.conflicts?.length) {
      setAddMsg(
        `Added. Found ${j.conflicts.length} possible duplicate/conflict — see "Conflicts in KG".`
      );
    } else {
      setAddMsg("Added.");
    }
    load();
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/thoughts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ when_needed: editWhen, mantra: editMantra }),
    });
    if (res.ok) {
      setEditId(null);
      load();
    }
  }

  async function delThought(id: string) {
    if (!confirm("Delete this thought?")) return;
    const res = await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function search() {
    if (!query.trim()) return;
    const q = query;
    setChat((c) => [...c, { role: "user", text: q }]);
    setQuery("");
    setSearching(true);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    setSearching(false);
    if (!res.ok) {
      setChat((c) => [...c, { role: "bot", results: [], empty: true }]);
      return;
    }
    const j = await res.json();
    setChat((c) => [
      ...c,
      { role: "bot", results: j.results ?? [], empty: (j.results ?? []).length === 0 },
    ]);
  }

  const scrollToCard = useCallback((id: string) => {
    setHighlightId(id);
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1500);
  }, []);

  const sorted = useMemo(
    () =>
      [...thoughts].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
    [thoughts]
  );

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-hidden">
        {/* LEFT: thoughts */}
        <section className="border-r border-neutral-900 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-900 space-y-2">
            <h2 className="font-semibold">New thought</h2>
            <input
              value={whenNeeded}
              onChange={(e) => setWhenNeeded(e.target.value)}
              placeholder="When will I need this?"
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-indigo-500"
            />
            <textarea
              value={mantra}
              onChange={(e) => setMantra(e.target.value)}
              placeholder="The mantra"
              rows={3}
              className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={addThought}
                disabled={adding || !whenNeeded.trim() || !mantra.trim()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
              >
                {adding ? "Checking..." : "Add"}
              </button>
              {addMsg && (
                <span className="text-sm text-neutral-400">{addMsg}</span>
              )}
            </div>
          </div>
          <div className="overflow-y-auto p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-neutral-500">
              All thoughts ({sorted.length})
            </h3>
            {loading && (
              <p className="text-sm text-neutral-500">Loading...</p>
            )}
            {!loading && sorted.length === 0 && (
              <p className="text-sm text-neutral-500">No thoughts yet.</p>
            )}
            {sorted.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  cardRefs.current[t.id] = el;
                }}
                className={`rounded-xl border border-neutral-800 bg-neutral-900 p-4 ${
                  highlightId === t.id ? "card-flash border-indigo-500" : ""
                }`}
              >
                {editId === t.id ? (
                  <div className="space-y-2">
                    <input
                      value={editWhen}
                      onChange={(e) => setEditWhen(e.target.value)}
                      className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm"
                    />
                    <textarea
                      value={editMantra}
                      onChange={(e) => setEditMantra(e.target.value)}
                      rows={3}
                      className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(t.id)}
                        className="text-sm rounded bg-indigo-600 px-3 py-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-sm text-neutral-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">
                      When
                    </div>
                    <div className="text-sm mb-2">{t.when_needed}</div>
                    <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">
                      Mantra
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {t.mantra}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                      <span>
                        Updated {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setEditId(t.id);
                            setEditWhen(t.when_needed);
                            setEditMantra(t.mantra);
                          }}
                          className="hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => delThought(t.id)}
                          className="hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT: chat */}
        <section className="flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-900">
            <h2 className="font-semibold">Find a mantra</h2>
            <p className="text-xs text-neutral-500">
              Describe your situation. Get top-3 relevant thoughts.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chat.length === 0 && (
              <p className="text-sm text-neutral-500">
                Ask: &ldquo;I&apos;m overwhelmed by deadlines&rdquo;,
                &ldquo;Feeling stuck creatively&rdquo;...
              </p>
            )}
            {chat.map((item, i) =>
              item.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2 text-sm">
                    {item.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  {item.empty ? (
                    <div className="text-sm text-neutral-500">
                      No relevant thoughts found.
                    </div>
                  ) : (
                    item.results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => scrollToCard(r.id)}
                        className="block w-full text-left rounded-xl border border-neutral-800 bg-neutral-900 hover:border-indigo-500 transition p-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-indigo-400 uppercase tracking-wider">
                            When
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {(r.score * 100).toFixed(0)}% match
                          </div>
                        </div>
                        <div className="text-sm mb-1">{r.when_needed}</div>
                        <div className="text-xs text-neutral-400 whitespace-pre-wrap line-clamp-3">
                          {r.mantra}
                        </div>
                        {r.reason && (
                          <div className="mt-2 text-[11px] text-neutral-500 italic">
                            {r.reason}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )
            )}
            {searching && (
              <div className="text-sm text-neutral-500">Searching...</div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
            className="p-4 border-t border-neutral-900 flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe your situation..."
              className="flex-1 rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-indigo-500"
            />
            <button
              disabled={searching || !query.trim()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
