import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase, getOutputSchema, encodeAugmented } from "@/lib/supabase";
import { augmentThought } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  action: z.enum(["merge", "dismiss"]),
  raw: z.string().min(1).max(5000).optional(),
  delete_originals: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { action } = parsed.data;

  const { data: conflict, error: cErr } = await supabase
    .from("chatthoughts_conflicts")
    .select("*")
    .eq("id", id)
    .single();
  if (cErr || !conflict) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    const { error } = await supabase
      .from("chatthoughts_conflicts")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.raw) {
    return NextResponse.json({ error: "merge requires raw" }, { status: 400 });
  }

  const outputSchema = await getOutputSchema();
  const augmented = await augmentThought(parsed.data.raw, outputSchema);
  const when_needed = typeof augmented.when_needed === "string" ? augmented.when_needed : null;
  const mantra = encodeAugmented({ ...augmented, _raw: parsed.data.raw });

  const { data: merged, error: mErr } = await supabase
    .from("chatthoughts_thoughts")
    .insert({ when_needed, mantra })
    .select("*")
    .single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await supabase
    .from("chatthoughts_conflicts")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      merged_id: merged.id,
    })
    .eq("id", id);

  if (parsed.data.delete_originals) {
    await supabase
      .from("chatthoughts_thoughts")
      .delete()
      .in("id", [conflict.thought_a, conflict.thought_b]);
  }

  return NextResponse.json({ merged });
}
