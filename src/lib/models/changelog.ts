/**
 * Model changelog — the single source of truth for what changed in each
 * model version. Rendered on /models and annotated on the /performance
 * equity curve so we can correlate strategy changes to P&L inflections.
 *
 * When bumping modelVersion in src/lib/config.ts, add a new entry here with
 * a brief deployedAt timestamp (UTC) and the list of notable changes.
 */

export type ModelCategory =
  | "initial"
  | "signal-logic"
  | "calibration"
  | "polarity"
  | "config"
  | "infra";

export interface ModelChange {
  /** Fully-qualified modelVersion string stored on signals rows. */
  version: string;
  /** Short label used in URL anchors (e.g. "v6" → /models#v6). */
  slug: string;
  /** UTC ISO timestamp the version was first deployed to production. */
  deployedAt: string;
  /** Human-readable one-line title for the release. */
  title: string;
  /** Short summary (1–2 sentences) describing intent. */
  summary: string;
  /** Itemized list of notable changes. */
  changes: string[];
  /** Primary theme — drives the category badge on /models. */
  category: ModelCategory;
}

/**
 * Ordered newest → oldest. Keep this array sorted with the most recent
 * version at index 0 so the changelog reads top-down like a release-notes
 * page.
 */
export const MODEL_CHANGELOG: ModelChange[] = [
  {
    version: "weather_temp_v7",
    slug: "v7",
    deployedAt: "2026-04-22T00:00:00Z",
    title: "Faster calibration + forecast bias correction + Miami σ floor relief",
    summary:
      "Shortens the calibration window, lowers the sample threshold, applies the previously-unused forecast_error_mean as a bias correction, and drops Miami's overly conservative sigmaFloor that was forcing the model into cheap-tail YES bets.",
    category: "calibration",
    changes: [
      "Miami sigmaFloor 2.5 → 1.5: the v4 floor was calibrated before empirical σ existed and was forcing Miami (observed σ ~1.3°F) to be under-confident, pushing the model into cheap-tail YES bets that consistently lost.",
      "minCalibrationSamples 10 → 5 (both cities): empirical σ now kicks in after ~1 week instead of ~2, adapting faster to regime shifts.",
      "calibrationWindowDays 30 → 14: stale samples from past regimes (e.g. Apr 17–19 NYC cold front) roll off in two weeks instead of a month.",
      "New resolveForecastBiasCorrection applies forecast_error_mean (previously computed but unused) as a signed °F offset to forecastedHigh before probability calculation, clamped to ±2°F as defense against bust-induced false bias.",
      "run-model and opportunities routes now compute probabilities against the bias-corrected forecast; confidence scoring intentionally stays on the raw forecast (it measures information quality, not bias).",
      "feature_json now audits bias_correction, bias_source, bias_raw_mean, bias_clamped, and forecasted_high_bias_corrected for post-hoc review.",
    ],
  },
  {
    version: "weather_temp_v6",
    slug: "v6",
    deployedAt: "2026-04-20T14:04:37Z",
    title: "Empirical sigma calibration + bucket-width gating",
    summary:
      "Replaces the static / ensemble-derived sigma with a trailing empirical forecast-error sigma per city, and blocks bucket markets that are too narrow relative to that sigma.",
    category: "calibration",
    changes: [
      "New city_calibrations table storing trailing forecast-error STDEV, RMSE, MAE, mean per city (migration 006).",
      "New nightly recalibrate-sigma cron (03:15 UTC) that recomputes calibration stats from postmortem actual-vs-forecast errors (migration 007).",
      "Sigma priority chain: empirical calibration → ensemble stdev → static config, each clamped to sigmaFloor/sigmaCeiling.",
      "minBucketWidthSigmaRatio (1.5) force-blocks both sides of bucket markets when bucket_width / effectiveSigma falls below the ratio — cures the 0/18 YES win rate on 1°F bucket markets.",
      "Polarity hardening: computeModeledProbability now throws if a binary_threshold market is missing threshold_direction, preventing silent direction flips.",
      "Opportunities route fixed to always pass threshold_direction to the probability model.",
      "Added sigmaCeiling, minCalibrationSamples, calibrationWindowDays, minBucketWidthSigmaRatio to per-city config.",
    ],
  },
  {
    version: "weather_temp_v5",
    slug: "v5",
    deployedAt: "2026-04-20T13:48:50Z",
    title: "Stricter thresholds + structural gates",
    summary:
      "First response to the paper-account drawdown audit: tightens every entry gate and blocks the trade shapes that were empirically losing money.",
    category: "signal-logic",
    changes: [
      "minTradeEdge 0.05 → 0.08 (wider modeled edge required).",
      "minConfidenceScore 0.6 → 0.8 (only higher-conviction signals fire).",
      "highEntryThreshold 0.80 → 0.75 and maxNoEntryPrice 0.85 → 0.75 (avoid paying up on expensive legs).",
      "New maxYesModeledProbability (0.50): blocks YES signals whose modeled P(YES) ≥ 0.5 — empirically won 1/16 settled trades.",
      "New disableBucketRangeYes (true globally): blocks YES on bucket_range markets — empirically 0/18 YES win rate on 1°F buckets.",
      "New disabledMarketStructures (per city): Miami disables bucket_range entirely given its 1.7°F forecast-error SD vs. 1°F bucket width.",
      "Added MarketStructure type shared between config and engine.",
    ],
  },
  {
    version: "weather_temp_v4",
    slug: "v4",
    deployedAt: "2026-04-17T13:19:55Z",
    title: "Sigma floor raised, NO-leg price cap",
    summary:
      "Tightens sigma clamping and guards against catastrophic losses on expensive NO legs when modeled P(YES) is under-calibrated.",
    category: "config",
    changes: [
      "sigmaFloor raised from 1.5 → 3.0 (NYC) and 1.5 → 2.5 (Miami) so modeled probability stops collapsing to near-certainty.",
      "New maxNoEntryPrice (0.85): hard cap on BUY_NO entry price regardless of modeled edge.",
      "Signal tests expanded for the new NO-leg cap.",
    ],
  },
  {
    version: "weather_temp_v3",
    slug: "v3",
    deployedAt: "2026-04-15T17:50:27Z",
    title: "Ensemble-derived dynamic sigma + sigmaFloor",
    summary:
      "Makes sigma adaptive by deriving it from the ECMWF ensemble spread, with a floor to prevent pathological over-confidence on very tight forecasts.",
    category: "calibration",
    changes: [
      "Dynamic sigma: runtime uses max(sigmaFloor, ensemble stdev) instead of a single static sigma.",
      "Added per-city sigmaFloor (1.5°F) to CityConfig.",
      "Ensemble stdev persisted in model_outputs.feature_json for downstream reuse.",
    ],
  },
  {
    version: "weather_temp_v2",
    slug: "v2",
    deployedAt: "2026-04-15T14:02:17Z",
    title: "Signal engine improvements + Miami onboarding",
    summary:
      "First substantive iteration on the signal engine and the point at which Miami (KXHIGHMIA) joined the universe alongside NYC.",
    category: "signal-logic",
    changes: [
      "Added Miami city configuration (KXHIGHMIA) with its own sigma/threshold tuning.",
      "Reworked selectAction gating logic and confidence scoring.",
      "Introduced per-city overrides on top of shared trading defaults.",
    ],
  },
  {
    version: "weather_temp_v1",
    slug: "v1",
    deployedAt: "2026-04-06T13:09:07Z",
    title: "Initial platform",
    summary:
      "Launch version of the prediction-signals platform: NYC weather markets, ECMWF/NWS feature fetch, Gaussian probability model, simulated paper trading.",
    category: "initial",
    changes: [
      "Initial schema: markets, signals, simulated_trades, model_outputs, postmortems.",
      "Open-Meteo ECMWF + NWS ensemble fetchers.",
      "Gaussian probability model for binary_threshold and bucket_range markets.",
      "Baseline selectAction with minTradeEdge / minConfidenceScore gates.",
      "Kalshi market ingestion and nightly cron for model + signals + postmortems.",
    ],
  },
];

/**
 * Transitions are the *boundaries* between models — i.e. the moment a new
 * version replaced the previous one. The initial launch (v1) is not a
 * transition. This is what the performance equity curve annotates.
 */
export function getModelTransitions(): ModelChange[] {
  return MODEL_CHANGELOG.filter((m) => m.category !== "initial").sort(
    (a, b) => new Date(a.deployedAt).getTime() - new Date(b.deployedAt).getTime()
  );
}

export function findModelByVersion(version: string | null | undefined): ModelChange | null {
  if (!version) return null;
  return MODEL_CHANGELOG.find((m) => m.version === version) ?? null;
}

/** Returns the model that was active at the given timestamp. */
export function findActiveModelAt(timestamp: string | number | Date): ModelChange | null {
  const ts =
    typeof timestamp === "number"
      ? timestamp
      : new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return null;
  let active: ModelChange | null = null;
  for (const m of MODEL_CHANGELOG) {
    const mTs = new Date(m.deployedAt).getTime();
    if (mTs <= ts) {
      if (!active || new Date(active.deployedAt).getTime() < mTs) {
        active = m;
      }
    }
  }
  return active;
}
