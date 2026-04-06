import { NextResponse } from "next/server";
import { getAllTrades } from "@/lib/supabase/db";

export async function GET() {
  try {
    const trades = await getAllTrades();
    return NextResponse.json({ trades });
  } catch (err) {
    console.error("GET /api/trades error:", err);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
