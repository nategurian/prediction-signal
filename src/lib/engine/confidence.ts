import { clamp } from "@/lib/utils/math";
import { hoursAgo } from "@/lib/utils/time";
import type { ConfidenceWeights } from "@/lib/config";

export interface ConfidenceInputs {
  forecastTimestamp: string;
  forecastHigh: number;
  threshold: number | null;
  previousForecastHigh: number | null;
  yesBid: number | null;
  yesAsk: number | null;
  sigma: number;
}

function computeFreshnessComponent(forecastTimestamp: string): number {
  const hours = hoursAgo(forecastTimestamp);
  if (hours <= 1) return 1.0;
  if (hours <= 3) return 0.8;
  if (hours <= 6) return 0.6;
  if (hours <= 12) return 0.3;
  return 0.1;
}

function computeThresholdDistanceComponent(
  forecastHigh: number,
  threshold: number | null,
  sigma: number
): number {
  if (threshold == null) return 0.5;
  const distance = Math.abs(forecastHigh - threshold);
  const normalizedDistance = distance / sigma;
  if (normalizedDistance >= 2.0) return 1.0;
  if (normalizedDistance >= 1.0) return 0.7;
  if (normalizedDistance >= 0.5) return 0.4;
  return 0.2;
}

function computeRevisionStabilityComponent(
  forecastHigh: number,
  previousForecastHigh: number | null,
  sigma: number
): number {
  if (previousForecastHigh == null) return 0.5;
  const revision = Math.abs(forecastHigh - previousForecastHigh);
  const normalizedRevision = revision / sigma;
  if (normalizedRevision <= 0.25) return 1.0;
  if (normalizedRevision <= 0.5) return 0.8;
  if (normalizedRevision <= 1.0) return 0.5;
  return 0.2;
}

function computeSpreadQualityComponent(
  yesBid: number | null,
  yesAsk: number | null
): number {
  if (yesBid == null || yesAsk == null) return 0.3;
  const spread = yesAsk - yesBid;
  if (spread <= 0.02) return 1.0;
  if (spread <= 0.04) return 0.8;
  if (spread <= 0.06) return 0.5;
  return 0.2;
}

export function computeConfidenceScore(inputs: ConfidenceInputs, weights: ConfidenceWeights): number {
  const freshness = computeFreshnessComponent(inputs.forecastTimestamp);
  const thresholdDist = computeThresholdDistanceComponent(
    inputs.forecastHigh,
    inputs.threshold,
    inputs.sigma
  );
  const revisionStability = computeRevisionStabilityComponent(
    inputs.forecastHigh,
    inputs.previousForecastHigh,
    inputs.sigma
  );
  const spreadQuality = computeSpreadQualityComponent(inputs.yesBid, inputs.yesAsk);

  const score =
    weights.forecastFreshness * freshness +
    weights.thresholdDistance * thresholdDist +
    weights.revisionStability * revisionStability +
    weights.spreadQuality * spreadQuality;

  return clamp(score, 0, 1);
}
