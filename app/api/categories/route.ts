import { NextResponse } from "next/server";
import { supabase, hydrateThought } from "@/lib/supabase";
import { categorizeThoughts } from "@/lib/deepseek";

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

function stringsFrom(value: unknown) {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function existingCategories(thoughts: Row[]) {
  const names = new Set<string>();
  for (const thought of thoughts) {
    const aug = thought.augmented ?? {};
    for (const key of ["areas", "area", "tags", "tag", "category", "categories"]) {
      for (const name of stringsFrom((aug as Record<string, unknown>)[key])) {
        names.add(name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function POST() {
  let data: Row[] | null = null;
  try {
    const result = await supabase
      .from("chatthoughts_thoughts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    data = result.data as Row[] | null;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const thoughts = (data as Row[] | null ?? []).map((t) => hydrateThought(t));
  const ids = new Set(thoughts.map((t) => t.id));
  const existing = existingCategories(thoughts);

  let result;
  try {
    result = await categorizeThoughts(
      thoughts.map((t) => ({
        id: t.id,
        raw: t.raw ?? null,
        augmented: t.augmented ?? null,
      })),
      existing
    );
  } catch (e) {
    console.error("categorize failed", e);
    return NextResponse.json({ error: "AI categorization failed" }, { status: 502 });
  }

  const existingLower = new Set(existing.map((name) => name.toLowerCase()));
  const thought_labels = result.thought_labels.filter((label) => ids.has(label.id));
  const categories = result.categories
    .map((category) => ({
      ...category,
      name: category.name.trim(),
      kind: existingLower.has(category.name.trim().toLowerCase())
        ? ("existing" as const)
        : category.kind,
      thought_ids: category.thought_ids.filter((id) => ids.has(id)),
    }))
    .filter((category) => category.name && category.thought_ids.length > 0);

  return NextResponse.json({
    existing_categories: existing,
    thought_labels,
    categories,
    thoughts,
  });
}
