import { NextResponse } from "next/server";
import { z } from "zod";
import {
  supabase,
  DEFAULT_CONFLICT_PROMPT,
  DEFAULT_OUTPUT_SCHEMA,
  getSettings,
  normalizeSettings,
} from "@/lib/supabase";

export const runtime = "nodejs";

const fieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "snake_case key"),
  label: z.string().min(1).max(200),
  type: z.enum(["string", "array"]),
  options: z.array(z.string()).optional(),
});

const outputSchema = z.object({
  fields: z.array(fieldSchema).min(1).max(20),
});

const settingsSchema = z.union([
  outputSchema,
  z.object({
    output_schema: outputSchema,
    conflict_prompt: z.string().trim().min(20).max(4000).optional(),
  }),
]);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("chatthoughts_settings")
      .select("output_schema, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const settings = data ? normalizeSettings(data.output_schema) : {
      output_schema: DEFAULT_OUTPUT_SCHEMA,
      conflict_prompt: DEFAULT_CONFLICT_PROMPT,
    };
    return NextResponse.json({ ...settings, updated_at: data?.updated_at ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid settings", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const current = await getSettings();
  const output_schema =
    "output_schema" in parsed.data ? parsed.data.output_schema : parsed.data;
  const conflict_prompt =
    "output_schema" in parsed.data
      ? parsed.data.conflict_prompt ?? current.conflict_prompt
      : current.conflict_prompt;
  try {
    const { error, data } = await supabase
      .from("chatthoughts_settings")
      .upsert(
        { id: 1, output_schema: { ...output_schema, conflict_prompt } },
        { onConflict: "id" }
      )
      .select("output_schema, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      output_schema,
      conflict_prompt,
      updated_at: data.updated_at,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
