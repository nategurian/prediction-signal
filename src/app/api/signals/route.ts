import { NextResponse } from "next/server";
import { getRecentSignals } from "@/lib/supabase/db";

export async function GET() {
  try {
    const signals = await getRecentSignals(50);
    return NextResponse.json({ signals });
  } catch (err) {
    console.error("GET /api/signals error:", err);
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
  }
}
