'use client';

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <button
      type="submit"
      onClick={() => {
        sessionStorage.removeItem('base_drive_pulled');
      }}
      formAction={action}
      className="text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      Sign out
    </button>
  );
}
