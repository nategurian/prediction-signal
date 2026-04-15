export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveMarkets } from "@/lib/supabase/db";

export async function GET() {
  try {
    const markets = await getActiveMarkets();
    return NextResponse.json({ markets });
  } catch (err) {
    console.error("GET /api/markets error:", err);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
