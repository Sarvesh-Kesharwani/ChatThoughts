"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

type ThoughtLite = {
  id: string;
  raw: string | null;
  augmented: Record<string, unknown> | null;
  when_needed: string | null;
  mantra: string | null;
  updated_at: string;
};

type ConflictRow = {
  id: string;
  kind: "duplicate" | "conflict";
  status: string;
  reason: string | null;
  created_at: string;
  a: ThoughtLite;
  b: ThoughtLite;
};

function whenOf(t: ThoughtLite) {
  const aug = (t.augmented ?? {}) as Record<string, unknown>;
  return (typeof aug.when_needed === "string" && aug.when_needed) || t.when_needed || "";
}
function shortOf(t: ThoughtLite) {
  const aug = (t.augmented ?? {}) as Record<string, unknown>;
  return (
    (typeof aug.refined === "string" && aug.refined) ||
    (typeof aug.short === "string" && aug.short) ||
    t.mantra ||
    t.raw ||
    ""
  );
}

export default function ConflictsPage() {
  const [items, setItems] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mergeRaw, setMergeRaw] = useState("");
  const [deleteOrig, setDeleteOrig] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/conflicts");
    const j = await res.json();
    setItems(j.conflicts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openMerge(c: ConflictRow) {
    setOpenId(c.id);
    const a = (c.a?.raw ?? shortOf(c.a)) || "";
    const b = (c.b?.raw ?? shortOf(c.b)) || "";
    setMergeRaw(`${a}\n\n---\n\n${b}`);
  }

  async function submitMerge(id: string) {
    setBusy(true);
    const res = await fetch(`/api/conflicts/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        raw: mergeRaw,
        delete_originals: deleteOrig,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setOpenId(null);
      load();
    }
  }

  async function dismiss(id: string) {
    setBusy(true);
    await fetch(`/api/conflicts/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    setBusy(false);
    load();
  }

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Conflicts in KG</h1>
          <p className="text-sm text-slate-500">
            Pairs flagged as duplicates or contradictions. Resolve by merging or
            dismissing.
          </p>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">No open conflicts.</p>
        )}

        <div className="space-y-4">
          {items.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      c.kind === "duplicate"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.kind}
                  </span>
                  {c.reason && (
                    <span className="text-xs text-slate-500 italic">
                      {c.reason}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-200">
                {[c.a, c.b].map((t, idx) => (
                  <div key={t?.id ?? idx} className="p-4">
                    <div className="text-xs text-indigo-600 uppercase mb-1">
                      When
                    </div>
                    <div className="text-sm mb-2 text-slate-800">{whenOf(t)}</div>
                    <div className="text-xs text-indigo-600 uppercase mb-1">
                      Mantra
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-slate-700">
                      {shortOf(t)}
                    </div>
                    {t?.raw && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-slate-500 cursor-pointer">
                          Raw
                        </summary>
                        <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">
                          {t.raw}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => openMerge(c)}
                  className="rounded bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 text-sm"
                >
                  Merge
                </button>
                <button
                  onClick={() => dismiss(c.id)}
                  disabled={busy}
                  className="rounded border border-slate-300 hover:border-slate-400 px-3 py-1.5 text-sm"
                >
                  Dismiss
                </button>
              </div>

              {openId === c.id && (
                <div className="px-4 py-4 border-t border-slate-200 space-y-2 bg-slate-50">
                  <h4 className="text-sm font-medium text-slate-900">
                    Merged version (raw — AI will re-augment)
                  </h4>
                  <textarea
                    value={mergeRaw}
                    onChange={(e) => setMergeRaw(e.target.value)}
                    placeholder="Raw merged thought"
                    rows={6}
                    className="w-full rounded bg-white border border-slate-200 px-2 py-1 text-sm resize-none"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={deleteOrig}
                      onChange={(e) => setDeleteOrig(e.target.checked)}
                    />
                    Delete the two originals after merge
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitMerge(c.id)}
                      disabled={busy || !mergeRaw.trim()}
                      className="rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 px-3 py-1.5 text-sm"
                    >
                      {busy ? "Saving..." : "Save merged"}
                    </button>
                    <button
                      onClick={() => setOpenId(null)}
                      className="text-sm text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
