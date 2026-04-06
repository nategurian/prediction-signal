import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { getOpenTrades, getLatestSnapshot } from "@/lib/supabase/db";
import { markTradeToMarket } from "@/lib/engine/simulation";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const openTrades = await getOpenTrades();
    let marked = 0;

    for (const trade of openTrades) {
      const snapshot = await getLatestSnapshot(trade.market_id);
      if (!snapshot) continue;
      await markTradeToMarket(trade, snapshot);
      marked++;
    }

    return NextResponse.json({ ok: true, trades_marked: marked });
  } catch (err) {
    console.error("mark-trades error:", err);
    return NextResponse.json({ error: "Failed to mark trades" }, { status: 500 });
  }
}
