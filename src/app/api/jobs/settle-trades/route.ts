import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getOpenTrades,
  getSettlementByMarket,
  getSignalById,
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
          const signal = await getSignalById(trade.signal_id);
          const contractStyle = market.ticker.includes("-B")
            ? "bucket"
            : market.ticker.includes("-T")
              ? "threshold"
              : "unknown";

          await generateAndSavePostmortem(
            settledTrade,
            { id: "", market_id: market.id, settled_at: new Date().toISOString(), outcome, settlement_value: settlementValue, raw_json: null },
            {
              market_ticker: market.ticker,
              market_title: market.title,
              market_date: market.market_date,
              city_key: market.city_key,
              niche_key: market.niche_key,
              contract_style: contractStyle,
              side: trade.side,
              quantity: trade.quantity,
              entry_price: trade.entry_price,
              exit_price: settledTrade.exit_price,
              realized_pnl: settledTrade.realized_pnl,
              signal_type: signal?.signal_type ?? null,
              confidence_score: signal?.confidence_score ?? null,
              modeled_yes_probability: signal?.modeled_yes_probability ?? null,
              modeled_no_probability: signal?.modeled_no_probability ?? null,
              trade_edge_yes: signal?.trade_edge_yes ?? null,
              trade_edge_no: signal?.trade_edge_no ?? null,
              model_version: signal?.model_version ?? null,
            }
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
