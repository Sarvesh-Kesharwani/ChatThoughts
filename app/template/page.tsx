import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Template',
};

export default function TemplatePage() {
  return (
    <section className="panel space-y-3">
      <h1 className="text-xl font-semibold">Template page</h1>
      <p className="text-sm text-slate-600">Use this route as a starter for your first feature module.</p>
    </section>
  );
}
