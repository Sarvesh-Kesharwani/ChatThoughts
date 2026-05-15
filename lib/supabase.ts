import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing Supabase env vars");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Thought = {
  id: string;
  when_needed: string;
  mantra: string;
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
