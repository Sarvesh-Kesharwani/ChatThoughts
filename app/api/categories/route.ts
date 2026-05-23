import { NextResponse } from "next/server";
import { z } from "zod";
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

const categoryNameSchema = z.string().trim().min(1).max(80);
const putSchema = z.object({
  categories: z.array(categoryNameSchema).max(50),
});
const deleteSchema = z.object({
  name: categoryNameSchema,
});

function dedupeNames(names: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
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
    }));

  const labeledThoughts = new Set(labels.map((label) => label.thought_id));
  const memberThoughts = new Set(memberships.map((membership) => membership.thought_id));
  const uncategorized = thoughts.filter(
    (thought) => !labeledThoughts.has(thought.id) || !memberThoughts.has(thought.id)
  );

  return {
    existing_categories: categories.map((category) => category.name),
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
  if (state.existing_categories.length === 0) {
    return NextResponse.json(
      { error: "Add at least one category before running AI categorization." },
      { status: 400 }
    );
  }
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

  const allowedByLower = new Map(
    state.existing_categories.map((name) => [name.toLowerCase(), name])
  );
  const categoryNames = [
    ...new Set(
      result.categories
        .map((category) => allowedByLower.get(category.name.trim().toLowerCase()))
        .filter((name): name is string => Boolean(name))
    ),
  ];
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
    const allowedName = allowedByLower.get(category.name.trim().toLowerCase());
    if (!allowedName) return [];
    const categoryId = categoryIdByName.get(allowedName);
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

export async function PUT(req: Request) {
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid categories" }, { status: 400 });
  }
  const names = dedupeNames(parsed.data.categories);
  if (names.length > 0) {
    const rows = names.map((name) => ({
      name,
      kind: "existing" as const,
      reason: "User category",
    }));
    const { error } = await supabase
      .from("chatthoughts_categories")
      .upsert(rows, { onConflict: "name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  try {
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  const { error } = await supabase
    .from("chatthoughts_categories")
    .delete()
    .ilike("name", parsed.data.name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    return NextResponse.json(await loadState());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
