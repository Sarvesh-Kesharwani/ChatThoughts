"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

type ThoughtLite = {
  id: string;
  when_needed: string;
  mantra: string;
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

export default function ConflictsPage() {
  const [items, setItems] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mergeWhen, setMergeWhen] = useState("");
  const [mergeMantra, setMergeMantra] = useState("");
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
    setMergeWhen(c.a.when_needed);
    setMergeMantra(`${c.a.mantra}\n\n---\n\n${c.b.mantra}`);
  }

  async function submitMerge(id: string) {
    setBusy(true);
    const res = await fetch(`/api/conflicts/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        when_needed: mergeWhen,
        mantra: mergeMantra,
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
          <h1 className="text-xl font-semibold">Conflicts in KG</h1>
          <p className="text-sm text-neutral-500">
            Pairs flagged as duplicates or contradictions. Resolve by merging or
            dismissing.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-neutral-500">Loading...</p>
        )}
        {!loading && items.length === 0 && (
          <p className="text-sm text-neutral-500">No open conflicts.</p>
        )}

        <div className="space-y-4">
          {items.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      c.kind === "duplicate"
                        ? "bg-amber-900/40 text-amber-300"
                        : "bg-red-900/40 text-red-300"
                    }`}
                  >
                    {c.kind}
                  </span>
                  {c.reason && (
                    <span className="text-xs text-neutral-400 italic">
                      {c.reason}
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-neutral-900">
                {[c.a, c.b].map((t, idx) => (
                  <div key={t?.id ?? idx} className="p-4">
                    <div className="text-xs text-indigo-400 uppercase mb-1">
                      When
                    </div>
                    <div className="text-sm mb-2">{t?.when_needed}</div>
                    <div className="text-xs text-indigo-400 uppercase mb-1">
                      Mantra
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-neutral-300">
                      {t?.mantra}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-neutral-900 flex gap-3">
                <button
                  onClick={() => openMerge(c)}
                  className="rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm"
                >
                  Merge
                </button>
                <button
                  onClick={() => dismiss(c.id)}
                  disabled={busy}
                  className="rounded border border-neutral-700 hover:border-neutral-500 px-3 py-1.5 text-sm"
                >
                  Dismiss
                </button>
              </div>

              {openId === c.id && (
                <div className="px-4 py-4 border-t border-neutral-900 space-y-2 bg-neutral-950/50">
                  <h4 className="text-sm font-medium">Merged version</h4>
                  <input
                    value={mergeWhen}
                    onChange={(e) => setMergeWhen(e.target.value)}
                    placeholder="When needed"
                    className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm"
                  />
                  <textarea
                    value={mergeMantra}
                    onChange={(e) => setMergeMantra(e.target.value)}
                    placeholder="Mantra"
                    rows={5}
                    className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm resize-none"
                  />
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
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
                      disabled={busy || !mergeWhen.trim() || !mergeMantra.trim()}
                      className="rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 text-sm"
                    >
                      {busy ? "Saving..." : "Save merged"}
                    </button>
                    <button
                      onClick={() => setOpenId(null)}
                      className="text-sm text-neutral-400"
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
