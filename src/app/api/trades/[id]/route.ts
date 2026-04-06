import { NextResponse } from "next/server";
import {
  getTradeById,
  getPostmortemByTrade,
  getSettlementByMarket,
} from "@/lib/supabase/db";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const trade = await getTradeById(params.id);
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const postmortem = await getPostmortemByTrade(trade.id);
    const settlement = await getSettlementByMarket(trade.market_id);

    return NextResponse.json({ trade, postmortem, settlement });
  } catch (err) {
    console.error("GET /api/trades/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch trade" }, { status: 500 });
  }
}
