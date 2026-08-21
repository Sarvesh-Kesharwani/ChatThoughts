"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Nav from "@/components/Nav";

const CHANNELS = ["Study", "GameDev", "Relaxation/Sleep", "Gym", "English"] as const;
type Channel = (typeof CHANNELS)[number];
type Thought = { id: string; raw: string; summary: string | null; points: string[]; other_points: string[] | null; added_point_indexes: number[]; status: "pending" | "awaiting_decision" | "resolved"; created_at: string };
type Version = { id: string; version: number; text: string; change_kind: string; source_thought_id: string | null; created_at: string };
type Rule = { id: string; text: string; current_version: number; updated_at: string; chatthoughts_rule_versions?: Version[] };
type Conflict = { thought_point_index: number; rule_id: string; reason: string };
type Review = { conflicts: Conflict[]; non_conflicting_point_indexes: number[]; rules: Rule[] };

export default function ObservationStrategyUpdatesPage() {
  const [channel, setChannel] = useState<Channel>("Study");
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rightTab, setRightTab] = useState<"rules" | "conflicts" | "chat">("rules");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [decisions, setDecisions] = useState<Record<string, "thought" | "rule">>({});
  const [question, setQuestion] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [highlightThoughtId, setHighlightThoughtId] = useState<string | null>(null);
  const thoughtRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/observation-strategy?channel=${encodeURIComponent(channel)}`);
    const json = await res.json();
    setThoughts(json.thoughts ?? []);
    setRules(json.rules ?? []);
    setLoading(false);
  }, [channel]);

  useEffect(() => { setReviews({}); setDecisions({}); setChat([]); load(); }, [load]);

  async function askRulebook() {
    if (!question.trim()) return;
    const current = question.trim();
    setQuestion(""); setChatting(true);
    setChat((items) => [...items, { role: "user", text: current }]);
    const res = await fetch("/api/observation-strategy/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, question: current }) });
    const json = await res.json().catch(() => ({}));
    setChatting(false);
    setChat((items) => [...items, { role: "assistant", text: res.ok ? json.answer : (json.error || "Could not answer.") }]);
  }

  async function addThought() {
    if (!raw.trim()) return;
    setAdding(true); setMessage("");
    const res = await fetch("/api/observation-strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, raw }) });
    const json = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) { setMessage(json.error || "Failed to add thought."); return; }
    setRaw("");
    setMessage(`${json.added} new rule-point${json.added === 1 ? "" : "s"} added.${json.needs_review ? " Conflicting point needs review." : ""}`);
    if (json.needs_review) setRightTab("conflicts");
    load();
  }

  async function inspect(thought: Thought) {
    setReviewing(thought.id);
    const res = await fetch(`/api/observation-strategy/${thought.id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const json = await res.json();
    setReviewing(null);
    if (!res.ok) { setMessage(json.error || "Conflict check failed."); return; }
    if (json.resolved) { setMessage("No current conflict. New rule-points added."); load(); return; }
    setReviews((old) => ({ ...old, [thought.id]: { ...json.comparison, rules: json.rules } }));
  }

  async function applyDecisions(thought: Thought) {
    const review = reviews[thought.id];
    if (!review) return;
    const selected = review.conflicts.map((conflict) => ({ rule_id: conflict.rule_id, thought_point_index: conflict.thought_point_index, choice: decisions[`${thought.id}:${conflict.rule_id}:${conflict.thought_point_index}`] })).filter((x): x is typeof x & { choice: "thought" | "rule" } => Boolean(x.choice));
    if (selected.length !== review.conflicts.length) { setMessage("Choose one side for every conflict."); return; }
    setReviewing(thought.id);
    const res = await fetch(`/api/observation-strategy/${thought.id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisions: selected }) });
    const json = await res.json().catch(() => ({}));
    setReviewing(null);
    if (!res.ok) { setMessage(json.error || "Could not save decisions."); return; }
    setReviews((old) => { const next = { ...old }; delete next[thought.id]; return next; });
    setMessage("Conflict resolved. Rule history saved.");
    load();
  }

  const pending = useMemo(() => thoughts.filter((thought) => thought.status !== "resolved"), [thoughts]);

  function openSourceThought(id: string) {
    const element = thoughtRefs.current[id];
    if (!element) { setMessage("Source thought is no longer available in this channel."); return; }
    setHighlightThoughtId(id);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightThoughtId((current) => current === id ? null : current), 1800);
  }

  function thoughtSummary(thought: Thought) {
    return thought.summary?.trim() || thought.raw.replace(/\s+/g, " ").trim();
  }

  return <div className="h-screen flex flex-col bg-slate-50">
    <Nav />
    <header className="bg-white border-b border-slate-200 px-4">
      <div className="flex gap-2 overflow-x-auto py-2">
        {CHANNELS.map((item) => <button key={item} onClick={() => setChannel(item)} className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition ${channel === item ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{item}</button>)}
      </div>
    </header>
    <main className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0">
      <section className="border-r border-slate-200 flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h1 className="font-semibold text-slate-900">New thought</h1>
          <p className="text-xs text-slate-500 mt-1">Add raw thought. AI extracts atomic observations for {channel}.</p>
          <textarea value={raw} onChange={(event) => setRaw(event.target.value)} rows={5} placeholder="Type what's on your mind..." className="mt-3 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none focus:border-indigo-500 resize-none" />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={addThought} disabled={adding || !raw.trim()} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white">{adding ? "Processing..." : "Add"}</button>
            {message && <span className="text-xs text-slate-600">{message}</span>}
          </div>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-slate-500">{channel} thoughts ({thoughts.length})</h2>
          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {!loading && thoughts.length === 0 && <p className="text-sm text-slate-500">No thoughts recorded in this channel.</p>}
          {thoughts.map((thought) => <article key={thought.id} ref={(element) => { thoughtRefs.current[thought.id] = element; }} className={`rounded-xl border bg-white p-4 transition ${highlightThoughtId === thought.id ? "border-indigo-500 card-flash" : "border-slate-200"}`}>
            <details>
              <summary className="cursor-pointer list-none flex items-center gap-2"><span className="text-sm text-slate-800 truncate flex-1">{thoughtSummary(thought)}</span><span className="text-[11px] text-indigo-600 shrink-0">Open</span></summary>
              <div className="mt-3 border-t border-slate-100 pt-3"><div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Original thought</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{thought.raw}</p></div>
            </details>
            <details className="mt-3"><summary className="text-xs text-indigo-600 cursor-pointer">Main strategy points ({thought.points.length})</summary><ol className="mt-2 pl-5 list-decimal space-y-1 text-xs text-slate-600">{thought.points.map((point, index) => <li key={index}>{point}</li>)}</ol></details>
            {(thought.other_points?.length ?? 0) > 0 && <details className="mt-2"><summary className="text-xs text-slate-500 cursor-pointer">Other points ({thought.other_points!.length})</summary><ol className="mt-2 pl-5 list-decimal space-y-1 text-xs text-slate-500">{thought.other_points!.map((point, index) => <li key={index}>{point}</li>)}</ol></details>}
            <div className="mt-3 flex justify-between text-[11px] text-slate-500"><span>{new Date(thought.created_at).toLocaleString()}</span><span className={thought.status === "resolved" ? "text-emerald-600" : "text-amber-600"}>{thought.status === "resolved" ? "RuleBook updated" : "Needs review"}</span></div>
          </article>)}
        </div>
      </section>
      <section className="flex flex-col min-h-0 bg-white">
        <div className="border-b border-slate-200 px-4 pt-3">
          <div className="flex items-end justify-between"><h2 className="font-semibold text-slate-900 pb-3">RuleBook</h2><div className="flex gap-1">
            <button onClick={() => setRightTab("rules")} className={`px-4 py-2 text-sm border-b-2 ${rightTab === "rules" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>RuleBook</button>
            <button onClick={() => setRightTab("conflicts")} className={`px-4 py-2 text-sm border-b-2 ${rightTab === "conflicts" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>Conflicts{pending.length ? ` (${pending.length})` : ""}</button>
            <button onClick={() => setRightTab("chat")} className={`px-4 py-2 text-sm border-b-2 ${rightTab === "chat" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>Chat</button>
          </div></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {rightTab === "rules" ? <div>
            {rules.length === 0 ? <div className="h-48 grid place-items-center text-center"><div><p className="text-sm text-slate-500">RuleBook is empty.</p><p className="text-xs text-slate-400 mt-1">New unique observations will appear here.</p></div></div> : <ol className="space-y-3">
              {rules.map((rule, index) => <li key={rule.id} className="flex gap-3 rounded-xl border border-slate-200 p-4"><span className="shrink-0 w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 grid place-items-center text-xs font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm text-slate-800">{rule.text}</p><details className="mt-2"><summary className="text-[11px] text-slate-500 cursor-pointer">Version {rule.current_version} · history</summary><div className="mt-2 space-y-2">{[...(rule.chatthoughts_rule_versions ?? [])].sort((a,b) => b.version-a.version).map((version) => <div key={version.id} className="border-l-2 border-slate-200 pl-3 text-xs"><div className="text-slate-500">v{version.version} · {version.change_kind} · {new Date(version.created_at).toLocaleString()}</div><div className="text-slate-700 mt-0.5">{version.text}</div>{version.source_thought_id && <button onClick={() => openSourceThought(version.source_thought_id!)} className="block text-left text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline mt-0.5">Source thought: {version.source_thought_id}</button>}</div>)}</div></details></div></li>)}
            </ol>}
          </div> : rightTab === "conflicts" ? <div className="space-y-4">
            {pending.length === 0 && <div className="h-48 grid place-items-center text-sm text-slate-500">No unresolved conflicts.</div>}
            {pending.map((thought) => { const review = reviews[thought.id]; return <article key={thought.id} className="rounded-xl border border-slate-200 p-4">
              <div className="text-[11px] uppercase tracking-wider text-amber-600">Pending review</div><p className="mt-2 text-sm text-slate-800">{thought.raw}</p>
              {!review ? <button onClick={() => inspect(thought)} disabled={reviewing === thought.id} className="mt-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 text-sm">{reviewing === thought.id ? "Comparing with latest RuleBook..." : "Resolve Conflict"}</button> : <div className="mt-4 space-y-4">
                {review.conflicts.map((conflict, index) => { const rule = review.rules.find((item) => item.id === conflict.rule_id); const key = `${thought.id}:${conflict.rule_id}:${conflict.thought_point_index}`; return <div key={key} className="rounded-lg border border-red-200 bg-red-50/50 p-3"><p className="text-xs text-red-700 mb-3">Conflict {index + 1}: {conflict.reason}</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  <button onClick={() => setDecisions((old) => ({ ...old, [key]: "thought" }))} className={`text-left rounded-lg border p-3 text-sm ${decisions[key] === "thought" ? "border-indigo-600 bg-indigo-50" : "border-red-200 bg-white"}`}><span className="block text-[10px] uppercase text-red-600 mb-1">New thought point</span>{thought.points[conflict.thought_point_index]}</button>
                  <button onClick={() => setDecisions((old) => ({ ...old, [key]: "rule" }))} className={`text-left rounded-lg border p-3 text-sm ${decisions[key] === "rule" ? "border-indigo-600 bg-indigo-50" : "border-red-200 bg-white"}`}><span className="block text-[10px] uppercase text-red-600 mb-1">Current rule</span>{rule?.text}</button>
                </div></div>})}
                <button onClick={() => applyDecisions(thought)} disabled={reviewing === thought.id} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 text-sm">Save decisions</button>
              </div>}
            </article>})}
          </div> : <div className="h-full flex flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pb-4">
              {chat.length === 0 && <div className="h-40 grid place-items-center text-center"><div><p className="text-sm text-slate-600">Ask your {channel} RuleBook anything.</p><p className="text-xs text-slate-400 mt-1">Answers use latest rules and cite rule numbers.</p></div></div>}
              {chat.map((item, index) => <div key={index} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${item.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-slate-100 text-slate-800 rounded-tl-sm"}`}>{item.text}</div></div>)}
              {chatting && <p className="text-sm text-slate-500">Checking latest RuleBook...</p>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); askRulebook(); }} className="border-t border-slate-200 pt-4 flex gap-2">
              <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Clarify a doubt using the RuleBook..." className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
              <button disabled={chatting || !question.trim()} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 text-sm">Ask</button>
            </form>
          </div>}
        </div>
      </section>
    </main>
  </div>;
}
