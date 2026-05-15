import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { findConflicts } from "@/lib/deepseek";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("thoughts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thoughts: data });
}

const createSchema = z.object({
  when_needed: z.string().min(1).max(500),
  mantra: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { when_needed, mantra } = parsed.data;

  const { data: existing, error: listErr } = await supabase
    .from("thoughts")
    .select("id, when_needed, mantra")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const { data: inserted, error: insErr } = await supabase
    .from("thoughts")
    .insert({ when_needed, mantra })
    .select("*")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  let matches: { id: string; kind: "duplicate" | "conflict"; reason: string }[] = [];
  if (existing && existing.length > 0) {
    try {
      matches = await findConflicts({ when_needed, mantra }, existing);
    } catch (e) {
      console.error("conflict check failed", e);
    }
  }

  if (matches.length > 0) {
    const rows = matches.map((m) => ({
      thought_a: inserted.id,
      thought_b: m.id,
      kind: m.kind,
      reason: m.reason,
    }));
    await supabase.from("conflicts").insert(rows).select();
  }

  return NextResponse.json({ thought: inserted, conflicts: matches });
}
