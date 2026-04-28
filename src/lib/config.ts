export type MarketStructure = "binary_threshold" | "bucket_range";

export interface CityConfig {
  cityCoords: { latitude: number; longitude: number };
  timezone: string;
  seriesTicker: string;
  sigma: number;
  sigmaFloor: number;
  /**
   * Upper bound applied after sigma resolution. Prevents a single catastrophic
   * forecast bust from inflating empirical σ to a level where nothing passes
   * minTradeEdge. Tuned to ~2x static sigma.
   */
  sigmaCeiling: number;
  /**
   * Minimum number of settled postmortems with actual vs. forecasted high
   * required before we'll use the empirical calibration σ instead of the
   * ensemble or static fallback.
   */
  minCalibrationSamples: number;
  /**
   * Trailing window (in days) used by `recalibrate-sigma` to compute
   * forecast-error stats. Longer windows are more stable but slower to adapt.
   */
  calibrationWindowDays: number;
  modelVersion: string;

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
  /**
   * Minimum ratio of bucket_width / effective σ required to trade a bucket
   * market. See signal.ts for the full rationale. 1.5 means a 1°F bucket
   * needs σ ≤ 0.67°F — essentially impossible for daily-high forecasts, so
   * all 1°F bucket markets are gated out.
   */
  minBucketWidthSigmaRatio: number;
}

export type CityKey = "nyc" | "miami" | "chi" | "la" | "den" | "phil";

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

export const CITY_REGISTRY: Record<CityKey, CityConfig> = {
  nyc: {
    cityCoords: { latitude: 40.7128, longitude: -74.006 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHNY",
    sigma: 3.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 7.0,
    // v7: 10 → 5. With 2 cities and ~1 settled market/day each, a window of
    // 10 took up to 2 weeks to populate. 5 lets empirical σ kick in within ~1
    // week while still averaging enough samples to avoid single-day noise.
    minCalibrationSamples: 5,
    // v7: 30 → 14. A 30-day window anchored σ to weather that no longer
    // applies (e.g. the Apr 17–19 NYC cold-front bust) for an entire month.
    // 14 days adapts faster while still covering typical weather regimes.
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: [],
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHMIA",
    sigma: 2.5,
    // v7: 2.5 → 1.5. The v4 floor was set before empirical calibration
    // existed, as a conservative guard against 1.5°F baseline. Miami's
    // observed ensemble_stdev runs 1.2–1.4°F and empirical RMSE ~1.3°F, so
    // a 2.5 floor was forcing the model to be *under*confident — pushing it
    // into cheap-tail YES bets that have been consistently losing. Letting
    // σ drop to ≥1.5 (below typical ensemble spread but not unrealistically
    // small) restores a truthful probability distribution without risking
    // near-certainty collapse.
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: ["bucket_range"],
  },
  // ────────────────────────────────────────────────────────────────────────
  // Phase-1 expansion (Apr 2026). Coordinates use each city's primary NWS
  // reporting airport (ORD, LAX, DEN, PHL) to align the forecast frame with
  // the settlement frame. σ priors are conservative climate-regime guesses
  // and will be replaced by empirical RMSE after ≥5 settled trades per city
  // (typically ~1 week).
  // ────────────────────────────────────────────────────────────────────────
  chi: {
    cityCoords: { latitude: 41.9803, longitude: -87.909 },
    timezone: "America/Chicago",
    seriesTicker: "KXHIGHCHI",
    // Continental midwest with frequent frontal passages and lake-breeze
    // effects in spring/summer; empirically wider than NYC.
    sigma: 4.0,
    sigmaFloor: 2.5,
    sigmaCeiling: 8.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: [],
  },
  la: {
    cityCoords: { latitude: 33.9416, longitude: -118.4085 },
    timezone: "America/Los_Angeles",
    seriesTicker: "KXHIGHLAX",
    // Coastal Mediterranean climate; mirrors Miami's stability profile.
    sigma: 2.5,
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    // 1°F-wide bucket markets at σ=2.5 fall below minBucketWidthSigmaRatio=1.5
    // (1/2.5 = 0.4); the engine would NO_TRADE all bucket_range entries
    // anyway. Disabling mirrors Miami and clarifies intent.
    disabledMarketStructures: ["bucket_range"],
  },
  den: {
    cityCoords: { latitude: 39.8617, longitude: -104.6731 },
    timezone: "America/Denver",
    seriesTicker: "KXHIGHDEN",
    // High-altitude continental + downslope (chinook) winds → wider error
    // tails. Highest σ in the registry; calibration may relax this within
    // ~1 week.
    sigma: 4.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 9.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: [],
  },
  phil: {
    cityCoords: { latitude: 39.8729, longitude: -75.2437 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHPHIL",
    // Mid-Atlantic seaboard; very similar regime to NYC.
    sigma: 3.5,
    sigmaFloor: 3.0,
    sigmaCeiling: 7.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
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
