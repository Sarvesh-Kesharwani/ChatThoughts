'use client';

import { FormEvent, useState } from 'react';

export function PasscodeGate() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Unable to unlock.');
        return;
      }
      window.location.reload();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <form className="panel w-full space-y-4" onSubmit={submit}>
        <div>
          <h1 className="text-xl font-semibold">Enter passcode</h1>
          <p className="mt-1 text-sm text-slate-600">ChatThoughts is locked until the app passcode is accepted.</p>
        </div>
        <input
          className="w-full rounded-lg border border-brand-soft p-3 text-sm"
          type="password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          autoFocus
          placeholder="Passcode"
        />
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        <button type="submit" className="btn-accent w-full" disabled={pending}>
          {pending ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
