import { normalCdf } from "@/lib/utils/math";

export type ThresholdDirection = "greater" | "less";

/**
 * Binary threshold probability.
 * direction "greater" (default): P(actual_high > threshold) — market asks "above X?"
 * direction "less":              P(actual_high < threshold) — market asks "below X?"
 */
export function computeBinaryProbability(
  forecastHigh: number,
  threshold: number,
  sigma: number,
  direction: ThresholdDirection = "greater"
): number {
  if (direction === "less") {
    return normalCdf(threshold, forecastHigh, sigma);
  }
  return 1 - normalCdf(threshold, forecastHigh, sigma);
}

/**
 * Bucket/range: P(lower <= actual_high <= upper)
 * "Temperature will be between X and Y degrees"
 */
export function computeBucketProbability(
  forecastHigh: number,
  lowerBound: number,
  upperBound: number,
  sigma: number
): number {
  return normalCdf(upperBound, forecastHigh, sigma) - normalCdf(lowerBound, forecastHigh, sigma);
}

export interface ProbabilityResult {
  modeledYesProbability: number;
  modeledNoProbability: number;
  forecastHigh: number;
  threshold: number | null;
  thresholdDirection: ThresholdDirection | null;
  bucketLower: number | null;
  bucketUpper: number | null;
  sigma: number;
}

export function computeModeledProbability(params: {
  forecastHigh: number;
  marketStructure: "binary_threshold" | "bucket_range";
  threshold?: number | null;
  thresholdDirection?: ThresholdDirection | null;
  bucketLower?: number | null;
  bucketUpper?: number | null;
  sigma: number;
}): ProbabilityResult {
  let pYes: number;

  if (params.marketStructure === "binary_threshold") {
    if (params.threshold == null) throw new Error("threshold required for binary market");
    if (params.thresholdDirection == null) {
      // Historically we defaulted to "greater", which silently produced polarity-flipped
      // probabilities on "less" markets (see pre-Apr-15 incident). Fail loudly instead
      // so the caller can skip the market rather than trade on a coin-flipped signal.
      throw new Error("thresholdDirection required for binary_threshold market");
    }
    pYes = computeBinaryProbability(
      params.forecastHigh,
      params.threshold,
      params.sigma,
      params.thresholdDirection
    );
  } else {
    if (params.bucketLower == null || params.bucketUpper == null) {
      throw new Error("bucket bounds required for bucket market");
    }
    pYes = computeBucketProbability(
      params.forecastHigh,
      params.bucketLower,
      params.bucketUpper,
      params.sigma
    );
  }

  return {
    modeledYesProbability: pYes,
    modeledNoProbability: 1 - pYes,
    forecastHigh: params.forecastHigh,
    threshold: params.threshold ?? null,
    thresholdDirection: params.thresholdDirection ?? null,
    bucketLower: params.bucketLower ?? null,
    bucketUpper: params.bucketUpper ?? null,
    sigma: params.sigma,
  };
}
