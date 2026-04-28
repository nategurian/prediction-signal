export type MarketStructure = "binary_threshold" | "bucket_range";

export type CityKey = "nyc" | "miami" | "chi" | "la" | "den" | "phil";

export type WeatherVariable = "daily_high" | "daily_low";

export const WEATHER_VARIABLES: readonly WeatherVariable[] = [
  "daily_high",
  "daily_low",
] as const;

export interface CityConfig {
  cityCoords: { latitude: number; longitude: number };
  timezone: string;
  /**
   * Minimum number of settled postmortems with actual vs. forecasted value
   * required before we'll use the empirical calibration σ instead of the
   * ensemble or static fallback.
   */
  minCalibrationSamples: number;
  /**
   * Trailing window (in days) used by `recalibrate-sigma` to compute
   * forecast-error stats. Longer windows are more stable but slower to adapt.
   */
  calibrationWindowDays: number;

  // Trading gates — shared across variables for a given city. The engine's
  // edge / confidence / spread / settlement-time logic is not variable-specific.
  minTradeEdge: number;
  minConfidenceScore: number;
  maxSpread: number;
  slippagePenalty: number;
  uncertaintyBuffer: number;
  maxMinutesBeforeSettlementToEnter: number;
  fixedTradeQuantity: number;
  highEntryThreshold: number;
  highEntryMinEdge: number;
  /**
   * Hard cap on BUY_NO entry price. Trades with noAsk above this are forced
   * to NO_TRADE regardless of modeled edge.
   */
  maxNoEntryPrice: number;
  /**
   * Block YES signals when the modeled P(YES) is at or above this value.
   */
  maxYesModeledProbability: number;
  /**
   * When true, BUY_YES signals are blocked on bucket_range markets.
   */
  disableBucketRangeYes: boolean;
  /**
   * Minimum ratio of bucket_width / effective σ required to trade a bucket
   * market. See signal.ts for the full rationale.
   */
  minBucketWidthSigmaRatio: number;
}

export interface SeriesConfig {
  seriesTicker: string;
  cityKey: CityKey;
  variable: WeatherVariable;
  /** Static σ fallback when calibration and ensemble are unavailable. */
  sigma: number;
  /** Floor applied after sigma resolution to prevent pathological overconfidence. */
  sigmaFloor: number;
  /** Ceiling applied after sigma resolution; prevents single busts from inflating σ. */
  sigmaCeiling: number;
  modelVersion: string;
  /** Structures forced to NO_TRADE for this series (e.g. narrow bucket markets). */
  disabledMarketStructures: readonly MarketStructure[];
}

const SHARED_TRADING_DEFAULTS = {
  minTradeEdge: 0.08,
  minConfidenceScore: 0.8,
  maxSpread: 0.06,
  // Bumped from 1¢ to 2¢ (Apr 2026): the prior value under-modeled both
  // bid-ask crossing and adverse selection near settlement. Kalshi trading
  // fees are now modeled separately and dynamically in `fees.ts`.
  slippagePenalty: 0.02,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  // Held at 10 intentionally. The Apr-2026 audit introduced three new
  // filters (stricter thresholds, bucket/YES gate, width/σ gate) and
  // empirical σ calibration. Bump only after ≥20 settled trades under
  // the new regime show positive win rate and realized edge.
  fixedTradeQuantity: 10,
  highEntryThreshold: 0.75,
  highEntryMinEdge: 0.10,
  maxNoEntryPrice: 0.75,
  maxYesModeledProbability: 0.50,
  disableBucketRangeYes: true,
  minBucketWidthSigmaRatio: 1.5,
} as const;

const SHARED_CALIBRATION_DEFAULTS = {
  // v7: 10 → 5. With 2 cities and ~1 settled market/day each, a window of
  // 10 took up to 2 weeks to populate. 5 lets empirical σ kick in within ~1
  // week while still averaging enough samples to avoid single-day noise.
  minCalibrationSamples: 5,
  // v7: 30 → 14. A 30-day window anchored σ to weather that no longer
  // applies (e.g. the Apr 17–19 NYC cold-front bust) for an entire month.
  // 14 days adapts faster while still covering typical weather regimes.
  calibrationWindowDays: 14,
} as const;

export const CITY_REGISTRY: Record<CityKey, CityConfig> = {
  nyc: {
    cityCoords: { latitude: 40.7128, longitude: -74.006 },
    timezone: "America/New_York",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
  chi: {
    cityCoords: { latitude: 41.9803, longitude: -87.909 },
    timezone: "America/Chicago",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
  la: {
    cityCoords: { latitude: 33.9416, longitude: -118.4085 },
    timezone: "America/Los_Angeles",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
  den: {
    cityCoords: { latitude: 39.8617, longitude: -104.6731 },
    timezone: "America/Denver",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
  phil: {
    cityCoords: { latitude: 39.8729, longitude: -75.2437 },
    timezone: "America/New_York",
    ...SHARED_CALIBRATION_DEFAULTS,
    ...SHARED_TRADING_DEFAULTS,
  },
};

/**
 * Series registry — one entry per Kalshi series ticker. Phase 2a only
 * registers daily_high series; Phase 2b adds the matching KXLOWT* daily_low
 * series. Per-series sigma priors are climate-regime aware and replaced by
 * empirical RMSE after `minCalibrationSamples` settled trades.
 */
export const SERIES_REGISTRY: Record<string, SeriesConfig> = {
  KXHIGHNY: {
    seriesTicker: "KXHIGHNY",
    cityKey: "nyc",
    variable: "daily_high",
    sigma: 3.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 7.0,
    modelVersion: "weather_temp_v8",
    disabledMarketStructures: [],
  },
  KXHIGHMIA: {
    seriesTicker: "KXHIGHMIA",
    cityKey: "miami",
    variable: "daily_high",
    // v7: 2.5 → 1.5 floor. Miami's empirical RMSE runs ~1.3°F so a 2.5 floor
    // was forcing the model to be *under*confident — pushing it into
    // cheap-tail YES bets that have been consistently losing. Letting σ drop
    // to ≥1.5 (below typical ensemble spread but not unrealistically small)
    // restores a truthful probability distribution without risking
    // near-certainty collapse.
    sigma: 2.5,
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    modelVersion: "weather_temp_v8",
    disabledMarketStructures: ["bucket_range"],
  },
  KXHIGHCHI: {
    seriesTicker: "KXHIGHCHI",
    cityKey: "chi",
    variable: "daily_high",
    // Continental midwest with frequent frontal passages and lake-breeze
    // effects in spring/summer; empirically wider than NYC.
    sigma: 4.0,
    sigmaFloor: 2.5,
    sigmaCeiling: 8.0,
    modelVersion: "weather_temp_v8",
    disabledMarketStructures: [],
  },
  KXHIGHLAX: {
    seriesTicker: "KXHIGHLAX",
    cityKey: "la",
    variable: "daily_high",
    // Coastal Mediterranean climate; mirrors Miami's stability profile.
    sigma: 2.5,
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    modelVersion: "weather_temp_v8",
    // 1°F-wide bucket markets at σ=2.5 fall below minBucketWidthSigmaRatio=1.5
    // (1/2.5 = 0.4); the engine would NO_TRADE all bucket_range entries
    // anyway. Disabling mirrors Miami and clarifies intent.
    disabledMarketStructures: ["bucket_range"],
  },
  KXHIGHDEN: {
    seriesTicker: "KXHIGHDEN",
    cityKey: "den",
    variable: "daily_high",
    // High-altitude continental + downslope (chinook) winds → wider error
    // tails. Highest σ in the registry; calibration may relax this within
    // ~1 week.
    sigma: 4.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 9.0,
    modelVersion: "weather_temp_v8",
    disabledMarketStructures: [],
  },
  KXHIGHPHIL: {
    seriesTicker: "KXHIGHPHIL",
    cityKey: "phil",
    variable: "daily_high",
    // Mid-Atlantic seaboard; very similar regime to NYC.
    sigma: 3.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 7.0,
    modelVersion: "weather_temp_v8",
    disabledMarketStructures: [],
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

export function getAllSeriesConfigs(): SeriesConfig[] {
  return Object.values(SERIES_REGISTRY);
}

/** Resolve a series by (city, variable). Throws if unregistered. */
export function getSeriesConfig(
  cityKey: string,
  variable: WeatherVariable
): SeriesConfig {
  for (const s of Object.values(SERIES_REGISTRY)) {
    if (s.cityKey === cityKey && s.variable === variable) return s;
  }
  throw new Error(`No series registered for ${cityKey}/${variable}`);
}

export function getSeriesConfigByTicker(seriesTicker: string): SeriesConfig | null {
  return SERIES_REGISTRY[seriesTicker] ?? null;
}

/**
 * Derive {cityKey, variable, seriesTicker} from a market ticker like
 * "KXHIGHNY-26APR06-T67" by matching against every registered series prefix.
 */
export function seriesInfoFromMarketTicker(
  marketTicker: string
): { cityKey: CityKey; variable: WeatherVariable; seriesTicker: string } | null {
  for (const s of Object.values(SERIES_REGISTRY)) {
    if (marketTicker.startsWith(s.seriesTicker)) {
      return {
        cityKey: s.cityKey,
        variable: s.variable,
        seriesTicker: s.seriesTicker,
      };
    }
  }
  return null;
}

export function getSeriesTickersForCity(cityKey: CityKey): string[] {
  return Object.values(SERIES_REGISTRY)
    .filter((s) => s.cityKey === cityKey)
    .map((s) => s.seriesTicker);
}

/** Reverse lookup: series ticker → city key. */
export function cityKeyFromSeriesTicker(seriesTicker: string): CityKey | null {
  return getSeriesConfigByTicker(seriesTicker)?.cityKey ?? null;
}

/**
 * Derive city key from a market ticker like "KXHIGHNY-26APR06-T67".
 * Tries each registered series ticker as a prefix.
 */
export function cityKeyFromMarketTicker(ticker: string): CityKey | null {
  return seriesInfoFromMarketTicker(ticker)?.cityKey ?? null;
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
