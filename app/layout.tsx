import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppLogo } from '@/components/AppLogo';
import { AuthButton } from '@/components/AuthButton';
import { FeatureRequestMenu } from '@/components/FeatureRequestMenu';
import { PasscodeGate } from '@/components/PasscodeGate';
import { SyncButton } from '@/components/SyncButton';
import { TopNav } from '@/components/TopNav';
import { isPasscodeAccepted } from '@/lib/passcode';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatThoughts',
  description: 'Three-layer personal note recall system with semantic AI retrieval.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const unlocked = await isPasscodeAccepted();

  return (
    <html lang="en">
      <body>
        {unlocked ? (
          <>
            <header className="sticky top-0 z-10 border-b border-brand-soft bg-white/90 backdrop-blur">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <AppLogo />
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  <Suspense fallback={null}>
                    <TopNav />
                  </Suspense>
                  <FeatureRequestMenu />
                  <SyncButton />
                  <Suspense fallback={null}>
                    <AuthButton />
                  </Suspense>
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          </>
        ) : (
          <PasscodeGate />
        )}
      </body>
    </html>
  );
}
