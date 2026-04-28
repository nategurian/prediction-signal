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

  it("returns sensible warm-season normals for each new city", () => {
    const cases: { city: string; min: number; max: number }[] = [
      { city: "chi", min: 78, max: 92 },
      { city: "la", min: 78, max: 88 },
      { city: "den", min: 82, max: 95 },
      { city: "phil", min: 80, max: 92 },
    ];
    for (const { city, min, max } of cases) {
      const v = climatologyNormalHighFahrenheit(city, "2026-07-15");
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it("returns midwinter normals lower than midsummer for each new city", () => {
    for (const city of ["chi", "la", "den", "phil"]) {
      const summer = climatologyNormalHighFahrenheit(city, "2026-07-15");
      const winter = climatologyNormalHighFahrenheit(city, "2026-01-15");
      expect(summer).toBeGreaterThan(winter);
    }
  });

  it("LA has the smallest annual swing among the new cities", () => {
    const cities = ["chi", "la", "den", "phil"];
    const swings = cities.map((c) => {
      const summer = climatologyNormalHighFahrenheit(c, "2026-07-15");
      const winter = climatologyNormalHighFahrenheit(c, "2026-01-15");
      return { c, swing: summer - winter };
    });
    const la = swings.find((s) => s.c === "la")!;
    for (const other of swings) {
      if (other.c === "la") continue;
      expect(la.swing).toBeLessThan(other.swing);
    }
  });

  it("does not return the generic fallback for known new cities", () => {
    for (const city of ["chi", "la", "den", "phil"]) {
      const v = climatologyNormalHighFahrenheit(city, "2026-06-15");
      expect(v).not.toBe(65);
    }
  });
});
