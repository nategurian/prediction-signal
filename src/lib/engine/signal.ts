import { minutesUntil } from "@/lib/utils/time";
import type { MarketStructure } from "@/lib/config";

export interface TradingConfig {
  slippagePenalty: number;
  feePenalty: number;
  uncertaintyBuffer: number;
  minTradeEdge: number;
  minConfidenceScore: number;
  maxSpread: number;
  maxMinutesBeforeSettlementToEnter: number;
  highEntryThreshold: number;
  highEntryMinEdge: number;
  maxNoEntryPrice: number;
  maxYesModeledProbability: number;
  disableBucketRangeYes: boolean;
  disabledMarketStructures: readonly MarketStructure[];
}

export type SignalAction = "BUY_YES" | "BUY_NO" | "NO_TRADE";

export interface TradeEdgeResult {
  effectiveYesEntry: number;
  effectiveNoEntry: number;
  tradeEdgeYes: number;
  tradeEdgeNo: number;
}

export function computeTradeEdges(
  modeledYesProb: number,
  yesAsk: number,
  noAsk: number,
  config: TradingConfig
): TradeEdgeResult {
  const { slippagePenalty, feePenalty, uncertaintyBuffer } = config;

  const effectiveYesEntry = yesAsk + slippagePenalty + feePenalty + uncertaintyBuffer;
  const effectiveNoEntry = noAsk + slippagePenalty + feePenalty + uncertaintyBuffer;

  const tradeEdgeYes = modeledYesProb - effectiveYesEntry;
  const modeledNoProb = 1 - modeledYesProb;
  const tradeEdgeNo = modeledNoProb - effectiveNoEntry;

  return { effectiveYesEntry, effectiveNoEntry, tradeEdgeYes, tradeEdgeNo };
}

export interface ActionSelectionParams {
  tradeEdgeYes: number;
  tradeEdgeNo: number;
  confidenceScore: number;
  yesAsk: number;
  yesBid: number;
  noAsk: number;
  noBid: number;
  settlementTime: string | null;
  hasOpenTradeForMarket: boolean;
  marketStructure: MarketStructure;
  modeledYesProbability: number;
}

export function selectAction(params: ActionSelectionParams, config: TradingConfig): SignalAction {
  const {
    tradeEdgeYes,
    tradeEdgeNo,
    confidenceScore,
    yesAsk,
    yesBid,
    noAsk,
    noBid,
    settlementTime,
    hasOpenTradeForMarket,
    marketStructure,
    modeledYesProbability,
  } = params;

  if (hasOpenTradeForMarket) return "NO_TRADE";

  if (config.disabledMarketStructures.includes(marketStructure)) return "NO_TRADE";

  if (confidenceScore < config.minConfidenceScore) return "NO_TRADE";

  const yesSpread = yesAsk - yesBid;
  const noSpread = noAsk - noBid;
  if (yesSpread > config.maxSpread && noSpread > config.maxSpread) return "NO_TRADE";

  if (settlementTime) {
    const minutes = minutesUntil(settlementTime);
    if (minutes < config.maxMinutesBeforeSettlementToEnter) return "NO_TRADE";
  }

  const yesMinEdge =
    yesAsk >= config.highEntryThreshold
      ? config.highEntryMinEdge
      : config.minTradeEdge;
  const noMinEdge =
    noAsk >= config.highEntryThreshold
      ? config.highEntryMinEdge
      : config.minTradeEdge;

  // YES-side structural gates (data-driven, Apr 2026 audit):
  //   1) bucket_range YES has observed 0/18 win rate across all sampled trades.
  //   2) binary_threshold YES with modeled pYes >= 0.5 has 1/16 wins —
  //      model overestimates near-certain YES outcomes. Only "cheap longshot"
  //      YES bets (modeled pYes in ~0.1-0.3, entered <10c) have been profitable.
  const bucketYesBlocked =
    marketStructure === "bucket_range" && config.disableBucketRangeYes;
  const yesModeledTooHigh = modeledYesProbability >= config.maxYesModeledProbability;
  const yesStructurallyBlocked = bucketYesBlocked || yesModeledTooHigh;

  const yesQualified =
    !yesStructurallyBlocked &&
    tradeEdgeYes >= yesMinEdge &&
    yesSpread <= config.maxSpread;

  const noEntryTooExpensive = noAsk > config.maxNoEntryPrice;
  const noQualified =
    tradeEdgeNo >= noMinEdge && noSpread <= config.maxSpread && !noEntryTooExpensive;

  if (yesQualified && noQualified) {
    return tradeEdgeYes >= tradeEdgeNo ? "BUY_YES" : "BUY_NO";
  }
  if (yesQualified) return "BUY_YES";
  if (noQualified) return "BUY_NO";

  return "NO_TRADE";
}
