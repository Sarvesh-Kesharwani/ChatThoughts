import { ConflictResolver } from '@/components/ConflictResolver';
import { listOpenConflicts } from '@/lib/thoughts-repository';

export default async function ConflictsPage() {
  try {
    const conflicts = await listOpenConflicts();
    return <ConflictResolver initialConflicts={conflicts} />;
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
