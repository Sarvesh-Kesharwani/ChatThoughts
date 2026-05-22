"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm transition ${
        pathname === href
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
        <span className="font-semibold mr-3 text-slate-900">ChatThoughts</span>
        {tab("/", "Thoughts")}
        {tab("/conflicts", "Conflicts in KG")}
        {tab("/categories", "Categories")}
        {tab("/abilities", "Abilities")}
        {tab("/settings", "Settings")}
      </div>
      <button
        onClick={logout}
        className="text-sm text-slate-600 hover:text-slate-900"
      >
        Sign out
      </button>
    </header>
  );
}
