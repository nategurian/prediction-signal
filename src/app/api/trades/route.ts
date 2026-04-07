import { NextResponse } from "next/server";
import { getAllTrades } from "@/lib/supabase/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, must-revalidate" } as const;

export async function GET() {
  try {
    const trades = await getAllTrades();
    return NextResponse.json({ trades }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/trades error:", err);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500, headers: NO_STORE }
    );
  }
}
