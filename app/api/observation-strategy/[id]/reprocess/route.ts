import { NextResponse } from "next/server";
import { compareObservationsWithRulebook, extractAtomicObservations } from "@/lib/deepseek";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: thought, error: thoughtError } = await supabase
    .from("chatthoughts_observation_thoughts")
    .select("*")
    .eq("id", id)
    .single();
  if (thoughtError || !thought) return NextResponse.json({ error: thoughtError?.message || "Thought not found" }, { status: 404 });

  let extracted: Awaited<ReturnType<typeof extractAtomicObservations>>;
  try { extracted = await extractAtomicObservations(thought.raw, thought.channel); }
  catch (error) { console.error("thought reprocessing failed", error); return NextResponse.json({ error: "AI reprocessing failed" }, { status: 502 }); }

  const { data: rules, error: rulesError } = await supabase
    .from("chatthoughts_rules")
    .select("id,text,chatthoughts_rule_versions(version,source_thought_id)")
    .eq("channel", thought.channel)
    .eq("is_active", true);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
  const ownRuleIds = new Set((rules ?? []).filter((rule) => {
    const versions = Array.isArray(rule.chatthoughts_rule_versions) ? rule.chatthoughts_rule_versions : [];
    return versions.some((version) => version.version === 1 && version.source_thought_id === id);
  }).map((rule) => rule.id));
  const comparisonRules = (rules ?? []).filter((rule) => !ownRuleIds.has(rule.id)).map((rule) => ({ id: rule.id, text: rule.text }));

  let comparison;
  try { comparison = await compareObservationsWithRulebook(extracted.main_points, comparisonRules); }
  catch (error) { console.error("reprocessed rule comparison failed", error); return NextResponse.json({ error: "AI comparison failed" }, { status: 502 }); }

  if (ownRuleIds.size) {
    const { error: archiveError } = await supabase.from("chatthoughts_rules").update({ is_active: false }).in("id", [...ownRuleIds]);
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
  }

  for (const index of comparison.non_conflicting_point_indexes) {
    const text = extracted.main_points[index];
    const { data: rule, error } = await supabase
      .from("chatthoughts_rules")
      .insert({ channel: thought.channel, text, source_thought_id: id })
      .select("*")
      .single();
    if (!error && rule) {
      await supabase.from("chatthoughts_rule_versions").insert({
        rule_id: rule.id,
        version: 1,
        text,
        source_thought_id: id,
        change_kind: "created",
      });
    }
  }

  const status = comparison.conflicts.length ? "pending" : "resolved";
  const { data: updated, error: updateError } = await supabase
    .from("chatthoughts_observation_thoughts")
    .update({
      summary: extracted.summary,
      points: extracted.main_points,
      other_points: extracted.other_points,
      added_point_indexes: comparison.non_conflicting_point_indexes,
      status,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    thought: updated,
    added: comparison.non_conflicting_point_indexes.length,
    needs_review: comparison.conflicts.length > 0,
  });
}
