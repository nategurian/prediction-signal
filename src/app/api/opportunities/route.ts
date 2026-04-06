import { NextResponse } from "next/server";
import { getActiveMarkets, getLatestSnapshot, getRecentSignals } from "@/lib/supabase/db";

export async function GET() {
  try {
    const markets = await getActiveMarkets();
    const signals = await getRecentSignals(200);

    const signalsByMarket = new Map(signals.map((s) => [s.market_id, s]));

    const opportunities = await Promise.all(
      markets.map(async (market) => {
        const snapshot = await getLatestSnapshot(market.id);
        const signal = signalsByMarket.get(market.id);

        return {
          market: {
            id: market.id,
            ticker: market.ticker,
            title: market.title,
            market_date: market.market_date,
            threshold_value: market.threshold_value,
            market_structure: market.market_structure,
            settlement_time: market.settlement_time,
          },
          yes_ask: snapshot?.yes_ask ?? null,
          no_ask: snapshot?.no_ask ?? null,
          yes_bid: snapshot?.yes_bid ?? null,
          no_bid: snapshot?.no_bid ?? null,
          modeled_yes_probability: signal?.modeled_yes_probability ?? null,
          modeled_no_probability: signal?.modeled_no_probability ?? null,
          trade_edge_yes: signal?.trade_edge_yes ?? null,
          trade_edge_no: signal?.trade_edge_no ?? null,
          confidence: signal?.confidence_score ?? null,
          signal_type: signal?.signal_type ?? null,
          worth_trading: signal?.worth_trading ?? false,
          explanation: signal?.explanation ?? null,
        };
      })
    );

    return NextResponse.json({ opportunities });
  } catch (err) {
    console.error("GET /api/opportunities error:", err);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}
