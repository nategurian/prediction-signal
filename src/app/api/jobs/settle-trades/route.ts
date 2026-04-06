import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getOpenTrades,
  getSettlementByMarket,
  updateMarketStatus,
} from "@/lib/supabase/db";
import { KalshiClient } from "@/lib/kalshi/client";
import { settleTrade } from "@/lib/engine/simulation";
import { generateAndSavePostmortem } from "@/lib/ai/postmortems";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const openTrades = await getOpenTrades();
    const client = new KalshiClient();
    let settled = 0;

    for (const trade of openTrades) {
      const existingSettlement = await getSettlementByMarket(trade.market_id);
      if (existingSettlement) continue;

      const supabase = getSupabaseAdmin();
      const { data: market } = await supabase
        .from("markets")
        .select("*")
        .eq("id", trade.market_id)
        .single();

      if (!market) continue;

      const kalshiMarket = await client.getMarket(market.ticker);
      if (!kalshiMarket) continue;

      if (kalshiMarket.result && kalshiMarket.result !== "") {
        const outcome = kalshiMarket.result;
        const settlementValue = outcome.toLowerCase() === "yes" ? 1 : 0;

        const settledTrade = await settleTrade(trade, outcome, settlementValue, market);

        await updateMarketStatus(market.id, "settled");

        try {
          await generateAndSavePostmortem(
            settledTrade,
            { id: "", market_id: market.id, settled_at: new Date().toISOString(), outcome, settlement_value: settlementValue, raw_json: null },
            { market_ticker: market.ticker, market_title: market.title, side: trade.side, entry_price: trade.entry_price, exit_price: settledTrade.exit_price, realized_pnl: settledTrade.realized_pnl }
          );
        } catch (err) {
          console.error("Postmortem generation failed:", err);
        }

        settled++;
      }
    }

    return NextResponse.json({ ok: true, trades_settled: settled });
  } catch (err) {
    console.error("settle-trades error:", err);
    return NextResponse.json({ error: "Failed to settle trades" }, { status: 500 });
  }
}
