import { describe, it, expect } from "vitest";
import { computeConfidenceScore } from "../confidence";

describe("computeConfidenceScore", () => {
  it("returns value between 0 and 1", () => {
    const score = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 80,
      threshold: 75,
      previousForecastHigh: 79,
      yesBid: 0.70,
      yesAsk: 0.72,
      sigma: 2.5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("fresh forecast with big gap from threshold → high confidence", () => {
    const score = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 85,
      threshold: 75,
      previousForecastHigh: 84.5,
      yesBid: 0.94,
      yesAsk: 0.95,
      sigma: 2.5,
    });
    expect(score).toBeGreaterThan(0.7);
  });

  it("stale forecast → lower confidence", () => {
    const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const score = computeConfidenceScore({
      forecastTimestamp: staleTime,
      forecastHigh: 85,
      threshold: 75,
      previousForecastHigh: 84.5,
      yesBid: 0.94,
      yesAsk: 0.95,
      sigma: 2.5,
    });
    expect(score).toBeLessThan(0.7);
  });

  it("forecast right at threshold → lower distance component", () => {
    const atThreshold = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 75,
      threshold: 75,
      previousForecastHigh: 74.5,
      yesBid: 0.49,
      yesAsk: 0.51,
      sigma: 2.5,
    });
    const farFromThreshold = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 85,
      threshold: 75,
      previousForecastHigh: 84.5,
      yesBid: 0.49,
      yesAsk: 0.51,
      sigma: 2.5,
    });
    expect(farFromThreshold).toBeGreaterThan(atThreshold);
  });

  it("large forecast revision → lower stability component", () => {
    const stable = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 80,
      threshold: 75,
      previousForecastHigh: 80,
      yesBid: 0.70,
      yesAsk: 0.72,
      sigma: 2.5,
    });
    const volatile = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 80,
      threshold: 75,
      previousForecastHigh: 75,
      yesBid: 0.70,
      yesAsk: 0.72,
      sigma: 2.5,
    });
    expect(stable).toBeGreaterThan(volatile);
  });

  it("handles null previousForecastHigh gracefully", () => {
    const score = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 80,
      threshold: 75,
      previousForecastHigh: null,
      yesBid: 0.70,
      yesAsk: 0.72,
      sigma: 2.5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles null threshold gracefully", () => {
    const score = computeConfidenceScore({
      forecastTimestamp: new Date().toISOString(),
      forecastHigh: 80,
      threshold: null,
      previousForecastHigh: 79,
      yesBid: 0.70,
      yesAsk: 0.72,
      sigma: 2.5,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
