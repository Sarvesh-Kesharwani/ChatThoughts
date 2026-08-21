import { NextResponse } from "next/server";
import { z } from "zod";
import { compareObservationsWithRulebook } from "@/lib/deepseek";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ channel: z.enum(["Study", "GameDev", "Relaxation/Sleep", "Gym", "English", "General"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const { data: thought, error } = await supabase.from("chatthoughts_observation_thoughts").select("*").eq("id", id).single();
  if (error || !thought) return NextResponse.json({ error: error?.message || "Thought not found" }, { status: 404 });
  if (thought.channel === parsed.data.channel) return NextResponse.json({ error: "Thought is already in this channel" }, { status: 400 });

  const { data: oldRules, error: oldRulesError } = await supabase
    .from("chatthoughts_rules")
    .select("id, chatthoughts_rule_versions(version,source_thought_id)")
    .eq("channel", thought.channel)
    .eq("is_active", true);
  if (oldRulesError) return NextResponse.json({ error: oldRulesError.message }, { status: 500 });
  const rulesCreatedFromThought = (oldRules ?? []).filter((rule) => {
    const versions = Array.isArray(rule.chatthoughts_rule_versions) ? rule.chatthoughts_rule_versions : [];
    return versions.some((version) => version.version === 1 && version.source_thought_id === id);
  });

  const points = Array.isArray(thought.points) ? thought.points.filter((point: unknown): point is string => typeof point === "string") : [];
  const { data: targetRules, error: targetError } = await supabase.from("chatthoughts_rules").select("id,text").eq("channel", parsed.data.channel).eq("is_active", true);
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  let comparison;
  try { comparison = await compareObservationsWithRulebook(points, targetRules ?? []); }
  catch (compareError) { console.error("move comparison failed", compareError); return NextResponse.json({ error: "AI comparison failed" }, { status: 502 }); }

  if (rulesCreatedFromThought.length) {
    const { error: archiveError } = await supabase.from("chatthoughts_rules").update({ is_active: false }).in("id", rulesCreatedFromThought.map((rule) => rule.id));
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
  }
  const status = comparison.conflicts.length ? "pending" : "resolved";
  const { error: moveError } = await supabase.from("chatthoughts_observation_thoughts").update({ channel: parsed.data.channel, added_point_indexes: comparison.non_conflicting_point_indexes, status }).eq("id", id);
  if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 });

  for (const index of comparison.non_conflicting_point_indexes) {
    const { data: rule, error: ruleError } = await supabase.from("chatthoughts_rules").insert({ channel: parsed.data.channel, text: points[index], source_thought_id: id }).select("*").single();
    if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 500 });
    await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version: 1, text: rule.text, source_thought_id: id, change_kind: "created" });
  }
  return NextResponse.json({ moved: true, archived_rules: rulesCreatedFromThought.length, added: comparison.non_conflicting_point_indexes.length, needs_review: comparison.conflicts.length > 0 });
}
