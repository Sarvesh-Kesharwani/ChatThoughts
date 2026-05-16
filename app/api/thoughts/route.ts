import { NextResponse } from "next/server";
import { z } from "zod";
import {
  supabase,
  getOutputSchema,
  encodeAugmented,
  hydrateThought,
} from "@/lib/supabase";
import { augmentThought, findConflicts } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = {
  id: string;
  when_needed: string | null;
  mantra: string | null;
  created_at: string;
  updated_at: string;
  raw?: string | null;
  augmented?: Record<string, unknown> | null;
};

export async function GET() {
  const { data, error } = await supabase
    .from("chatthoughts_thoughts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const thoughts = (data as Row[] | null ?? []).map((t) => hydrateThought(t));
  return NextResponse.json({ thoughts });
}

const createSchema = z.object({ raw: z.string().min(1).max(5000) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { raw } = parsed.data;

  const schema = await getOutputSchema();
  let augmented: Record<string, unknown>;
  try {
    augmented = await augmentThought(raw, schema);
  } catch (e) {
    console.error("augment failed", e);
    return NextResponse.json({ error: "AI augmentation failed" }, { status: 502 });
  }

  const when_needed = typeof augmented.when_needed === "string" ? augmented.when_needed : null;
  const mantra = encodeAugmented({ ...augmented, _raw: raw });

  const { data: existing, error: listErr } = await supabase
    .from("chatthoughts_thoughts")
    .select("id, when_needed, mantra")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const { data: inserted, error: insErr } = await supabase
    .from("chatthoughts_thoughts")
    .insert({ when_needed, mantra })
    .select("*")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const hydratedExisting = (existing as Row[] | null ?? []).map((t) =>
    hydrateThought(t)
  );

  let matches: { id: string; kind: "duplicate" | "conflict"; reason: string }[] = [];
  if (hydratedExisting.length > 0) {
    try {
      matches = await findConflicts(
        { raw, augmented },
        hydratedExisting.map((t) => ({
          id: t.id,
          raw: t.raw ?? null,
          augmented: t.augmented ?? null,
        }))
      );
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
    await supabase.from("chatthoughts_conflicts").insert(rows).select();
  }

  return NextResponse.json({ thought: hydrateThought(inserted as Row), conflicts: matches });
}
