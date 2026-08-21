import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithRulebook } from "@/lib/deepseek";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  channel: z.enum(["Study", "GameDev", "Relaxation/Sleep", "Gym", "English", "General"]),
  question: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const { data, error } = await supabase.from("chatthoughts_rules").select("text").eq("channel", parsed.data.channel).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const answer = await chatWithRulebook(parsed.data.question, (data ?? []).map((rule, index) => ({ number: index + 1, text: rule.text })));
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("rulebook chat failed", error);
    return NextResponse.json({ error: "AI answer failed" }, { status: 502 });
  }
}
