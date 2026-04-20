export type MarketStructure = "binary_threshold" | "bucket_range";

export interface CityConfig {
  cityCoords: { latitude: number; longitude: number };
  timezone: string;
  seriesTicker: string;
  sigma: number;
  sigmaFloor: number;
  modelVersion: string;

  minTradeEdge: number;
  minConfidenceScore: number;
  maxSpread: number;
  slippagePenalty: number;
  feePenalty: number;
  uncertaintyBuffer: number;
  maxMinutesBeforeSettlementToEnter: number;
  fixedTradeQuantity: number;
  highEntryThreshold: number;
  highEntryMinEdge: number;
  /**
   * Hard cap on BUY_NO entry price. Trades with noAsk above this are forced
   * to NO_TRADE regardless of modeled edge — guards against catastrophic
   * losses on expensive NO legs when modeled P(YES) is miscalibrated low.
   */
  maxNoEntryPrice: number;
  /**
   * Block YES signals when the modeled P(YES) is at or above this value.
   * Empirically, when the model says YES is >=50% likely, YES wins only
   * ~6% of the time (1/16 settled trades) — strong evidence of upside
   * miscalibration on markets priced near the forecast threshold.
   */
  maxYesModeledProbability: number;
  /**
   * When true, BUY_YES signals are blocked on bucket_range markets.
   * 1°F-wide bucket markets have observed 0/18 YES win rate — the Gaussian
   * probability model cannot distinguish adjacent narrow buckets given
   * realistic forecast-error sigma.
   */
  disableBucketRangeYes: boolean;
  /**
   * Market structures to disable entirely for this city. Use to turn off
   * a structure whose empirical calibration is broken (e.g. Miami 1°F
   * bucket markets at 1.7°F forecast-error SD).
   */
  disabledMarketStructures: readonly MarketStructure[];
}

export type CityKey = "nyc" | "miami";

const SHARED_TRADING_DEFAULTS = {
  minTradeEdge: 0.08,
  minConfidenceScore: 0.8,
  maxSpread: 0.06,
  slippagePenalty: 0.01,
  feePenalty: 0.0,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  fixedTradeQuantity: 10,
  highEntryThreshold: 0.75,
  highEntryMinEdge: 0.10,
  maxNoEntryPrice: 0.75,
  maxYesModeledProbability: 0.50,
  disableBucketRangeYes: true,
} as const;

export const CITY_REGISTRY: Record<CityKey, CityConfig> = {
  nyc: {
    cityCoords: { latitude: 40.7128, longitude: -74.006 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHNY",
    sigma: 3.5,
    sigmaFloor: 3.0,
    modelVersion: "weather_temp_v5",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: [],
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHMIA",
    sigma: 2.5,
    sigmaFloor: 2.5,
    modelVersion: "weather_temp_v5",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: ["bucket_range"],
  },
};

export function getCityConfig(cityKey: string): CityConfig {
  const config = CITY_REGISTRY[cityKey as CityKey];
  if (!config) throw new Error(`Unknown city key: ${cityKey}`);
  return config;
}

export function getAllCityKeys(): CityKey[] {
  return Object.keys(CITY_REGISTRY) as CityKey[];
}

/** Reverse lookup: series ticker → city key */
export function cityKeyFromSeriesTicker(seriesTicker: string): CityKey | null {
  for (const [key, cfg] of Object.entries(CITY_REGISTRY)) {
    if (cfg.seriesTicker === seriesTicker) return key as CityKey;
  }
  return null;
}

/**
 * Derive city key from a market ticker like "KXHIGHNY-26APR06-T67".
 * Tries each registered series ticker as a prefix.
 */
export function cityKeyFromMarketTicker(ticker: string): CityKey | null {
  for (const [key, cfg] of Object.entries(CITY_REGISTRY)) {
    if (ticker.startsWith(cfg.seriesTicker)) return key as CityKey;
  }
  return null;
}

export const sharedConfig = {
  nicheKey: "weather_daily_temp" as const,
  confidenceWeights: {
    forecastFreshness: 0.35,
    thresholdDistance: 0.35,
    revisionStability: 0.2,
    spreadQuality: 0.1,
  },
} as const;

export type ConfidenceWeights = typeof sharedConfig.confidenceWeights;
