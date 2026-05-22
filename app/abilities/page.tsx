import Nav from "@/components/Nav";

type Ability = { title: string; body: string; status?: "live" | "planned" };

const abilities: Ability[] = [
  {
    title: "Fetch top 3 mantras for your shared issue",
    body:
      "Describe a situation in the chat on the Thoughts page. The bot ranks your saved thoughts by relevance and returns three cards. Clicking a card scrolls to it in the left list.",
    status: "live",
  },
  {
    title: "Augment a raw thought into structured fields",
    body:
      "When you add a new thought, the AI expands your single piece of text into a JSON object — when you'll need it, a shortened mantra, and which areas of life it touches. Structure is configurable in Settings.",
    status: "live",
  },
  {
    title: "Detect duplicate or conflicting thoughts",
    body:
      "On add, the new thought is compared against your existing library using the configurable Settings prompt. Near-identical thoughts get marked as duplicates; thoughts giving contradictory advice for the same situation get marked as conflicts. Both surface in the 'Conflicts in KG' tab for later review.",
    status: "live",
  },
  {
    title: "AI categorize thoughts",
    body:
      "The Categories page gives each thought a generated title and tags, then groups thoughts into existing and newly suggested categories for focused review.",
    status: "live",
  },
  {
    title: "Merge a conflict pair into a single thought",
    body:
      "On the Conflicts tab, open a pair, edit a merged version inline, and optionally delete the two originals on save.",
    status: "live",
  },
  {
    title: "Draft autosave",
    body:
      "If you start typing a thought and walk away, the text is kept locally and restored when you return. Submitting clears the draft.",
    status: "live",
  },
  {
    title: "Custom output schema",
    body:
      "Edit the JSON shape the AI produces from each raw thought. Add fields, change labels, restrict categories.",
    status: "live",
  },
];

export default function AbilitiesPage() {
  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Abilities</h1>
          <p className="text-sm text-slate-500">
            What the bot and the system can do for you.
          </p>
        </div>
        <ol className="space-y-3 list-decimal pl-5">
          {abilities.map((a) => (
            <li key={a.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="font-medium text-slate-900">{a.title}</h2>
                {a.status && (
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      a.status === "live"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600">{a.body}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
