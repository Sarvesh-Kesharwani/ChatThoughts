"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [passcode, setPasscode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Invalid passcode");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
    >
      <h1 className="text-xl font-semibold">ChatThoughts</h1>
      <p className="text-sm text-neutral-400">Enter passcode to continue.</p>
      <input
        autoFocus
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 outline-none focus:border-indigo-500"
        placeholder="passcode"
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        disabled={busy || !passcode}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2 font-medium"
      >
        {busy ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
