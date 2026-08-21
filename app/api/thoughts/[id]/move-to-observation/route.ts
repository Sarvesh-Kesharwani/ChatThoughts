import { NextResponse } from "next/server";
import { z } from "zod";
import { compareObservationsWithRulebook, extractAtomicObservations } from "@/lib/deepseek";
import { hydrateThought, supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ channel: z.enum(["Study", "GameDev", "Relaxation/Sleep", "Gym", "English", "General"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const { data: source, error: sourceError } = await supabase.from("chatthoughts_thoughts").select("*").eq("id", id).single();
  if (sourceError || !source) return NextResponse.json({ error: sourceError?.message || "Thought not found" }, { status: 404 });
  const thought = hydrateThought(source);
  const raw = thought.raw || thought.mantra || thought.when_needed;
  if (!raw) return NextResponse.json({ error: "Thought has no movable text" }, { status: 400 });

  let extracted: Awaited<ReturnType<typeof extractAtomicObservations>>;
  try { extracted = await extractAtomicObservations(raw); }
  catch (error) { console.error("legacy thought extraction failed", error); return NextResponse.json({ error: "AI processing failed" }, { status: 502 }); }
  const { data: rules, error: rulesError } = await supabase.from("chatthoughts_rules").select("id,text").eq("channel", parsed.data.channel).eq("is_active", true);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
  let comparison;
  try { comparison = await compareObservationsWithRulebook(extracted.main_points, rules ?? []); }
  catch (error) { console.error("legacy move comparison failed", error); return NextResponse.json({ error: "AI comparison failed" }, { status: 502 }); }

  const { data: moved, error: insertError } = await supabase.from("chatthoughts_observation_thoughts").insert({
    channel: parsed.data.channel,
    raw,
    summary: extracted.summary,
    points: extracted.main_points,
    other_points: extracted.other_points,
    added_point_indexes: comparison.non_conflicting_point_indexes,
    status: comparison.conflicts.length ? "pending" : "resolved",
    legacy_thought_id: id,
  }).select("*").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  for (const index of comparison.non_conflicting_point_indexes) {
    const text = extracted.main_points[index];
    const { data: rule, error: ruleError } = await supabase.from("chatthoughts_rules").insert({ channel: parsed.data.channel, text, source_thought_id: moved.id }).select("*").single();
    if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 500 });
    await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version: 1, text, source_thought_id: moved.id, change_kind: "created" });
  }

  const { error: deleteError } = await supabase.from("chatthoughts_thoughts").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: `Moved, but source cleanup failed: ${deleteError.message}` }, { status: 500 });
  return NextResponse.json({ moved: true, observation_thought_id: moved.id, added: comparison.non_conflicting_point_indexes.length, needs_review: comparison.conflicts.length > 0 });
}
