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
      className={`px-3 py-1.5 rounded-lg text-sm ${
        pathname === href
          ? "bg-neutral-800 text-white"
          : "text-neutral-400 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
      <div className="flex items-center gap-1">
        <span className="font-semibold mr-3">ChatThoughts</span>
        {tab("/", "Dashboard")}
        {tab("/conflicts", "Conflicts in KG")}
      </div>
      <button
        onClick={logout}
        className="text-sm text-neutral-400 hover:text-white"
      >
        Sign out
      </button>
    </header>
  );
}
