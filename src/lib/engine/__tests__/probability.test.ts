import { describe, it, expect } from "vitest";
import {
  computeBinaryProbability,
  computeBucketProbability,
  computeModeledProbability,
} from "../probability";

describe("computeBinaryProbability — direction: greater (default)", () => {
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

describe("computeBinaryProbability — direction: less", () => {
  it("forecast well below threshold → high P(YES) for 'less' market", () => {
    const p = computeBinaryProbability(65, 75, 2.5, "less");
    expect(p).toBeGreaterThan(0.99);
  });

  it("forecast well above threshold → low P(YES) for 'less' market", () => {
    const p = computeBinaryProbability(85, 75, 2.5, "less");
    expect(p).toBeLessThan(0.01);
  });

  it("forecast equals threshold → P(YES) ≈ 0.5 for 'less' market", () => {
    const p = computeBinaryProbability(75, 75, 2.5, "less");
    expect(p).toBeCloseTo(0.5, 3);
  });

  it("'greater' and 'less' are complements", () => {
    const pGreater = computeBinaryProbability(78, 75, 2.5, "greater");
    const pLess = computeBinaryProbability(78, 75, 2.5, "less");
    expect(pGreater + pLess).toBeCloseTo(1, 5);
  });

  it("real-world bug scenario: forecast 82.9, threshold 79, 'less' market → low P(YES)", () => {
    const p = computeBinaryProbability(82.9, 79, 2.5, "less");
    expect(p).toBeLessThan(0.1);
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
  it("binary threshold market (greater, default)", () => {
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

  it("binary threshold market with direction 'less'", () => {
    const result = computeModeledProbability({
      forecastHigh: 80,
      marketStructure: "binary_threshold",
      threshold: 75,
      thresholdDirection: "less",
      sigma: 2.5,
    });
    expect(result.modeledYesProbability).toBeLessThan(0.05);
    expect(result.modeledNoProbability).toBeGreaterThan(0.95);
    expect(result.thresholdDirection).toBe("less");
  });

  it("binary threshold directions are complements via computeModeledProbability", () => {
    const greater = computeModeledProbability({
      forecastHigh: 78,
      marketStructure: "binary_threshold",
      threshold: 75,
      thresholdDirection: "greater",
      sigma: 2.5,
    });
    const less = computeModeledProbability({
      forecastHigh: 78,
      marketStructure: "binary_threshold",
      threshold: 75,
      thresholdDirection: "less",
      sigma: 2.5,
    });
    expect(greater.modeledYesProbability + less.modeledYesProbability).toBeCloseTo(1, 5);
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
