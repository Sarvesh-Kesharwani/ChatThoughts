import { BaseStateDemo } from '@/components/BaseStateDemo';
import { getCookieBaseStore } from '@/lib/base-store';
import { getSession } from '@/lib/session';

export default async function HomePage() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <section className="panel space-y-3">
        <h1 className="text-xl font-semibold">Sign in to use ChatThoughts</h1>
        <p className="text-sm text-slate-600">
          Your notes, derived problem-solution cards, and recall chat are stored with the existing auth + Drive sync base.
        </p>
      </section>
    );
  }

  const state = await getCookieBaseStore();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">ChatThoughts</h1>
      <BaseStateDemo initialState={state} />
    </section>
  );
}
