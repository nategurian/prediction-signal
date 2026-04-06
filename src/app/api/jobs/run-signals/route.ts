import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getActiveMarkets,
  getLatestSnapshot,
  insertSignal,
  getTradesForMarket,
} from "@/lib/supabase/db";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { computeTradeEdges, selectAction } from "@/lib/engine/signal";
import { generateSignalExplanation, generateNoTradeExplanation } from "@/lib/ai/explanations";
import { openPaperTrade } from "@/lib/engine/simulation";
import { appConfig } from "@/lib/config";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const markets = await getActiveMarkets();
    let signalsCreated = 0;
    let tradesOpened = 0;

    for (const market of markets) {
      const snapshot = await getLatestSnapshot(market.id);
      if (!snapshot || snapshot.yes_ask == null || snapshot.no_ask == null) continue;

      const supabase = getSupabaseAdmin();
      const { data: modelOutput } = await supabase
        .from("model_outputs")
        .select("*")
        .eq("market_id", market.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .single();

      if (!modelOutput) continue;

      const modeledYesProb = modelOutput.modeled_probability as number;
      const edges = computeTradeEdges(modeledYesProb, snapshot.yes_ask, snapshot.no_ask);

      const existingTrades = await getTradesForMarket(market.id);
      const hasOpenTrade = existingTrades.length > 0;

      const action = selectAction({
        tradeEdgeYes: edges.tradeEdgeYes,
        tradeEdgeNo: edges.tradeEdgeNo,
        confidenceScore: modelOutput.confidence_score as number,
        yesAsk: snapshot.yes_ask,
        yesBid: snapshot.yes_bid ?? 0,
        noAsk: snapshot.no_ask,
        noBid: snapshot.no_bid ?? 0,
        settlementTime: market.settlement_time,
        hasOpenTradeForMarket: hasOpenTrade,
      });

      const worthTrading = action !== "NO_TRADE";

      const signalData = {
        market_ticker: market.ticker,
        market_title: market.title,
        market_structure: market.market_structure,
        threshold: market.threshold_value,
        yes_ask: snapshot.yes_ask,
        no_ask: snapshot.no_ask,
        yes_bid: snapshot.yes_bid,
        no_bid: snapshot.no_bid,
        modeled_yes_probability: modeledYesProb,
        modeled_no_probability: 1 - modeledYesProb,
        trade_edge_yes: edges.tradeEdgeYes,
        trade_edge_no: edges.tradeEdgeNo,
        effective_yes_entry: edges.effectiveYesEntry,
        effective_no_entry: edges.effectiveNoEntry,
        confidence_score: modelOutput.confidence_score,
        signal_type: action,
        model_version: appConfig.modelVersion,
      };

      let explanation: { summary: string; reasonCodes: string[] };
      try {
        explanation = worthTrading
          ? await generateSignalExplanation(signalData)
          : await generateNoTradeExplanation(signalData);
      } catch {
        explanation = { summary: `Signal: ${action}`, reasonCodes: [] };
      }

      const signal = await insertSignal({
        market_id: market.id,
        model_output_id: modelOutput.id,
        captured_at: new Date().toISOString(),
        signal_type: action,
        confidence_score: modelOutput.confidence_score as number,
        explanation: explanation.summary,
        reason_codes_json: explanation.reasonCodes,
        status: "active",
        modeled_yes_probability: modeledYesProb,
        modeled_no_probability: 1 - modeledYesProb,
        effective_yes_entry_price: edges.effectiveYesEntry,
        effective_no_entry_price: edges.effectiveNoEntry,
        trade_edge_yes: edges.tradeEdgeYes,
        trade_edge_no: edges.tradeEdgeNo,
        worth_trading: worthTrading,
        model_version: appConfig.modelVersion,
      });

      signalsCreated++;

      if (worthTrading && !hasOpenTrade) {
        const trade = await openPaperTrade(signal, snapshot, market);
        if (trade) tradesOpened++;
      }
    }

    return NextResponse.json({ ok: true, signals_created: signalsCreated, trades_opened: tradesOpened });
  } catch (err) {
    console.error("run-signals error:", err);
    return NextResponse.json({ error: "Failed to run signals" }, { status: 500 });
  }
}
