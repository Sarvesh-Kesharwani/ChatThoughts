import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("chatthoughts_rules")
    .update({ is_active: false })
    .eq("id", id)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
