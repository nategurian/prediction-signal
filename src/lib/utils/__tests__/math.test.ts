import { describe, it, expect } from "vitest";
import { erf, standardNormalCdf, normalCdf, normalPdf, clamp } from "../math";

describe("erf", () => {
  it("erf(0) = 0", () => {
    expect(erf(0)).toBeCloseTo(0, 7);
  });

  it("erf(1) ≈ 0.8427", () => {
    expect(erf(1)).toBeCloseTo(0.8427, 3);
  });

  it("erf(-1) ≈ -0.8427", () => {
    expect(erf(-1)).toBeCloseTo(-0.8427, 3);
  });

  it("erf(2) ≈ 0.9953", () => {
    expect(erf(2)).toBeCloseTo(0.9953, 3);
  });

  it("is an odd function: erf(-x) = -erf(x)", () => {
    expect(erf(-1.5)).toBeCloseTo(-erf(1.5), 7);
  });
});

describe("standardNormalCdf", () => {
  it("Φ(0) = 0.5", () => {
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 7);
  });

  it("Φ(1) ≈ 0.8413", () => {
    expect(standardNormalCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it("Φ(-1) ≈ 0.1587", () => {
    expect(standardNormalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("Φ(2) ≈ 0.9772", () => {
    expect(standardNormalCdf(2)).toBeCloseTo(0.9772, 3);
  });

  it("Φ(-∞) approaches 0", () => {
    expect(standardNormalCdf(-10)).toBeLessThan(0.0001);
  });

  it("Φ(+∞) approaches 1", () => {
    expect(standardNormalCdf(10)).toBeGreaterThan(0.9999);
  });
});

describe("normalCdf", () => {
  it("P(X <= 75 | μ=75, σ=2.5) = 0.5", () => {
    expect(normalCdf(75, 75, 2.5)).toBeCloseTo(0.5, 5);
  });

  it("P(X <= 77.5 | μ=75, σ=2.5) ≈ 0.8413 (1 sigma above)", () => {
    expect(normalCdf(77.5, 75, 2.5)).toBeCloseTo(0.8413, 3);
  });

  it("throws on non-positive sigma", () => {
    expect(() => normalCdf(75, 75, 0)).toThrow("sigma must be positive");
    expect(() => normalCdf(75, 75, -1)).toThrow("sigma must be positive");
  });
});

describe("normalPdf", () => {
  it("peak at mean", () => {
    const atMean = normalPdf(75, 75, 2.5);
    const offMean = normalPdf(76, 75, 2.5);
    expect(atMean).toBeGreaterThan(offMean);
  });

  it("symmetric around mean", () => {
    expect(normalPdf(73, 75, 2.5)).toBeCloseTo(normalPdf(77, 75, 2.5), 7);
  });
});

describe("clamp", () => {
  it("clamps below min", () => {
    expect(clamp(-0.1, 0, 1)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(1.5, 0, 1)).toBe(1);
  });

  it("passes through within range", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
