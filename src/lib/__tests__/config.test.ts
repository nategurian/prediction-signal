import { describe, it, expect } from "vitest";
import {
  CITY_REGISTRY,
  SERIES_REGISTRY,
  cityKeyFromMarketTicker,
  cityKeyFromSeriesTicker,
  getAllCityKeys,
  getAllSeriesConfigs,
  getSeriesConfig,
  getSeriesConfigByTicker,
  seriesInfoFromMarketTicker,
  WEATHER_VARIABLES,
} from "@/lib/config";

describe("CITY_REGISTRY", () => {
  it("contains all six expected cities", () => {
    expect(getAllCityKeys().sort()).toEqual([
      "chi",
      "den",
      "la",
      "miami",
      "nyc",
      "phil",
    ]);
  });

  it("each city has coords + timezone + shared trading defaults", () => {
    for (const [key, cfg] of Object.entries(CITY_REGISTRY)) {
      expect(typeof cfg.cityCoords.latitude, `${key}.lat`).toBe("number");
      expect(typeof cfg.cityCoords.longitude, `${key}.lng`).toBe("number");
      expect(typeof cfg.timezone, `${key}.timezone`).toBe("string");
      expect(typeof cfg.minCalibrationSamples).toBe("number");
      expect(typeof cfg.calibrationWindowDays).toBe("number");
      expect(typeof cfg.minTradeEdge).toBe("number");
    }
  });
});

describe("SERIES_REGISTRY (Phase 2a)", () => {
  it("contains exactly 6 daily_high entries and zero daily_low entries", () => {
    const all = getAllSeriesConfigs();
    expect(all).toHaveLength(6);
    const variables = all.map((s) => s.variable);
    expect(new Set(variables).size).toBe(1);
    expect(variables.every((v) => v === "daily_high")).toBe(true);
  });

  it("each series has a unique seriesTicker", () => {
    const tickers = Object.values(SERIES_REGISTRY).map((s) => s.seriesTicker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("each series has finite sigma fields with floor <= sigma <= ceiling", () => {
    for (const s of Object.values(SERIES_REGISTRY)) {
      expect(Number.isFinite(s.sigma), `${s.seriesTicker}.sigma`).toBe(true);
      expect(Number.isFinite(s.sigmaFloor), `${s.seriesTicker}.sigmaFloor`).toBe(
        true
      );
      expect(
        Number.isFinite(s.sigmaCeiling),
        `${s.seriesTicker}.sigmaCeiling`
      ).toBe(true);
      expect(s.sigmaFloor).toBeLessThanOrEqual(s.sigma);
      expect(s.sigma).toBeLessThanOrEqual(s.sigmaCeiling);
    }
  });

  it("WEATHER_VARIABLES enumerates 'daily_high' and 'daily_low'", () => {
    expect([...WEATHER_VARIABLES].sort()).toEqual(["daily_high", "daily_low"]);
  });
});

describe("getSeriesConfig", () => {
  it.each([
    ["nyc", "KXHIGHNY"],
    ["miami", "KXHIGHMIA"],
    ["chi", "KXHIGHCHI"],
    ["la", "KXHIGHLAX"],
    ["den", "KXHIGHDEN"],
    ["phil", "KXHIGHPHIL"],
  ] as const)("returns the daily_high series for %s", (city, ticker) => {
    const s = getSeriesConfig(city, "daily_high");
    expect(s.seriesTicker).toBe(ticker);
    expect(s.cityKey).toBe(city);
    expect(s.variable).toBe("daily_high");
  });

  it("throws for daily_low in Phase 2a (no series registered yet)", () => {
    expect(() => getSeriesConfig("nyc", "daily_low")).toThrow();
  });
});

describe("getSeriesConfigByTicker", () => {
  it("resolves KXHIGHNY → nyc/daily_high", () => {
    const s = getSeriesConfigByTicker("KXHIGHNY");
    expect(s?.cityKey).toBe("nyc");
    expect(s?.variable).toBe("daily_high");
  });

  it("returns null for unknown tickers", () => {
    expect(getSeriesConfigByTicker("KXFOO")).toBeNull();
  });
});

describe("seriesInfoFromMarketTicker", () => {
  it.each([
    ["KXHIGHNY-26APR06-T67", "nyc", "daily_high", "KXHIGHNY"],
    ["KXHIGHCHI-26APR29-B58.5", "chi", "daily_high", "KXHIGHCHI"],
    ["KXHIGHLAX-26APR29-T73", "la", "daily_high", "KXHIGHLAX"],
  ])("maps %s -> %s/%s/%s", (ticker, city, variable, series) => {
    const info = seriesInfoFromMarketTicker(ticker);
    expect(info?.cityKey).toBe(city);
    expect(info?.variable).toBe(variable);
    expect(info?.seriesTicker).toBe(series);
  });

  it("returns null for unknown prefixes", () => {
    expect(seriesInfoFromMarketTicker("KXFOOBAR-26APR06-T67")).toBeNull();
  });
});

describe("legacy ticker helpers preserve behavior", () => {
  it("cityKeyFromMarketTicker still resolves all six cities", () => {
    expect(cityKeyFromMarketTicker("KXHIGHNY-26APR06-T67")).toBe("nyc");
    expect(cityKeyFromMarketTicker("KXHIGHMIA-26APR15-B88.5")).toBe("miami");
    expect(cityKeyFromMarketTicker("KXHIGHCHI-26APR29-T61")).toBe("chi");
    expect(cityKeyFromMarketTicker("KXHIGHLAX-26APR29-B72.5")).toBe("la");
    expect(cityKeyFromMarketTicker("KXHIGHDEN-26APR29-T63")).toBe("den");
    expect(cityKeyFromMarketTicker("KXHIGHPHIL-26APR29-T71")).toBe("phil");
  });

  it("cityKeyFromSeriesTicker still works for all six cities", () => {
    expect(cityKeyFromSeriesTicker("KXHIGHNY")).toBe("nyc");
    expect(cityKeyFromSeriesTicker("KXHIGHCHI")).toBe("chi");
    expect(cityKeyFromSeriesTicker("KXFOO")).toBeNull();
  });
});
