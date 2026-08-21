import { NextResponse } from "next/server";
import { z } from "zod";
import { compareObservationsWithRulebook } from "@/lib/deepseek";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const decisionSchema = z.object({
  decisions: z.array(z.object({ rule_id: z.string().uuid(), thought_point_index: z.number().int().nonnegative(), choice: z.enum(["thought", "rule"]) })),
});

async function load(id: string) {
  const { data: thought, error } = await supabase.from("chatthoughts_observation_thoughts").select("*").eq("id", id).single();
  if (error || !thought) return { error: error?.message || "Thought not found" };
  const { data: rules, error: rulesError } = await supabase.from("chatthoughts_rules").select("*").eq("channel", thought.channel).order("created_at");
  return rulesError ? { error: rulesError.message } : { thought, rules: rules ?? [] };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await load(id);
  if ("error" in state) return NextResponse.json({ error: state.error }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const parsed = decisionSchema.safeParse(body);
  const allPoints = Array.isArray(state.thought.points) ? state.thought.points.filter((x: unknown): x is string => typeof x === "string") : [];
  const added = new Set<number>(Array.isArray(state.thought.added_point_indexes) ? state.thought.added_point_indexes : []);
  const pointMap = allPoints.map((text: string, index: number) => ({ text, index })).filter((item: { index: number }) => !added.has(item.index));
  const points = pointMap.map((item: { text: string }) => item.text);
  const localComparison = await compareObservationsWithRulebook(points, state.rules.map((r) => ({ id: r.id, text: r.text })));
  const comparison = {
    conflicts: localComparison.conflicts.map((c) => ({ ...c, thought_point_index: pointMap[c.thought_point_index].index })),
    non_conflicting_point_indexes: localComparison.non_conflicting_point_indexes.map((index) => pointMap[index].index),
  };

  if (!parsed.success || parsed.data.decisions.length === 0) {
    if (comparison.conflicts.length) {
      await supabase.from("chatthoughts_observation_thoughts").update({ status: "awaiting_decision" }).eq("id", id);
      return NextResponse.json({ comparison, rules: state.rules });
    }
    for (const index of comparison.non_conflicting_point_indexes) {
      const { data: rule, error } = await supabase.from("chatthoughts_rules").insert({ channel: state.thought.channel, text: allPoints[index], source_thought_id: id }).select("*").single();
      if (!error && rule) await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version: 1, text: rule.text, source_thought_id: id, change_kind: "created" });
    }
    await supabase.from("chatthoughts_observation_thoughts").update({ status: "resolved" }).eq("id", id);
    return NextResponse.json({ comparison, resolved: true });
  }

  const currentConflicts = new Map(comparison.conflicts.map((c) => [`${c.rule_id}:${c.thought_point_index}`, c]));
  for (const decision of parsed.data.decisions) {
    if (!currentConflicts.has(`${decision.rule_id}:${decision.thought_point_index}`)) continue;
    const rule = state.rules.find((r) => r.id === decision.rule_id);
    if (!rule) continue;
    const version = Number(rule.current_version) + 1;
    const text = decision.choice === "thought" ? allPoints[decision.thought_point_index] : rule.text;
    await supabase.from("chatthoughts_rules").update({ text, current_version: version, source_thought_id: decision.choice === "thought" ? id : rule.source_thought_id }).eq("id", rule.id);
    await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version, text, source_thought_id: id, change_kind: decision.choice === "thought" ? "replaced" : "kept" });
  }
  for (const index of comparison.non_conflicting_point_indexes) {
    const { data: rule, error } = await supabase.from("chatthoughts_rules").insert({ channel: state.thought.channel, text: allPoints[index], source_thought_id: id }).select("*").single();
    if (!error && rule) await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version: 1, text: rule.text, source_thought_id: id, change_kind: "created" });
  }
  await supabase.from("chatthoughts_observation_thoughts").update({ status: "resolved" }).eq("id", id);
  return NextResponse.json({ resolved: true });
}
