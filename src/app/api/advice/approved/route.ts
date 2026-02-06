import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("advice_submissions")
    .select("id, image_url, ai_generated_text, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error:", error);
    return NextResponse.json(
      { error: "Failed to fetch advice" },
      { status: 500 }
    );
  }

  return NextResponse.json({ advice: data || [] });
}
