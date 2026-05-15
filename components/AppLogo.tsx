import Link from 'next/link';

export function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-xl font-bold text-slate-900">
      <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl shadow-btn" />
      <span>ChatThoughts</span>
    </Link>
  );
}
