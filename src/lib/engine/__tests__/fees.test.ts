import { describe, it, expect } from "vitest";
import {
  kalshiTradingFee,
  expectedFeePerContract,
  KALSHI_FEE_RATE,
} from "../fees";

describe("kalshiTradingFee", () => {
  it("returns 0 for degenerate prices", () => {
    expect(kalshiTradingFee(0, 10)).toBe(0);
    expect(kalshiTradingFee(1, 10)).toBe(0);
    expect(kalshiTradingFee(-0.1, 10)).toBe(0);
    expect(kalshiTradingFee(1.5, 10)).toBe(0);
  });

  it("returns 0 for non-positive contracts", () => {
    expect(kalshiTradingFee(0.5, 0)).toBe(0);
    expect(kalshiTradingFee(0.5, -5)).toBe(0);
  });

  it("computes ceil(0.07 × C × P × (1-P) × 100) / 100 at the symmetric peak", () => {
    // At P=0.50 the per-contract fee is 0.07 × 0.25 = 0.0175, so 10 contracts
    // raw = 0.175 → ceil to $0.18.
    expect(kalshiTradingFee(0.5, 10)).toBeCloseTo(0.18, 2);
  });

  it("scales with contracts (batched)", () => {
    // 1 contract at P=0.50: raw = 0.0175 → ceil to $0.02.
    expect(kalshiTradingFee(0.5, 1)).toBeCloseTo(0.02, 2);
    // 100 contracts at P=0.50: raw = 1.75 → ceil to $1.75.
    expect(kalshiTradingFee(0.5, 100)).toBeCloseTo(1.75, 2);
  });

  it("is symmetric around P=0.5", () => {
    expect(kalshiTradingFee(0.3, 10)).toBeCloseTo(kalshiTradingFee(0.7, 10), 2);
    expect(kalshiTradingFee(0.1, 10)).toBeCloseTo(kalshiTradingFee(0.9, 10), 2);
  });

  it("is smaller at the tails than at the middle", () => {
    // Fees are 0 at P=0 or P=1, peak at 0.5.
    const mid = kalshiTradingFee(0.5, 10);
    const tail = kalshiTradingFee(0.1, 10);
    expect(tail).toBeLessThan(mid);
    expect(tail).toBeGreaterThan(0);
  });

  it("always rounds up to the nearest cent", () => {
    // 1 contract at P=0.4: raw = 0.0168 → ceil to $0.02.
    expect(kalshiTradingFee(0.4, 1)).toBeCloseTo(0.02, 2);
    // 1 contract at P=0.1: raw = 0.0063 → ceil to $0.01.
    expect(kalshiTradingFee(0.1, 1)).toBeCloseTo(0.01, 2);
  });
});

describe("expectedFeePerContract", () => {
  it("returns 0 at degenerate prices", () => {
    expect(expectedFeePerContract(0)).toBe(0);
    expect(expectedFeePerContract(1)).toBe(0);
  });

  it("peaks at P=0.5", () => {
    expect(expectedFeePerContract(0.5)).toBeCloseTo(
      KALSHI_FEE_RATE * 0.25,
      4
    );
  });

  it("approximately matches the per-contract batched fee for modest quantities", () => {
    // For 10 contracts the per-contract batched cost is within ~0.1¢ of
    // the unrounded estimate.
    const p = 0.5;
    const perContractBatched = kalshiTradingFee(p, 10) / 10;
    expect(expectedFeePerContract(p)).toBeCloseTo(perContractBatched, 2);
  });
});
