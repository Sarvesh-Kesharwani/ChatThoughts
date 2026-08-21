import { NextResponse } from "next/server";
import { z } from "zod";
import { compareObservationsWithRulebook, extractAtomicObservations } from "@/lib/deepseek";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHANNELS = ["Study", "GameDev", "Relaxation/Sleep", "Gym", "English", "General"] as const;
const channelSchema = z.enum(CHANNELS);

export async function GET(req: Request) {
  const channel = channelSchema.safeParse(new URL(req.url).searchParams.get("channel"));
  if (!channel.success) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const [thoughts, rules] = await Promise.all([
    supabase.from("chatthoughts_observation_thoughts").select("*").eq("channel", channel.data).order("created_at", { ascending: false }),
    supabase.from("chatthoughts_rules").select("*, chatthoughts_rule_versions(*)").eq("channel", channel.data).order("created_at", { ascending: true }),
  ]);
  if (thoughts.error || rules.error) return NextResponse.json({ error: thoughts.error?.message || rules.error?.message }, { status: 500 });
  return NextResponse.json({ thoughts: thoughts.data ?? [], rules: rules.data ?? [] });
}

const createSchema = z.object({ channel: channelSchema, raw: z.string().trim().min(1) });

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  let extracted: Awaited<ReturnType<typeof extractAtomicObservations>>;
  try { extracted = await extractAtomicObservations(parsed.data.raw); }
  catch (error) { console.error("observation extraction failed", error); return NextResponse.json({ error: "AI processing failed" }, { status: 502 }); }
  const points = extracted.main_points;
  const { data: currentRules, error: rulesError } = await supabase.from("chatthoughts_rules")
    .select("id,text").eq("channel", parsed.data.channel);
  if (rulesError) return NextResponse.json({ error: rulesError.message }, { status: 500 });
  let comparison;
  try { comparison = await compareObservationsWithRulebook(points, currentRules ?? []); }
  catch (error) { console.error("rule comparison failed", error); return NextResponse.json({ error: "AI comparison failed" }, { status: 502 }); }
  const { data, error } = await supabase.from("chatthoughts_observation_thoughts")
    .insert({ ...parsed.data, summary: extracted.summary, points, other_points: extracted.other_points, added_point_indexes: comparison.non_conflicting_point_indexes, status: comparison.conflicts.length ? "pending" : "resolved" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  for (const index of comparison.non_conflicting_point_indexes) {
    const { data: rule, error: ruleError } = await supabase.from("chatthoughts_rules").insert({ channel: parsed.data.channel, text: points[index], source_thought_id: data.id }).select("*").single();
    if (!ruleError && rule) await supabase.from("chatthoughts_rule_versions").insert({ rule_id: rule.id, version: 1, text: rule.text, source_thought_id: data.id, change_kind: "created" });
  }
  return NextResponse.json({ thought: data, added: comparison.non_conflicting_point_indexes.length, needs_review: comparison.conflicts.length > 0 });
}
