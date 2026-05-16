import { NextResponse } from "next/server";
import { supabase, hydrateThought } from "@/lib/supabase";

export const runtime = "nodejs";

type Lite = {
  id: string;
  when_needed: string | null;
  mantra: string | null;
  updated_at: string;
};

type Row = {
  id: string;
  kind: "duplicate" | "conflict";
  status: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  merged_id: string | null;
  thought_a: string;
  thought_b: string;
  a: Lite | null;
  b: Lite | null;
};

export async function GET() {
  const { data, error } = await supabase
    .from("chatthoughts_conflicts")
    .select(
      "id, kind, status, reason, created_at, resolved_at, merged_id, thought_a, thought_b, a:chatthoughts_thoughts!chatthoughts_conflicts_thought_a_fkey(id, when_needed, mantra, updated_at), b:chatthoughts_thoughts!chatthoughts_conflicts_thought_b_fkey(id, when_needed, mantra, updated_at)"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conflicts = (data as unknown as Row[] | null ?? []).map((c) => ({
    ...c,
    a: c.a ? hydrateThought(c.a) : null,
    b: c.b ? hydrateThought(c.b) : null,
  }));
  return NextResponse.json({ conflicts });
}
