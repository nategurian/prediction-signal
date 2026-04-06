import { normalCdf } from "@/lib/utils/math";

/**
 * Binary threshold: P(actual_high > threshold)
 * "Will the temperature be above X degrees?"
 */
export function computeBinaryProbability(
  forecastHigh: number,
  threshold: number,
  sigma: number
): number {
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
  bucketLower: number | null;
  bucketUpper: number | null;
  sigma: number;
}

export function computeModeledProbability(params: {
  forecastHigh: number;
  marketStructure: "binary_threshold" | "bucket_range";
  threshold?: number | null;
  bucketLower?: number | null;
  bucketUpper?: number | null;
  sigma: number;
}): ProbabilityResult {
  let pYes: number;

  if (params.marketStructure === "binary_threshold") {
    if (params.threshold == null) throw new Error("threshold required for binary market");
    pYes = computeBinaryProbability(params.forecastHigh, params.threshold, params.sigma);
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
    bucketLower: params.bucketLower ?? null,
    bucketUpper: params.bucketUpper ?? null,
    sigma: params.sigma,
  };
}
