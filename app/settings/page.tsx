"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

export default function SettingsPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings");
    const j = await res.json();
    setText(JSON.stringify(j.output_schema, null, 2));
    setUpdatedAt(j.updated_at);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setMsg("Invalid JSON: " + (e as Error).message);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Failed");
      return;
    }
    const j = await res.json();
    setText(JSON.stringify(j.output_schema, null, 2));
    setUpdatedAt(j.updated_at);
    setMsg("Saved.");
  }

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">
            Output structure used by AI when augmenting a new thought. Each field
            becomes a key in the saved JSON.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-900">Output schema</h2>
            {updatedAt && (
              <span className="text-xs text-slate-500">
                Updated {new Date(updatedAt).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Shape: <code className="px-1 py-0.5 rounded bg-slate-100">{"{ fields: [{ key, label, type: 'string'|'array', options?: string[] }] }"}</code>
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            rows={22}
            className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 font-mono text-xs resize-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || loading}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={load}
              disabled={loading || saving}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Reset
            </button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 space-y-1">
          <p><strong>Note:</strong> changing the schema affects only thoughts added after the change. Existing rows keep their old shape.</p>
          <p>Always include <code className="px-1 bg-slate-100 rounded">when_needed</code> (string) and <code className="px-1 bg-slate-100 rounded">short</code> (string) so search + cards render properly.</p>
        </div>
      </main>
    </div>
  );
}
