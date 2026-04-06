export const appConfig = {
  nicheKey: "weather_daily_temp" as const,
  cityKey: "nyc" as const,
  cityCoords: { latitude: 40.7128, longitude: -74.006 },
  timezone: "America/New_York",

  sigma: 2.5,
  minTradeEdge: 0.05,
  minConfidenceScore: 0.6,
  maxSpread: 0.06,
  slippagePenalty: 0.01,
  feePenalty: 0.0,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  fixedTradeQuantity: 10,

  modelVersion: "weather_temp_v1",

  confidenceWeights: {
    forecastFreshness: 0.35,
    thresholdDistance: 0.35,
    revisionStability: 0.2,
    spreadQuality: 0.1,
  },
} as const;

export type AppConfig = typeof appConfig;
