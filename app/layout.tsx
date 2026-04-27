import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthButton } from '@/components/AuthButton';
import { SyncButton } from '@/components/SyncButton';
import { TopNav } from '@/components/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'BaseApp',
  description: 'Starter template with header buttons, Google auth, and Drive sync.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 border-b border-brand-soft bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-xl font-bold text-slate-900">
              BaseApp
            </Link>
            <div className="flex items-center gap-3">
              <Suspense fallback={null}>
                <TopNav />
              </Suspense>
              <SyncButton />
              <Suspense fallback={null}>
                <AuthButton />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
