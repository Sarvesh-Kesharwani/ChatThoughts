import { NextResponse } from "next/server";
import { z } from "zod";
import {
  supabase,
  getOutputSchema,
  encodeAugmented,
  hydrateThought,
} from "@/lib/supabase";
import { augmentThought } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

const patchSchema = z.object({
  raw: z.string().min(1).max(5000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || !parsed.data.raw) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const schema = await getOutputSchema();
  const augmented = await augmentThought(parsed.data.raw, schema);
  const when_needed = typeof augmented.when_needed === "string" ? augmented.when_needed : null;
  const mantra = encodeAugmented({ ...augmented, _raw: parsed.data.raw });

  const { data, error } = await supabase
    .from("chatthoughts_thoughts")
    .update({ when_needed, mantra })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thought: hydrateThought(data) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("chatthoughts_thoughts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
