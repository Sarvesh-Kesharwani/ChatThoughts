import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

export type Thought = {
  id: string;
  raw: string | null;
  augmented: Record<string, unknown> | null;
  when_needed: string | null;
  mantra: string | null;
  created_at: string;
  updated_at: string;
};

export type Conflict = {
  id: string;
  thought_a: string;
  thought_b: string;
  kind: "duplicate" | "conflict";
  status: "open" | "resolved" | "dismissed";
  reason: string | null;
  merged_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type SchemaField = {
  key: string;
  label: string;
  type: "string" | "array";
  options?: string[];
};

export type OutputSchema = { fields: SchemaField[] };

export const DEFAULT_OUTPUT_SCHEMA: OutputSchema = {
  fields: [
    { key: "when_needed", label: "When user will need this thought/mantra", type: "string" },
    { key: "short", label: "Shortened version of that thought", type: "string" },
    {
      key: "areas",
      label: "Which parts of life this relates to",
      type: "array",
      options: [
        "study",
        "social life",
        "wife",
        "family",
        "money",
        "sleep",
        "mental peace",
        "bodybuilding",
        "general health",
        "career",
        "creativity",
      ],
    },
  ],
};

export async function getOutputSchema(): Promise<OutputSchema> {
  try {
    const { data, error } = await supabase
      .from("chatthoughts_settings")
      .select("output_schema")
      .eq("id", 1)
      .maybeSingle();
    if (error) return DEFAULT_OUTPUT_SCHEMA;
    const s = data?.output_schema as OutputSchema | undefined;
    if (s?.fields && Array.isArray(s.fields)) return s;
  } catch {
    /* table may not exist yet */
  }
  return DEFAULT_OUTPUT_SCHEMA;
}

// Augmented JSON is stored inside the existing `mantra` column as a serialized
// JSON string (until the schema migration adds dedicated `raw` + `augmented`
// columns). These helpers transparently encode/decode it.
export function encodeAugmented(augmented: Record<string, unknown>) {
  return JSON.stringify(augmented);
}

export function decodeAugmented(mantra: string | null): Record<string, unknown> | null {
  if (!mantra) return null;
  if (mantra[0] !== "{") return null;
  try {
    const v = JSON.parse(mantra);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function hydrateThought<T extends { mantra: string | null; raw?: string | null; augmented?: Record<string, unknown> | null }>(t: T): T {
  if (t.augmented) return t;
  const aug = decodeAugmented(t.mantra);
  if (!aug) return t;
  const raw = typeof aug._raw === "string" ? (aug._raw as string) : null;
  const { _raw, ...rest } = aug;
  void _raw;
  return { ...t, augmented: rest, raw: t.raw ?? raw };
}
