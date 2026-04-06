import { describe, it, expect } from "vitest";
import {
  computeBinaryProbability,
  computeBucketProbability,
  computeModeledProbability,
} from "../probability";

describe("computeBinaryProbability", () => {
  it("forecast well above threshold → high P(YES)", () => {
    const p = computeBinaryProbability(85, 75, 2.5);
    expect(p).toBeGreaterThan(0.99);
  });

  it("forecast well below threshold → low P(YES)", () => {
    const p = computeBinaryProbability(65, 75, 2.5);
    expect(p).toBeLessThan(0.01);
  });

  it("forecast equals threshold → P(YES) ≈ 0.5", () => {
    const p = computeBinaryProbability(75, 75, 2.5);
    expect(p).toBeCloseTo(0.5, 3);
  });

  it("forecast 1 sigma above threshold → P(YES) ≈ 0.8413", () => {
    const p = computeBinaryProbability(77.5, 75, 2.5);
    expect(p).toBeCloseTo(0.8413, 3);
  });

  it("forecast 1 sigma below threshold → P(YES) ≈ 0.1587", () => {
    const p = computeBinaryProbability(72.5, 75, 2.5);
    expect(p).toBeCloseTo(0.1587, 3);
  });
});

describe("computeBucketProbability", () => {
  it("bucket centered on forecast has highest probability", () => {
    const centered = computeBucketProbability(75, 73, 77, 2.5);
    const offset = computeBucketProbability(75, 78, 82, 2.5);
    expect(centered).toBeGreaterThan(offset);
  });

  it("very wide bucket captures most probability", () => {
    const p = computeBucketProbability(75, 60, 90, 2.5);
    expect(p).toBeGreaterThan(0.99);
  });

  it("very narrow bucket far from forecast has low probability", () => {
    const p = computeBucketProbability(75, 85, 90, 2.5);
    expect(p).toBeLessThan(0.01);
  });

  it("symmetric bucket: P(μ-2σ to μ) ≈ P(μ to μ+2σ)", () => {
    const left = computeBucketProbability(75, 70, 75, 2.5);
    const right = computeBucketProbability(75, 75, 80, 2.5);
    expect(left).toBeCloseTo(right, 3);
  });
});

describe("computeModeledProbability", () => {
  it("binary threshold market", () => {
    const result = computeModeledProbability({
      forecastHigh: 80,
      marketStructure: "binary_threshold",
      threshold: 75,
      sigma: 2.5,
    });
    expect(result.modeledYesProbability).toBeGreaterThan(0.95);
    expect(result.modeledNoProbability).toBeLessThan(0.05);
    expect(result.modeledYesProbability + result.modeledNoProbability).toBeCloseTo(1, 5);
  });

  it("bucket market", () => {
    const result = computeModeledProbability({
      forecastHigh: 75,
      marketStructure: "bucket_range",
      bucketLower: 73,
      bucketUpper: 77,
      sigma: 2.5,
    });
    expect(result.modeledYesProbability).toBeGreaterThan(0.3);
    expect(result.modeledYesProbability).toBeLessThan(0.7);
  });

  it("throws for binary without threshold", () => {
    expect(() =>
      computeModeledProbability({
        forecastHigh: 75,
        marketStructure: "binary_threshold",
        sigma: 2.5,
      })
    ).toThrow("threshold required");
  });

  it("throws for bucket without bounds", () => {
    expect(() =>
      computeModeledProbability({
        forecastHigh: 75,
        marketStructure: "bucket_range",
        sigma: 2.5,
      })
    ).toThrow("bucket bounds required");
  });
});
