import { NextResponse } from "next/server";
import { supabase, hydrateThought } from "@/lib/supabase";
import { categorizeThoughts } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

type ThoughtRow = {
  id: string;
  when_needed: string | null;
  mantra: string | null;
  created_at: string;
  updated_at: string;
  raw?: string | null;
  augmented?: Record<string, unknown> | null;
};

type LabelRow = {
  thought_id: string;
  title: string;
  tags: string[] | null;
  categorized_at: string;
};

type CategoryRow = {
  id: string;
  name: string;
  kind: "existing" | "new";
  reason: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  thought_id: string;
  category_id: string;
};

function stringsFrom(value: unknown) {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function inferredCategories(thoughts: ThoughtRow[]) {
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

async function loadState() {
  const [thoughtsRes, labelsRes, categoriesRes, membershipsRes] = await Promise.all([
    supabase
      .from("chatthoughts_thoughts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("chatthoughts_thought_labels")
      .select("thought_id, title, tags, categorized_at"),
    supabase
      .from("chatthoughts_categories")
      .select("id, name, kind, reason, created_at, updated_at")
      .order("name", { ascending: true }),
    supabase
      .from("chatthoughts_thought_categories")
      .select("thought_id, category_id"),
  ]);

  const error =
    thoughtsRes.error ?? labelsRes.error ?? categoriesRes.error ?? membershipsRes.error;
  if (error) throw new Error(error.message);

  const thoughts = ((thoughtsRes.data as ThoughtRow[] | null) ?? []).map((t) =>
    hydrateThought(t)
  );
  const labels = ((labelsRes.data as LabelRow[] | null) ?? []).filter((label) =>
    thoughts.some((thought) => thought.id === label.thought_id)
  );
  const categories = ((categoriesRes.data as CategoryRow[] | null) ?? []).filter(
    (category) => category.name.trim()
  );
  const memberships = ((membershipsRes.data as MembershipRow[] | null) ?? []).filter(
    (membership) => thoughts.some((thought) => thought.id === membership.thought_id)
  );

  const grouped = categories
    .map((category) => ({
      name: category.name,
      kind: category.kind,
      reason: category.reason ?? "",
      thought_ids: memberships
        .filter((membership) => membership.category_id === category.id)
        .map((membership) => membership.thought_id),
    }))
    .filter((category) => category.thought_ids.length > 0);

  const labeledThoughts = new Set(labels.map((label) => label.thought_id));
  const memberThoughts = new Set(memberships.map((membership) => membership.thought_id));
  const uncategorized = thoughts.filter(
    (thought) => !labeledThoughts.has(thought.id) || !memberThoughts.has(thought.id)
  );

  return {
    existing_categories: [
      ...new Set([...categories.map((category) => category.name), ...inferredCategories(thoughts)]),
    ].sort((a, b) => a.localeCompare(b)),
    thought_labels: labels.map((label) => ({
      id: label.thought_id,
      title: label.title,
      tags: label.tags ?? [],
    })),
    categories: grouped,
    thoughts,
    uncategorized_ids: uncategorized.map((thought) => thought.id),
    uncategorized_count: uncategorized.length,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST() {
  let state;
  try {
    state = await loadState();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const uncategorized = state.thoughts.filter((thought) =>
    state.uncategorized_ids.includes(thought.id)
  );
  if (uncategorized.length === 0) {
    return NextResponse.json({ ...state, processed_count: 0 });
  }

  let result;
  try {
    result = await categorizeThoughts(
      uncategorized.map((t) => ({
        id: t.id,
        raw: t.raw ?? null,
        augmented: t.augmented ?? null,
      })),
      state.existing_categories
    );
  } catch (e) {
    console.error("categorize failed", e);
    return NextResponse.json({ error: "AI categorization failed" }, { status: 502 });
  }

  const uncategorizedIds = new Set(uncategorized.map((thought) => thought.id));
  const labels = result.thought_labels
    .filter((label) => uncategorizedIds.has(label.id))
    .map((label) => ({
      thought_id: label.id,
      title: label.title.trim() || "Untitled thought",
      tags: label.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    }));

  if (labels.length > 0) {
    const { error } = await supabase
      .from("chatthoughts_thought_labels")
      .upsert(labels, { onConflict: "thought_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existingLower = new Set(state.existing_categories.map((name) => name.toLowerCase()));
  const categoryRowMap = new Map<string, { name: string; kind: "existing" | "new"; reason: string }>();
  for (const category of result.categories) {
    const name = category.name.trim();
    if (!name) continue;
    categoryRowMap.set(name, {
      name,
      kind: existingLower.has(name.toLowerCase()) ? "existing" : category.kind,
      reason: category.reason.trim(),
    });
  }
  const categoryRows = [...categoryRowMap.values()];

  if (categoryRows.length > 0) {
    const { error } = await supabase
      .from("chatthoughts_categories")
      .upsert(categoryRows, { onConflict: "name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const categoryNames = [...new Set(categoryRows.map((category) => category.name))];
  const { data: savedCategories, error: categoryLoadError } = await supabase
    .from("chatthoughts_categories")
    .select("id, name")
    .in("name", categoryNames.length ? categoryNames : [""]);
  if (categoryLoadError) {
    return NextResponse.json({ error: categoryLoadError.message }, { status: 500 });
  }

  const categoryIdByName = new Map(
    ((savedCategories as Pick<CategoryRow, "id" | "name">[] | null) ?? []).map((category) => [
      category.name,
      category.id,
    ])
  );
  const memberships = result.categories.flatMap((category) => {
    const categoryId = categoryIdByName.get(category.name.trim());
    if (!categoryId) return [];
    return category.thought_ids
      .filter((id) => uncategorizedIds.has(id))
      .map((id) => ({ thought_id: id, category_id: categoryId }));
  });

  if (memberships.length > 0) {
    const { error } = await supabase
      .from("chatthoughts_thought_categories")
      .upsert(memberships, { onConflict: "thought_id,category_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const nextState = await loadState();
    return NextResponse.json({ ...nextState, processed_count: uncategorized.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
