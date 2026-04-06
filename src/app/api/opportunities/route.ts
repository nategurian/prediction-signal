import { NextResponse } from "next/server";
import {
  getActiveMarkets,
  getLatestSnapshot,
  getRecentSignals,
  getLatestModelOutput,
  getTradesForMarket,
  type Signal,
} from "@/lib/supabase/db";
import { computeTradeEdges, selectAction } from "@/lib/engine/signal";

export async function GET() {
  try {
    const markets = await getActiveMarkets();
    const signals = await getRecentSignals(200);

    // Signals are newest-first; keep first occurrence per market (newest for that market).
    const signalsByMarket = new Map<string, Signal>();
    for (const s of signals) {
      if (!signalsByMarket.has(s.market_id)) {
        signalsByMarket.set(s.market_id, s);
      }
    }

    const opportunities = await Promise.all(
      markets.map(async (market) => {
        const snapshot = await getLatestSnapshot(market.id);
        const signal = signalsByMarket.get(market.id);

        if (signal) {
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
            modeled_yes_probability: signal.modeled_yes_probability,
            modeled_no_probability: signal.modeled_no_probability,
            trade_edge_yes: signal.trade_edge_yes,
            trade_edge_no: signal.trade_edge_no,
            confidence: signal.confidence_score,
            signal_type: signal.signal_type,
            worth_trading: signal.worth_trading,
            explanation: signal.explanation,
          };
        }

        const modelOutput = await getLatestModelOutput(market.id);
        if (
          snapshot &&
          snapshot.yes_ask != null &&
          snapshot.no_ask != null &&
          modelOutput
        ) {
          const modeledYesProb = modelOutput.modeled_probability;
          const edges = computeTradeEdges(modeledYesProb, snapshot.yes_ask, snapshot.no_ask);
          const existingTrades = await getTradesForMarket(market.id);
          const action = selectAction({
            tradeEdgeYes: edges.tradeEdgeYes,
            tradeEdgeNo: edges.tradeEdgeNo,
            confidenceScore: modelOutput.confidence_score,
            yesAsk: snapshot.yes_ask,
            yesBid: snapshot.yes_bid ?? 0,
            noAsk: snapshot.no_ask,
            noBid: snapshot.no_bid ?? 0,
            settlementTime: market.settlement_time,
            hasOpenTradeForMarket: existingTrades.length > 0,
          });
          const worthTrading = action !== "NO_TRADE";

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
            yes_ask: snapshot.yes_ask,
            no_ask: snapshot.no_ask,
            yes_bid: snapshot.yes_bid,
            no_bid: snapshot.no_bid,
            modeled_yes_probability: modeledYesProb,
            modeled_no_probability: 1 - modeledYesProb,
            trade_edge_yes: edges.tradeEdgeYes,
            trade_edge_no: edges.tradeEdgeNo,
            confidence: modelOutput.confidence_score,
            signal_type: action,
            worth_trading: worthTrading,
            explanation: null,
          };
        }

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
          modeled_yes_probability: null,
          modeled_no_probability: null,
          trade_edge_yes: null,
          trade_edge_no: null,
          confidence: null,
          signal_type: null,
          worth_trading: false,
          explanation: null,
        };
      })
    );

    return NextResponse.json({ opportunities });
  } catch (err) {
    console.error("GET /api/opportunities error:", err);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}
