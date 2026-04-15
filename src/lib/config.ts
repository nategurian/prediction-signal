export interface CityConfig {
  cityCoords: { latitude: number; longitude: number };
  timezone: string;
  seriesTicker: string;
  sigma: number;
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
}

export type CityKey = "nyc" | "miami";

const SHARED_TRADING_DEFAULTS = {
  minTradeEdge: 0.05,
  minConfidenceScore: 0.6,
  maxSpread: 0.06,
  slippagePenalty: 0.01,
  feePenalty: 0.0,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  fixedTradeQuantity: 10,
  highEntryThreshold: 0.80,
  highEntryMinEdge: 0.10,
} as const;

export const CITY_REGISTRY: Record<CityKey, CityConfig> = {
  nyc: {
    cityCoords: { latitude: 40.7128, longitude: -74.006 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHNY",
    sigma: 3.5,
    modelVersion: "weather_temp_v2",
    ...SHARED_TRADING_DEFAULTS,
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHMIA",
    sigma: 2.5,
    modelVersion: "weather_temp_v2",
    ...SHARED_TRADING_DEFAULTS,
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
