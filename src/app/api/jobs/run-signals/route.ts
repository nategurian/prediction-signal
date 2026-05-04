import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getActiveMarkets,
  getLatestSnapshot,
  insertSignal,
  getTradesForMarket,
} from "@/lib/supabase/db";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  computeTradeEdges,
  selectAction,
  type TradingConfig,
} from "@/lib/engine/signal";
import { generateSignalExplanation } from "@/lib/ai/explanations";
import { openPaperTrade } from "@/lib/engine/simulation";
import { getCityConfig, getSeriesConfig } from "@/lib/config";
import { sendSignalToTradingBot } from "@/lib/notifications/tradingBot";

/** Non-LLM line for Opportunities when we skip OpenAI (NO_TRADE). */
function noTradeSummaryFromSignalData(data: {
  modeled_yes_probability: number;
  trade_edge_yes: number;
  trade_edge_no: number;
}): { summary: string; reasonCodes: string[] } {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return {
    summary: `NO_TRADE · model P(YES) ${pct(data.modeled_yes_probability)} · edge YES ${pct(data.trade_edge_yes)} · edge NO ${pct(data.trade_edge_no)}`,
    reasonCodes: [],
  };
}

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const markets = await getActiveMarkets();
    let signalsCreated = 0;
    let tradesOpened = 0;
    let webhooksDelivered = 0;
    let webhooksFailed = 0;
    let webhooksSkipped = 0;

    for (const market of markets) {
      const cityConfig = getCityConfig(market.city_key);
      const seriesConfig = getSeriesConfig(market.city_key, market.variable);
      const tradingConfig: TradingConfig = {
        ...cityConfig,
        disabledMarketStructures: seriesConfig.disabledMarketStructures,
      };

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
      const edges = computeTradeEdges(modeledYesProb, snapshot.yes_ask, snapshot.no_ask, tradingConfig);

      const existingTrades = await getTradesForMarket(market.id);
      const hasOpenTrade = existingTrades.length > 0;

      const featureJson = (modelOutput.feature_json ?? {}) as Record<string, unknown>;
      const effectiveSigma = typeof featureJson.sigma === "number" ? featureJson.sigma : null;
      const bucketWidth =
        market.bucket_upper != null && market.bucket_lower != null
          ? market.bucket_upper - market.bucket_lower
          : null;

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
        marketStructure: market.market_structure,
        modeledYesProbability: modeledYesProb,
        bucketWidth,
        effectiveSigma,
      }, tradingConfig);

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
        model_version: seriesConfig.modelVersion,
      };

      let explanation: { summary: string; reasonCodes: string[] };
      if (worthTrading) {
        try {
          explanation = await generateSignalExplanation(signalData);
        } catch {
          explanation = { summary: `Signal: ${action}`, reasonCodes: [] };
        }
      } else {
        explanation = noTradeSummaryFromSignalData({
          modeled_yes_probability: modeledYesProb,
          trade_edge_yes: edges.tradeEdgeYes,
          trade_edge_no: edges.tradeEdgeNo,
        });
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
        model_version: seriesConfig.modelVersion,
      });

      signalsCreated++;

      if (worthTrading && !hasOpenTrade) {
        // Forward the signal to the live trading bot first. We don't gate
        // the paper trade on this — the simulation must run regardless so
        // backtest data stays continuous when the bot is offline.
        const delivery = await sendSignalToTradingBot({ signal, snapshot, market });
        if (delivery.skipped) {
          webhooksSkipped++;
        } else if (delivery.ok) {
          webhooksDelivered++;
          console.log(
            `[run-signals] webhook ok signal=${signal.id} ticker=${market.ticker} status=${delivery.status}`
          );
        } else {
          webhooksFailed++;
          console.error(
            `[run-signals] webhook failed signal=${signal.id} ticker=${market.ticker} status=${delivery.status ?? "n/a"} error=${delivery.error ?? "n/a"} response=${JSON.stringify(delivery.response)}`
          );
        }

        const trade = await openPaperTrade(signal, snapshot, market);
        if (trade) tradesOpened++;
      }
    }

    return NextResponse.json({
      ok: true,
      signals_created: signalsCreated,
      trades_opened: tradesOpened,
      webhooks_delivered: webhooksDelivered,
      webhooks_failed: webhooksFailed,
      webhooks_skipped: webhooksSkipped,
    });
  } catch (err) {
    console.error("run-signals error:", err);
    return NextResponse.json({ error: "Failed to run signals" }, { status: 500 });
  }
}
