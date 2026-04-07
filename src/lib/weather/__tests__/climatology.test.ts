import { describe, it, expect } from "vitest";
import { climatologyNormalHighFahrenheit } from "../climatology";

describe("climatologyNormalHighFahrenheit", () => {
  it("returns higher midsummer normals than midwinter for NYC", () => {
    const july = climatologyNormalHighFahrenheit("nyc", "2026-07-15");
    const jan = climatologyNormalHighFahrenheit("nyc", "2026-01-15");
    expect(july).toBeGreaterThan(jan);
    expect(july).toBeGreaterThan(75);
    expect(jan).toBeLessThan(45);
  });

  it("uses generic fallback for unknown city keys", () => {
    expect(climatologyNormalHighFahrenheit("other", "2026-06-01")).toBe(65);
  });
});
