import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase, hydrateThought } from "@/lib/supabase";
import { rankThoughts } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ query: z.string().min(1).max(1000) });

type Row = {
  id: string;
  when_needed: string | null;
  mantra: string | null;
  raw?: string | null;
  augmented?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { query } = parsed.data;

  const { data, error } = await supabase
    .from("chatthoughts_thoughts")
    .select("id, when_needed, mantra, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const thoughts = (data as Row[] | null ?? []).map((t) => hydrateThought(t));
  const ranked = await rankThoughts(
    query,
    thoughts.map((t) => ({ id: t.id, raw: t.raw ?? null, augmented: t.augmented ?? null }))
  );
  const byId = new Map(thoughts.map((t) => [t.id, t]));
  const results = ranked
    .map((r) => {
      const t = byId.get(r.id);
      if (!t) return null;
      return { ...t, score: r.score, reason: r.reason };
    })
    .filter(Boolean);
  return NextResponse.json({ results });
}
