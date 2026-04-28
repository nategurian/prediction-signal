import { describe, it, expect } from "vitest";
import {
  CITY_REGISTRY,
  cityKeyFromMarketTicker,
  cityKeyFromSeriesTicker,
  getAllCityKeys,
} from "@/lib/config";

describe("CITY_REGISTRY", () => {
  it("contains all six expected cities", () => {
    const keys = getAllCityKeys().sort();
    expect(keys).toEqual(["chi", "den", "la", "miami", "nyc", "phil"]);
  });

  it("each city has a unique seriesTicker", () => {
    const tickers = Object.values(CITY_REGISTRY).map((c) => c.seriesTicker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("each city has finite numeric sigma fields with floor <= sigma <= ceiling", () => {
    for (const [key, cfg] of Object.entries(CITY_REGISTRY)) {
      expect(Number.isFinite(cfg.sigma), `${key}.sigma`).toBe(true);
      expect(Number.isFinite(cfg.sigmaFloor), `${key}.sigmaFloor`).toBe(true);
      expect(Number.isFinite(cfg.sigmaCeiling), `${key}.sigmaCeiling`).toBe(true);
      expect(cfg.sigmaFloor).toBeLessThanOrEqual(cfg.sigma);
      expect(cfg.sigma).toBeLessThanOrEqual(cfg.sigmaCeiling);
    }
  });
});

describe("cityKeyFromSeriesTicker", () => {
  const cases: [string, string][] = [
    ["KXHIGHNY", "nyc"],
    ["KXHIGHMIA", "miami"],
    ["KXHIGHCHI", "chi"],
    ["KXHIGHLAX", "la"],
    ["KXHIGHDEN", "den"],
    ["KXHIGHPHIL", "phil"],
  ];
  it.each(cases)("maps %s -> %s", (series, city) => {
    expect(cityKeyFromSeriesTicker(series)).toBe(city);
  });

  it("returns null for unknown series", () => {
    expect(cityKeyFromSeriesTicker("KXFOO")).toBeNull();
  });
});

describe("cityKeyFromMarketTicker", () => {
  const cases: [string, string][] = [
    ["KXHIGHNY-26APR06-T67", "nyc"],
    ["KXHIGHMIA-26APR15-B88.5", "miami"],
    ["KXHIGHCHI-26APR29-T61", "chi"],
    ["KXHIGHLAX-26APR29-B72.5", "la"],
    ["KXHIGHDEN-26APR29-T63", "den"],
    ["KXHIGHPHIL-26APR29-T71", "phil"],
  ];
  it.each(cases)("maps %s -> %s", (ticker, city) => {
    expect(cityKeyFromMarketTicker(ticker)).toBe(city);
  });

  it("returns null for unknown market ticker prefixes", () => {
    expect(cityKeyFromMarketTicker("KXFOOBAR-26APR06-T67")).toBeNull();
  });
});
