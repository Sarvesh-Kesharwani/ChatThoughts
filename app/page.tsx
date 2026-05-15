import { ThoughtDashboard } from '@/components/ThoughtDashboard';
import { getSession } from '@/lib/session';
import { listThoughts } from '@/lib/thoughts-repository';

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

  try {
    const thoughts = await listThoughts();

    return <ThoughtDashboard initialThoughts={thoughts} />;
  } catch (error) {
    return (
      <section className="panel space-y-3">
        <h1 className="text-xl font-semibold">Database setup required</h1>
        <p className="text-sm text-slate-600">
          {error instanceof Error ? error.message : 'Unable to connect to Supabase.'}
        </p>
      </section>
    );
  }
}
