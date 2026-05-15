import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("conflicts")
    .select(
      "id, kind, status, reason, created_at, resolved_at, merged_id, thought_a, thought_b, a:thoughts!conflicts_thought_a_fkey(id, when_needed, mantra, updated_at), b:thoughts!conflicts_thought_b_fkey(id, when_needed, mantra, updated_at)"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conflicts: data });
}
