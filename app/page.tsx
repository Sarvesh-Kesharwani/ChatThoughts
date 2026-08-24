"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

type SearchResult = Thought & { score: number; reason: string };

type Field = { key: string; label: string; type: "string" | "array"; options?: string[] };
type OutputSchema = { fields: Field[] };

const DRAFT_KEY = "chatthoughts:draft:raw";
const OBSERVATION_CHANNELS = ["Study", "GameDev", "Relaxation/Sleep", "Gym", "English", "General"] as const;
type ObservationChannel = (typeof OBSERVATION_CHANNELS)[number];

function labelFor(schema: OutputSchema | null, key: string) {
  const f = schema?.fields.find((x) => x.key === key);
  if (f) return f.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(v: unknown) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {v.map((x, i) => (
          <span
            key={i}
            className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
          >
            {String(x)}
          </span>
        ))}
      </div>
    );
  }
  if (typeof v === "object") {
    return (
      <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  }
  return <div className="text-sm whitespace-pre-wrap text-slate-700">{String(v)}</div>;
}

export default function ThoughtsPage() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [schema, setSchema] = useState<OutputSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [raw, setRaw] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRaw, setEditRaw] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draftLoaded = useRef(false);

  type ChatItem =
    | { role: "user"; text: string }
    | { role: "bot"; results: SearchResult[]; empty?: boolean };
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [moveTargets, setMoveTargets] = useState<Record<string, ObservationChannel>>({});
  const [movingId, setMovingId] = useState<string | null>(null);

  // Load draft on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const d = localStorage.getItem(DRAFT_KEY);
    if (d) setRaw(d);
    draftLoaded.current = true;
  }, []);

  // Save draft whenever raw changes (after initial load).
  useEffect(() => {
    if (!draftLoaded.current || typeof window === "undefined") return;
    if (raw) localStorage.setItem(DRAFT_KEY, raw);
    else localStorage.removeItem(DRAFT_KEY);
  }, [raw]);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      fetch("/api/thoughts"),
      fetch("/api/settings"),
    ]);
    const tJson = await tRes.json();
    const sJson = await sRes.json();
    setThoughts(tJson.thoughts ?? []);
    setSchema(sJson.output_schema ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addThought() {
    if (!raw.trim()) return;
    setAdding(true);
    setAddMsg(null);
    const res = await fetch("/api/thoughts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setAddMsg(j.error || "Failed");
      return;
    }
    const j = await res.json();
    setRaw("");
    if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY);
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
      body: JSON.stringify({ raw: editRaw }),
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

  async function moveToObservation(thought: Thought) {
    const channel = moveTargets[thought.id] ?? "Study";
    setMovingId(thought.id); setAddMsg(null);
    const res = await fetch(`/api/thoughts/${thought.id}/move-to-observation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel }) });
    const json = await res.json().catch(() => ({}));
    setMovingId(null);
    if (!res.ok) { setAddMsg(json.error || "Could not move thought."); return; }
    setAddMsg(`Thought moved to Observation/Strategy Updates → ${channel}.${json.needs_review ? " Conflicts need review." : ""}`);
    load();
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

  function renderAugmented(t: Thought) {
    const aug = t.augmented ?? {};
    const keys = schema?.fields.map((f) => f.key) ?? Object.keys(aug);
    const extraKeys = Object.keys(aug).filter((k) => !keys.includes(k));
    const allKeys = [...keys, ...extraKeys];
    return (
      <div className="space-y-3">
        {allKeys.map((k) => {
          const v = (aug as Record<string, unknown>)[k];
          if (v == null) return null;
          return (
            <div key={k}>
              <div className="text-[10px] text-indigo-600 uppercase tracking-wider mb-1">
                {labelFor(schema, k)}
              </div>
              {renderValue(v)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <div className="grid grid-cols-1 md:grid-cols-2 flex-1 overflow-hidden bg-slate-50">
        {/* LEFT */}
        <section className="contents">
          <div className="p-6 border-r border-slate-200 space-y-2 bg-white overflow-y-auto">
            <h2 className="font-semibold text-slate-900">New thought</h2>
            <p className="text-xs text-slate-500">
              Just dump it raw. AI will structure it on save. Draft autosaves.
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Type what's on your mind..."
              rows={5}
              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={addThought}
                disabled={adding || !raw.trim()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
              >
                {adding ? "Processing..." : "Add"}
              </button>
              {raw.trim() && !adding && (
                <span className="text-xs text-slate-500">Draft saved</span>
              )}
              {addMsg && (
                <span className="text-sm text-slate-500">{addMsg}</span>
              )}
            </div>
          </div>
          <div className="overflow-y-auto p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs uppercase tracking-wider text-slate-500">
                All thoughts ({sorted.length})
              </h3>
              <Link
                href="/thoughts"
                className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
              >
                View all
              </Link>
            </div>
            {loading && <p className="text-sm text-slate-500">Loading...</p>}
            {!loading && sorted.length === 0 && (
              <p className="text-sm text-slate-500">No thoughts yet.</p>
            )}
            {sorted.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  cardRefs.current[t.id] = el;
                }}
                className={`rounded-xl border border-slate-200 bg-white p-4 ${
                  highlightId === t.id ? "card-flash border-indigo-500" : ""
                }`}
              >
                {editId === t.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editRaw}
                      onChange={(e) => setEditRaw(e.target.value)}
                      rows={5}
                      className="w-full rounded bg-white border border-slate-200 px-2 py-1 text-sm resize-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      Saving will re-run AI augmentation.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(t.id)}
                        className="text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-sm text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {t.augmented ? (
                      renderAugmented(t)
                    ) : (
                      <>
                        <div className="text-[10px] text-indigo-600 uppercase tracking-wider mb-1">
                          When
                        </div>
                        <div className="text-sm mb-2">{t.when_needed}</div>
                        <div className="text-[10px] text-indigo-600 uppercase tracking-wider mb-1">
                          Mantra
                        </div>
                        <div className="text-sm whitespace-pre-wrap">
                          {t.mantra}
                        </div>
                      </>
                    )}
                    {t.raw && (
                      <details className="mt-3">
                        <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">
                          Original raw text
                        </summary>
                        <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">
                          {t.raw}
                        </div>
                      </details>
                    )}
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Updated {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <select value={moveTargets[t.id] ?? "Study"} onChange={(event) => setMoveTargets((old) => ({ ...old, [t.id]: event.target.value as ObservationChannel }))} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px]">
                          {OBSERVATION_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                        </select>
                        <button onClick={() => moveToObservation(t)} disabled={movingId === t.id} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50">{movingId === t.id ? "Moving..." : "Move to channel"}</button>
                        <button
                          onClick={() => {
                            setEditId(t.id);
                            setEditRaw(t.raw ?? t.mantra ?? "");
                          }}
                          className="hover:text-slate-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => delThought(t.id)}
                          className="hover:text-red-600"
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

        {/* FLOATING CHAT */}
        {chatOpen && (
        <section className="fixed bottom-20 right-4 z-50 flex h-[min(620px,calc(100vh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 p-4">
            <div>
              <h2 className="font-semibold text-slate-900">Find a mantra</h2>
            <p className="text-xs text-slate-500">
              Describe your situation. Get top-3 relevant thoughts.
            </p>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
              className="ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chat.length === 0 && (
              <p className="text-sm text-slate-500">
                Ask: &ldquo;I&apos;m overwhelmed by deadlines&rdquo;,
                &ldquo;Feeling stuck creatively&rdquo;...
              </p>
            )}
            {chat.map((item, i) =>
              item.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 text-white px-4 py-2 text-sm">
                    {item.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  {item.empty ? (
                    <div className="text-sm text-slate-500">
                      No relevant thoughts found.
                    </div>
                  ) : (
                    item.results.map((r) => {
                      const aug = r.augmented ?? {};
                      const when =
                        (typeof aug.when_needed === "string" && aug.when_needed) ||
                        r.when_needed ||
                        "";
                      const short =
                        (typeof aug.refined === "string" && aug.refined) ||
                        (typeof aug.short === "string" && aug.short) ||
                        r.mantra ||
                        r.raw ||
                        "";
                      return (
                        <button
                          key={r.id}
                          onClick={() => scrollToCard(r.id)}
                          className="block w-full text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-400 transition p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] text-indigo-600 uppercase tracking-wider">
                              When
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {(r.score * 100).toFixed(0)}% match
                            </div>
                          </div>
                          <div className="text-sm mb-1 text-slate-800">{when}</div>
                          <div className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">
                            {short}
                          </div>
                          {r.reason && (
                            <div className="mt-2 text-[11px] text-slate-500 italic">
                              {r.reason}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )
            )}
            {searching && (
              <div className="text-sm text-slate-500">Searching...</div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
            className="p-4 border-t border-slate-200 flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe your situation..."
              className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
            />
            <button
              disabled={searching || !query.trim()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
            >
              Send
            </button>
          </form>
        </section>
        )}
        <button
          type="button"
          onClick={() => setChatOpen((open) => !open)}
          aria-label={chatOpen ? "Close mantra chat" : "Open mantra chat"}
          aria-expanded={chatOpen}
          className="fixed bottom-4 right-4 z-50 flex h-14 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-200"
        >
          <span aria-hidden="true" className="text-xl">💬</span>
          {chatOpen ? "Close" : "Find a mantra"}
        </button>
      </div>
    </div>
  );
}
