import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type SacrificeRow = {
  id: string;
  parent_id: string | null;
  kind: "vardaan" | "sacrifice";
  text: string;
  created_at: string;
  updated_at: string;
};

type BaliCard = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type VardaanCard = BaliCard & {
  sacrifices: BaliCard[];
};

function toCard(row: SacrificeRow): BaliCard {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateCards(rows: SacrificeRow[]): VardaanCard[] {
  const roots = rows
    .filter((row) => row.kind === "vardaan")
    .map((row) => ({ ...toCard(row), sacrifices: [] as BaliCard[] }));
  const byId = new Map(roots.map((card) => [card.id, card]));

  for (const row of rows) {
    if (row.kind !== "sacrifice" || !row.parent_id) continue;
    byId.get(row.parent_id)?.sacrifices.push(toCard(row));
  }

  return roots.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function GET() {
  const { data, error } = await supabase
    .from("chatthoughts_sacrifice_cards")
    .select("id, parent_id, kind, text, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: hydrateCards((data ?? []) as SacrificeRow[]) });
}

const createSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  parent_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const parentId = parsed.data.parent_id ?? null;
  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("chatthoughts_sacrifice_cards")
      .select("id, kind")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) {
      return NextResponse.json({ error: parentError.message }, { status: 500 });
    }
    if (!parent || parent.kind !== "vardaan") {
      return NextResponse.json({ error: "parent Vardaan/Goal not found" }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("chatthoughts_sacrifice_cards")
    .insert({
      text: parsed.data.text,
      parent_id: parentId,
      kind: parentId ? "sacrifice" : "vardaan",
    })
    .select("id, parent_id, kind, text, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: toCard(data as SacrificeRow) });
}
