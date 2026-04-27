import { signOut } from '@/auth';
import { SignInButton } from '@/components/SignInButton';
import { SignOutButton } from '@/components/SignOutButton';
import { clearCookieBaseStore } from '@/lib/base-store';
import { getSession } from '@/lib/session';

export async function AuthButton() {
  const session = await getSession();

  if (session?.user) {
    const signOutAction = async () => {
      'use server';
      await clearCookieBaseStore();
      await signOut({ redirectTo: '/' });
    };

    return (
      <form className="chip">
        <span className="max-w-[140px] truncate">{session.user.name ?? 'Signed in'}</span>
        <SignOutButton action={signOutAction} />
      </form>
    );
  }

  return <SignInButton />;
}
