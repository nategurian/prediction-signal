import { appConfig } from "@/lib/config";
import { minutesUntil } from "@/lib/utils/time";

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
  noAsk: number
): TradeEdgeResult {
  const { slippagePenalty, feePenalty, uncertaintyBuffer } = appConfig;

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
}

export function selectAction(params: ActionSelectionParams): SignalAction {
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
  } = params;

  if (hasOpenTradeForMarket) return "NO_TRADE";

  if (confidenceScore < appConfig.minConfidenceScore) return "NO_TRADE";

  const yesSpread = yesAsk - yesBid;
  const noSpread = noAsk - noBid;
  if (yesSpread > appConfig.maxSpread && noSpread > appConfig.maxSpread) return "NO_TRADE";

  if (settlementTime) {
    const minutes = minutesUntil(settlementTime);
    if (minutes < appConfig.maxMinutesBeforeSettlementToEnter) return "NO_TRADE";
  }

  const yesMinEdge =
    yesAsk >= appConfig.highEntryThreshold
      ? appConfig.highEntryMinEdge
      : appConfig.minTradeEdge;
  const noMinEdge =
    noAsk >= appConfig.highEntryThreshold
      ? appConfig.highEntryMinEdge
      : appConfig.minTradeEdge;

  const yesQualified = tradeEdgeYes >= yesMinEdge && yesSpread <= appConfig.maxSpread;
  const noQualified = tradeEdgeNo >= noMinEdge && noSpread <= appConfig.maxSpread;

  if (yesQualified && noQualified) {
    return tradeEdgeYes >= tradeEdgeNo ? "BUY_YES" : "BUY_NO";
  }
  if (yesQualified) return "BUY_YES";
  if (noQualified) return "BUY_NO";

  return "NO_TRADE";
}
