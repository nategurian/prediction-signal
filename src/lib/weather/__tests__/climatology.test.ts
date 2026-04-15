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

  it("returns higher midsummer normals than midwinter for Miami", () => {
    const july = climatologyNormalHighFahrenheit("miami", "2026-07-15");
    const jan = climatologyNormalHighFahrenheit("miami", "2026-01-15");
    expect(july).toBeGreaterThan(jan);
    expect(july).toBeGreaterThan(88);
    expect(jan).toBeLessThan(80);
  });

  it("Miami normals are warmer than NYC year-round", () => {
    for (const month of ["01", "04", "07", "10"]) {
      const miami = climatologyNormalHighFahrenheit("miami", `2026-${month}-15`);
      const nyc = climatologyNormalHighFahrenheit("nyc", `2026-${month}-15`);
      expect(miami).toBeGreaterThan(nyc);
    }
  });

  it("uses generic fallback for unknown city keys", () => {
    expect(climatologyNormalHighFahrenheit("other", "2026-06-01")).toBe(65);
  });
});
