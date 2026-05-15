import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["merge", "dismiss"]),
  when_needed: z.string().min(1).max(500).optional(),
  mantra: z.string().min(1).max(2000).optional(),
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
    .from("conflicts")
    .select("*")
    .eq("id", id)
    .single();
  if (cErr || !conflict) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (action === "dismiss") {
    const { error } = await supabase
      .from("conflicts")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.when_needed || !parsed.data.mantra) {
    return NextResponse.json(
      { error: "merge requires when_needed and mantra" },
      { status: 400 }
    );
  }

  const { data: merged, error: mErr } = await supabase
    .from("thoughts")
    .insert({
      when_needed: parsed.data.when_needed,
      mantra: parsed.data.mantra,
    })
    .select("*")
    .single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await supabase
    .from("conflicts")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      merged_id: merged.id,
    })
    .eq("id", id);

  if (parsed.data.delete_originals) {
    await supabase
      .from("thoughts")
      .delete()
      .in("id", [conflict.thought_a, conflict.thought_b]);
  }

  return NextResponse.json({ merged });
}
