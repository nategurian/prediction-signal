import { NextResponse } from "next/server";
import {
  getTradeById,
  getPostmortemByTrade,
  getSettlementByMarket,
} from "@/lib/supabase/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, must-revalidate" } as const;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const trade = await getTradeById(params.id);
    if (!trade) {
      return NextResponse.json(
        { error: "Trade not found" },
        { status: 404, headers: NO_STORE }
      );
    }

    const postmortem = await getPostmortemByTrade(trade.id);
    const settlement = await getSettlementByMarket(trade.market_id);

    return NextResponse.json({ trade, postmortem, settlement }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/trades/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch trade" },
      { status: 500, headers: NO_STORE }
    );
  }
}
