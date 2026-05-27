"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";

export default function SettingsPage() {
  const [schemaText, setSchemaText] = useState("");
  const [conflictPrompt, setConflictPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error || "Failed to load settings.");
      setLoading(false);
      return;
    }
    setSchemaText(JSON.stringify(j.output_schema, null, 2));
    setConflictPrompt(j.conflict_prompt ?? "");
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
      parsed = JSON.parse(schemaText);
    } catch (e) {
      setMsg("Invalid JSON: " + (e as Error).message);
      return;
    }
    if (conflictPrompt.trim().length < 20) {
      setMsg("Conflict prompt must be at least 20 characters.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        output_schema: parsed,
        conflict_prompt: conflictPrompt.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Failed");
      return;
    }
    const j = await res.json();
    setSchemaText(JSON.stringify(j.output_schema, null, 2));
    setConflictPrompt(j.conflict_prompt ?? "");
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
            Control how AI augments thoughts and how it detects duplicates or
            contradictions.
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
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            disabled={loading}
            rows={16}
            className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 font-mono text-xs resize-none"
          />
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h2 className="font-medium text-slate-900">Conflict finder prompt</h2>
            <p className="text-xs text-slate-500">
              Used when a new thought is compared against saved thoughts for
              duplicates or contradictory advice.
            </p>
            <textarea
              value={conflictPrompt}
              onChange={(e) => setConflictPrompt(e.target.value)}
              disabled={loading}
              rows={7}
              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 text-sm resize-none"
            />
          </div>
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
          <p><strong>Note:</strong> changing the schema affects only thoughts added after the change. Existing rows keep their old shape until you edit and save them again.</p>
          <p>Include <code className="px-1 bg-slate-100 rounded">when_needed</code> (string). For the main text, use <code className="px-1 bg-slate-100 rounded">refined</code> when you want cleaned text without shortening, or <code className="px-1 bg-slate-100 rounded">short</code> only when you want a shortened version.</p>
        </div>
      </main>
    </div>
  );
}
