import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase, DEFAULT_OUTPUT_SCHEMA } from "@/lib/supabase";

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

export async function GET() {
  const { data, error } = await supabase
    .from("chatthoughts_settings")
    .select("output_schema, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ output_schema: DEFAULT_OUTPUT_SCHEMA, updated_at: null });
  }
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = outputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid schema", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { error, data } = await supabase
    .from("chatthoughts_settings")
    .upsert({ id: 1, output_schema: parsed.data }, { onConflict: "id" })
    .select("output_schema, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
