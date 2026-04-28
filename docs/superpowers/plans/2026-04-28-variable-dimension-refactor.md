# Variable-Dimension Refactor (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `variable` dimension throughout the schema, config, normalization, modeling, calibration, postmortem, prompt, and replay paths so Phase 2b can plug `daily_low` series in without further refactoring. **No behavior change in production.**

**Architecture:** Add a `variable` column to `markets` and `city_calibrations`, defaulting to `'daily_high'`. Split `CITY_REGISTRY` (geography + shared trading gates) from a new `SERIES_REGISTRY` (per-series σ, modelVersion, structure disables). Extend `external_data_snapshots.normalized_json` with a `by_variable` block while preserving legacy root fields. All read sites prefer new fields, fall back to legacy. All write sites emit both.

**Tech Stack:** TypeScript, Next.js 14, Vitest, Postgres / Supabase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-28-variable-dimension-refactor-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/008_markets_and_calibrations_variable.sql` | Create | Add `variable` column + CHECK + index/unique-key changes |
| `src/lib/config.ts` | Modify | New `WeatherVariable` type, `SeriesConfig`, `SERIES_REGISTRY`, helpers; slim `CityConfig` |
| `src/lib/__tests__/config.test.ts` | Modify | Migrate sigma/series asserts; add `getSeriesConfig`/`seriesInfoFromMarketTicker` tests |
| `src/lib/supabase/db.ts` | Modify | Add `variable` to `Market` and `CityCalibration`; update `upsertCityCalibration` |
| `src/lib/weather/normalizeExternal.ts` | Modify | Emit `by_variable.daily_high` slice + new helper for variable-aware lookup |
| `src/lib/weather/__tests__/normalizeExternal.test.ts` | Modify | Assert new `by_variable` block + helper |
| `src/app/api/jobs/run-model/route.ts` | Modify | Use `getSeriesConfig` + variable-aware forecast lookup; emit `variable` in `feature_json` |
| `src/app/api/jobs/refresh-markets/route.ts` | Modify | Set `markets.variable` from series config on insert |
| `src/app/api/jobs/recalibrate-sigma/route.ts` | Modify | Iterate `(city, variable)` pairs; prefer new postmortem fields, fall back to legacy |
| `src/lib/ai/postmortemTradePayload.ts` | Modify | Write `variable`, `actual_value`, `forecasted_value` alongside legacy mirrors |
| `src/lib/ai/prompts.ts` | Modify | Variable-aware templating (`high`/`low` label) |
| `scripts/v1-replay.mjs` | Modify | Read variable-aware forecast values; default legacy snapshots to `daily_high` |
| `src/lib/__tests__/postmortemPayload.test.ts` | Create | Assert dual-write of variable + legacy fields |

No other files change. Engine math, market metadata parsing, settlement, climatology, and UI are untouched.

---

### Task 1: DB migration

**Files:**
- Create: `supabase/migrations/008_markets_and_calibrations_variable.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Phase 2a: introduce `variable` dimension on markets and city_calibrations.
-- Backwards-compatible: new column defaults to 'daily_high', existing rows
-- backfill cleanly. Phase 2b adds 'daily_low' series and starts producing
-- daily_low markets.

ALTER TABLE markets
  ADD COLUMN variable TEXT NOT NULL DEFAULT 'daily_high';

ALTER TABLE markets
  ADD CONSTRAINT markets_variable_check
    CHECK (variable IN ('daily_high', 'daily_low'));

CREATE INDEX idx_markets_city_variable ON markets(city_key, variable);

ALTER TABLE city_calibrations
  ADD COLUMN variable TEXT NOT NULL DEFAULT 'daily_high';

ALTER TABLE city_calibrations
  ADD CONSTRAINT city_calibrations_variable_check
    CHECK (variable IN ('daily_high', 'daily_low'));

ALTER TABLE city_calibrations
  DROP CONSTRAINT city_calibrations_city_key_key;

ALTER TABLE city_calibrations
  ADD CONSTRAINT city_calibrations_city_variable_unique
    UNIQUE (city_key, variable);

-- Existing rows backfill to 'daily_high' via the column default. The
-- city_calibrations index from migration 006 (idx_city_calibrations_city
-- on city_key) remains valid for queries that filter by city_key alone.
```

- [ ] **Step 2: Sanity-check via psql or Supabase SQL runner**

(Manual step — applied at deploy time. Do **not** apply locally to a shared dev DB during implementation.)

The migration is idempotent only on a fresh `city_calibrations` table. After deploy, attempting to re-run will fail at `DROP CONSTRAINT` because the constraint is already gone — that's correct behavior.

---

### Task 2: Refactor `src/lib/config.ts`

**Files:**
- Modify: `src/lib/config.ts`
- Modify: `src/lib/__tests__/config.test.ts`

- [ ] **Step 1: Update the failing test first**

Rewrite `src/lib/__tests__/config.test.ts`:

```typescript
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
    expect(getAllCityKeys().sort()).toEqual(["chi", "den", "la", "miami", "nyc", "phil"]);
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
      expect(Number.isFinite(s.sigmaFloor), `${s.seriesTicker}.sigmaFloor`).toBe(true);
      expect(Number.isFinite(s.sigmaCeiling), `${s.seriesTicker}.sigmaCeiling`).toBe(true);
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
  ])("returns the daily_high series for %s", (city, ticker) => {
    const s = getSeriesConfig(city as never, "daily_high");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/config.test.ts`

Expected: many failures (`SERIES_REGISTRY`, `getAllSeriesConfigs`, `getSeriesConfig`, `getSeriesConfigByTicker`, `seriesInfoFromMarketTicker`, `WEATHER_VARIABLES` are not exported yet).

- [ ] **Step 3: Refactor `src/lib/config.ts`**

Replace the file contents with:

```typescript
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
  maxNoEntryPrice: number;
  maxYesModeledProbability: number;
  disableBucketRangeYes: boolean;
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
  slippagePenalty: 0.02,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
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
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    ...SHARED_TRADING_DEFAULTS,
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    ...SHARED_TRADING_DEFAULTS,
  },
  chi: {
    cityCoords: { latitude: 41.9803, longitude: -87.909 },
    timezone: "America/Chicago",
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    ...SHARED_TRADING_DEFAULTS,
  },
  la: {
    cityCoords: { latitude: 33.9416, longitude: -118.4085 },
    timezone: "America/Los_Angeles",
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    ...SHARED_TRADING_DEFAULTS,
  },
  den: {
    cityCoords: { latitude: 39.8617, longitude: -104.6731 },
    timezone: "America/Denver",
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    ...SHARED_TRADING_DEFAULTS,
  },
  phil: {
    cityCoords: { latitude: 39.8729, longitude: -75.2437 },
    timezone: "America/New_York",
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
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
    // v7: 2.5 → 1.5 floor. The v4 floor was conservative; Miami's empirical
    // RMSE runs ~1.3°F so a 2.5 floor was forcing the model to be
    // *under*confident.
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
  cityKey: CityKey,
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
```

- [ ] **Step 4: Run config tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/config.test.ts`

Expected: all assertions green (~30 cases).

- [ ] **Step 5: Run TypeScript build**

Run: `npx tsc --noEmit`

Expected: errors at every call site that previously read `cityConfig.sigma`, `cityConfig.modelVersion`, `cityConfig.seriesTicker`, etc. These are fixed in subsequent tasks. Note them; do not fix yet.

You should see errors in roughly:
- `src/app/api/jobs/run-model/route.ts`
- `src/app/api/jobs/refresh-markets/route.ts`
- `src/app/api/jobs/recalibrate-sigma/route.ts`
- `src/app/api/jobs/refresh-external-data/route.ts` (if it reads sigma fields — it shouldn't, but check)
- `src/app/api/opportunities/route.ts` (live-fallback sigma path)
- `src/lib/weather/normalizeExternal.ts` (if it reads `sigmaFloor`)

If any *test* fails for a non-config reason, that signals an unintended behavior change — investigate before proceeding.

---

### Task 3: Update DB type definitions

**Files:**
- Modify: `src/lib/supabase/db.ts`

- [ ] **Step 1: Add `variable` field to `Market` and `CityCalibration`**

In `src/lib/supabase/db.ts`:

Find the `Market` interface and add (after `city_key`):
```typescript
  variable: import("@/lib/config").WeatherVariable;
```

Or, if importing at the top is preferred (more idiomatic), add an import at the top:
```typescript
import type { WeatherVariable } from "@/lib/config";
```
and use `variable: WeatherVariable;` in both interfaces.

Find the `CityCalibration` interface (search the file) and add:
```typescript
  variable: WeatherVariable;
```

- [ ] **Step 2: Update `upsertCityCalibration` signature and SELECT clauses**

Search for `upsertCityCalibration` in `db.ts`. Add `variable: WeatherVariable` to the param object. The Supabase client `.upsert(...)` already passes the object through; the only change needed is to include `variable` in the call payload AND change the conflict target from `'city_key'` to `'city_key,variable'`.

Find any place that calls `.upsert(payload, { onConflict: 'city_key' })` for `city_calibrations` — change `onConflict: 'city_key,variable'`.

Find `getAllCityCalibrations()` — make sure the SELECT clause returns `variable` (using `*` or explicit columns that include `variable`).

- [ ] **Step 3: Run TypeScript build**

Run: `npx tsc --noEmit`

Expected: errors related to upserting `city_calibrations` without `variable`. These are fixed in Task 7.

---

### Task 4: Variable-aware `normalizeExternal.ts`

**Files:**
- Modify: `src/lib/weather/normalizeExternal.ts`
- Modify: `src/lib/weather/__tests__/normalizeExternal.test.ts`

- [ ] **Step 1: Update normalizeExternal tests first**

In `src/lib/weather/__tests__/normalizeExternal.test.ts`, append (inside the existing describe):

```typescript
  it("emits a by_variable.daily_high block mirroring the legacy daily fields", () => {
    const forecast = makeMinimalForecast({ forecastedHigh: 70, forecastDate: "2026-04-29" });
    const normalized = buildNormalizedExternalJson(forecast, null, "nyc");
    expect(normalized.schema_version).toBe(2);
    const byVariable = normalized.by_variable as Record<string, unknown>;
    expect(byVariable).toBeDefined();
    expect(byVariable.daily_high).toBeDefined();
    const dailyHigh = byVariable.daily_high as Record<string, unknown>;
    expect(Array.isArray(dailyHigh.daily_forecasts)).toBe(true);
    expect((dailyHigh.daily_forecasts as Array<{ forecasted_high: number }>)[0].forecasted_high).toBe(70);
  });

  it("emits no by_variable.daily_low block in Phase 2a", () => {
    const forecast = makeMinimalForecast({ forecastedHigh: 70, forecastDate: "2026-04-29" });
    const normalized = buildNormalizedExternalJson(forecast, null, "nyc");
    const byVariable = normalized.by_variable as Record<string, unknown>;
    expect(byVariable.daily_low).toBeUndefined();
  });
```

If `makeMinimalForecast` doesn't already exist as a helper in the test file, add a tiny helper at the top of the file:

```typescript
function makeMinimalForecast(opts: { forecastedHigh: number; forecastDate: string }) {
  return {
    forecastedHigh: opts.forecastedHigh,
    forecastDate: opts.forecastDate,
    dailyHighs: [
      { forecastDate: opts.forecastDate, forecastedHigh: opts.forecastedHigh },
    ],
    currentTemp: null,
    hourlyTemps: [],
    forecastTimestamp: "2026-04-28T12:00:00Z",
    utcOffsetSeconds: -14400,
    rawResponse: {},
  };
}
```

Use the existing fixture pattern if there's a similar helper already; don't duplicate.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/weather/__tests__/normalizeExternal.test.ts`

Expected: 2 new tests fail (`schema_version` and `by_variable.daily_high` not present).

- [ ] **Step 3: Update `normalizeExternal.ts` to emit `by_variable` block**

In `src/lib/weather/normalizeExternal.ts`, at the bottom of `buildNormalizedExternalJson`, before the final `return base`, add:

```typescript
  const dailyHighSlice = {
    daily_forecasts: dailyForecasts,
    ensemble: ensembleOptions
      ? {
          available: head.ensemble_available,
          mean: head.ensemble_mean ?? null,
          stdev: head.ensemble_stdev ?? null,
          min: head.ensemble_min ?? null,
          max: head.ensemble_max ?? null,
          member_count: head.ensemble_member_count ?? null,
          sigma_used: head.ensemble_sigma_used ?? null,
        }
      : { available: false },
  };

  base.schema_version = 2;
  base.by_variable = {
    daily_high: dailyHighSlice,
  };
```

(Keep the existing legacy mirror fields at root unchanged.)

- [ ] **Step 4: Add a variable-aware lookup helper**

In `src/lib/weather/normalizeExternal.ts`, after `findDailyForecastForDate`, add:

```typescript
/**
 * Variable-aware per-date forecast lookup. Reads from
 * `normalized.by_variable[variable].daily_forecasts` when present and
 * falls back to the legacy root-level `daily_forecasts` (which always holds
 * daily_high data) for backwards compatibility with pre-v2 snapshots.
 */
export function findDailyForecastForVariableAndDate(
  normalizedJson: Record<string, unknown> | null | undefined,
  variable: "daily_high" | "daily_low",
  targetDate: string | null | undefined
): NormalizedDailyForecast | null {
  if (!normalizedJson || !targetDate) return null;
  const byVariable = normalizedJson.by_variable as
    | Record<string, { daily_forecasts?: unknown }>
    | undefined;
  const slice = byVariable?.[variable];
  if (slice && Array.isArray(slice.daily_forecasts)) {
    for (const entry of slice.daily_forecasts as unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (
        e.forecast_date === targetDate &&
        typeof e.forecasted_high === "number"
      ) {
        return e as unknown as NormalizedDailyForecast;
      }
    }
    return null;
  }
  if (variable === "daily_high") {
    return findDailyForecastForDate(normalizedJson, targetDate);
  }
  return null;
}
```

- [ ] **Step 5: Run normalizeExternal tests**

Run: `npx vitest run src/lib/weather/__tests__/normalizeExternal.test.ts`

Expected: green. All existing tests still pass; the 2 new `by_variable` tests pass.

---

### Task 5: Variable-aware `run-model`

**Files:**
- Modify: `src/app/api/jobs/run-model/route.ts`

- [ ] **Step 1: Replace `cityConfig.sigma` reads with `seriesConfig`**

In `src/app/api/jobs/run-model/route.ts`:

Update imports (top of file):

```typescript
import { getCityConfig, getAllCityKeys, sharedConfig, getSeriesConfig } from "@/lib/config";
import {
  findDailyForecastForDate,
  findDailyForecastForVariableAndDate,
} from "@/lib/weather/normalizeExternal";
```

Inside the per-market loop, after `const cityConfig = getCityConfig(market.city_key);` add:

```typescript
const seriesConfig = getSeriesConfig(market.city_key, market.variable);
```

Replace the variable-agnostic forecast lookup. Find the line:

```typescript
const dailyForecast = findDailyForecastForDate(normalized, market.market_date);
```

Replace with:

```typescript
const dailyForecast = findDailyForecastForVariableAndDate(
  normalized,
  market.variable,
  market.market_date
);
```

Replace `cityConfig.sigma`, `cityConfig.sigmaFloor`, `cityConfig.sigmaCeiling` reads in `resolveEffectiveSigma(...)` with `seriesConfig.sigma`, `seriesConfig.sigmaFloor`, `seriesConfig.sigmaCeiling`.

Replace `cityConfig.modelVersion` (in the `insertModelOutput` call) with `seriesConfig.modelVersion`.

Note: `cityConfig.minCalibrationSamples` stays on `cityConfig` (it's a city-level thing, shared across variables). `cityConfig.disableBucketRangeYes` etc. stay on `cityConfig`.

- [ ] **Step 2: Add `variable` to `feature_json`**

In the `featureJson` object literal, add (near the top, alongside `forecasted_high`):

```typescript
  variable: market.variable,
  forecasted_value: forecastedHigh,
```

This dual-writes: legacy `forecasted_high` is preserved; `forecasted_value` is the new variable-neutral mirror.

- [ ] **Step 3: Update calibration lookup to be variable-aware**

Find the calibration lookup:

```typescript
const calibration = calibrationByCity.get(market.city_key) ?? null;
```

Replace with:

```typescript
const calibration =
  calibrationByCityVariable.get(`${market.city_key}|${market.variable}`) ?? null;
```

And update the map construction (a few lines above) from:

```typescript
const calibrationByCity = new Map<string, CityCalibration>();
for (const c of calibrations) calibrationByCity.set(c.city_key, c);
```

to:

```typescript
const calibrationByCityVariable = new Map<string, CityCalibration>();
for (const c of calibrations) {
  calibrationByCityVariable.set(`${c.city_key}|${c.variable}`, c);
}
```

- [ ] **Step 4: Run TypeScript build**

Run: `npx tsc --noEmit`

Expected: `run-model` errors should be resolved. Errors in `recalibrate-sigma`, `refresh-markets`, and `opportunities` may remain — fixed in subsequent tasks.

- [ ] **Step 5: Run engine tests**

Run: `npx vitest run src/lib/engine`

Expected: green. The engine math is untouched, so all tests pass without modification.

---

### Task 6: Variable-aware `refresh-markets`

**Files:**
- Modify: `src/app/api/jobs/refresh-markets/route.ts`

- [ ] **Step 1: Set `variable` from series info on import**

In `src/app/api/jobs/refresh-markets/route.ts`:

Update imports:

```typescript
import { CITY_REGISTRY, getAllSeriesConfigs, seriesInfoFromMarketTicker } from "@/lib/config";
```

Replace the series ticker derivation. Find:

```typescript
const seriesTickers = getAllCityKeys().map((k) => CITY_REGISTRY[k].seriesTicker);
```

Replace with:

```typescript
const seriesTickers = getAllSeriesConfigs().map((s) => s.seriesTicker);
```

Where the row is built for `upsert` into `markets`, find the city_key derivation and replace with the variable-aware version. Search for `cityKeyFromMarketTicker(detail.ticker)` and replace with:

```typescript
const seriesInfo = seriesInfoFromMarketTicker(detail.ticker);
const cityKey = seriesInfo?.cityKey ?? "nyc"; // preserve existing fallback
const variable = seriesInfo?.variable ?? "daily_high";
```

Add `variable` to the `upsert` payload alongside `city_key`.

- [ ] **Step 2: Run TypeScript build**

Run: `npx tsc --noEmit`

Expected: errors in `refresh-markets` resolved. The `markets` upsert payload now matches the new `Market` shape.

---

### Task 7: Variable-aware `recalibrate-sigma`

**Files:**
- Modify: `src/app/api/jobs/recalibrate-sigma/route.ts`

- [ ] **Step 1: Iterate `(city, variable)` pairs and read variable-aware fields**

In `src/app/api/jobs/recalibrate-sigma/route.ts`:

Update imports:

```typescript
import { getCityConfig, getAllSeriesConfigs, sharedConfig } from "@/lib/config";
```

Replace the outer loop. Find:

```typescript
for (const cityKey of cities) {
  const cfg = getCityConfig(cityKey);
  // ...
}
```

Replace with:

```typescript
for (const series of getAllSeriesConfigs()) {
  const cityKey = series.cityKey;
  const variable = series.variable;
  const cfg = getCityConfig(cityKey);
  // ...
}
```

Update the postmortem fetch filter. Find:

```typescript
.eq("structured_json->>city_key", cityKey)
```

Add a variable filter that preserves backwards compatibility (postmortems written before Phase 2a have no `variable` field — those are implicitly `daily_high`):

```typescript
.eq("structured_json->>city_key", cityKey)
.or(
  variable === "daily_high"
    ? `structured_json->>variable.eq.${variable},structured_json->>variable.is.null`
    : `structured_json->>variable.eq.${variable}`
)
```

Update the per-row read to prefer new fields then fall back to legacy. Find:

```typescript
const actual = Number(s.actual_high_temp);
// ...
const forecast = Number(featureJson?.forecasted_high);
```

Replace with:

```typescript
const actual = Number(
  s.actual_value ?? s.actual_high_temp
);
const forecast = Number(
  featureJson?.forecasted_value ?? featureJson?.forecasted_high
);
```

Update the `upsertCityCalibration` call to include `variable`:

```typescript
await upsertCityCalibration({
  city_key: cityKey,
  variable,
  niche_key: sharedConfig.nicheKey,
  // ... existing fields ...
});
```

Update the result push to include `variable`:

```typescript
results.push({
  city_key: cityKey,
  variable,
  // ... existing fields ...
});
```

(And update the `results` array element type at the top to include `variable: string`.)

- [ ] **Step 2: Run TypeScript build**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Run all tests**

Run: `npm test`

Expected: green.

---

### Task 8: Variable-aware postmortem payload

**Files:**
- Modify: `src/lib/ai/postmortemTradePayload.ts`
- Create: `src/lib/__tests__/postmortemPayload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/postmortemPayload.test.ts`. Inspect the existing `postmortemTradePayload.ts` to find the function name and signature (likely `buildPostmortemTradePayload(...)` or similar). Write a test that constructs a synthetic input and asserts:

- `result.variable === "daily_high"`
- `result.actual_value === <expected>`
- `result.forecasted_value === <expected>`
- `result.actual_high_temp === <same as actual_value>` (legacy mirror preserved)
- `result.forecasted_high === <same as forecasted_value>` (legacy mirror preserved)

Use minimal fixtures — only the inputs the function reads.

If you can't easily synthesize the input shape (the function pulls a lot from DB types), instead exercise this through an integration-style test that constructs a minimal Market + ModelOutput + Trade + actual temp.

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/lib/__tests__/postmortemPayload.test.ts`

Expected: failure on the new fields not being set.

- [ ] **Step 3: Update `postmortemTradePayload.ts`**

Find where the structured payload is constructed. Add three new fields alongside the existing ones, populated from `market.variable` and the corresponding actual/forecast values:

```typescript
variable: market.variable,
actual_value: actualTemp,           // same source as actual_high_temp today
forecasted_value: forecastedHigh,   // same source as forecasted_high today
```

Keep `actual_high_temp` and `forecasted_high` exactly as they are.

- [ ] **Step 4: Run the test, expect green**

Run: `npx vitest run src/lib/__tests__/postmortemPayload.test.ts`

Expected: green.

---

### Task 9: Variable-aware AI prompts

**Files:**
- Modify: `src/lib/ai/prompts.ts`

- [ ] **Step 1: Read the current postmortem prompt**

Open `src/lib/ai/prompts.ts` and locate the postmortem prompt (around line 43 per existing exploration). It currently references "actual high" / "forecasted high" / "actual_high_temp" / "forecasted_high".

- [ ] **Step 2: Templatize the variable label**

Add a helper at the top of the file:

```typescript
function variableLabel(variable: string | undefined | null): string {
  return variable === "daily_low" ? "low" : "high";
}
```

In the postmortem prompt builder, replace literal `"high"` occurrences with `${variableLabel(input.variable)}` interpolations. Replace literal references to `actual_high_temp` and `forecasted_high` in the prompt body with neutral phrasing that asks the model to use whichever fields are present (`actual_value` / `forecasted_value` preferred, legacy fallback OK).

If the prompt currently *reads* values from `structured_json.actual_high_temp` etc., update it to prefer `actual_value` / `forecasted_value` and fall back to legacy fields. The actual values written into the prompt come from the postmortem payload (Task 8), which now writes both — so this is a documentation/template update, not a logic change.

- [ ] **Step 3: TypeScript + tests**

Run: `npx tsc --noEmit && npm test`

Expected: clean.

---

### Task 10: Variable-aware `v1-replay`

**Files:**
- Modify: `scripts/v1-replay.mjs`

- [ ] **Step 1: Read the current forecast-extraction logic**

In `scripts/v1-replay.mjs`, find the section (~line 338) that extracts `forecasted_high` from `external_data_snapshots.normalized_json`.

- [ ] **Step 2: Switch to variable-aware extraction with legacy fallback**

Update the SELECT to also pull the new fields. Find (~line 337):

```javascript
`SELECT city_key, captured_at,
        normalized_json->>'forecasted_high' AS forecasted_high,
        normalized_json->>'forecast_timestamp' AS forecast_timestamp,
        normalized_json->>'previous_forecast_high' AS previous_forecast_high
   FROM external_data_snapshots
  ...`
```

Replace with a query that pulls the entire `normalized_json` JSONB (so the script can read variable-aware slices in JS). Or, more surgically, add the SQL-level extraction:

```javascript
`SELECT city_key, captured_at, normalized_json
   FROM external_data_snapshots
  WHERE city_key = ANY($1)
    AND captured_at BETWEEN $2 AND $3
  ORDER BY captured_at ASC`
```

Then in JS:

```javascript
const normalized = r.normalized_json;
const forecastTimestamp = normalized?.forecast_timestamp ?? null;
// Variable-aware extraction:
const variable = market.variable ?? "daily_high"; // applied per-market in the loop below
const dailyByVariable = normalized?.by_variable?.[variable]?.daily_forecasts;
const dailyLegacy = normalized?.daily_forecasts;
const dailyArr = Array.isArray(dailyByVariable) ? dailyByVariable : dailyLegacy;
// Look up the row matching market.market_date:
const slice = dailyArr?.find((d) => d.forecast_date === market.market_date);
const forecastedValue = slice?.forecasted_high; // schema kept the field name as forecasted_high inside slice
const previousForecastedValue = slice?.previous_forecasted_high;
```

The `markets` SELECT must also be updated to include `variable`:

```javascript
`SELECT id, ticker, city_key, variable, market_structure::text AS market_structure,
        ...
   FROM markets
  ...`
```

And the `markets.map((m) => ...)` post-processing should set `m.variable` (default `'daily_high'` if column is null — though after migration it won't be).

- [ ] **Step 3: Sanity-run the replay against a known window**

Run: `node scripts/v1-replay.mjs --from 2026-04-15 --to 2026-04-22 --cities nyc,miami`

Expected: matches the replay numbers from Phase 1 commit (file: `tmp/v1-replay-2026-04-15-to-2026-04-22-nyc_miami.csv`). If the script no longer matches, the variable-aware extraction has changed behavior — investigate.

If you can't run replay against production data locally, document this as a manual post-deploy verification step.

---

### Task 11: Final verification

**Files:** none modified

- [ ] **Step 1: Full test suite**

Run: `npm test`

Expected: all tests pass. Counts shift slightly from Phase 1's 176; new test cases land in Tasks 2, 4, 8.

- [ ] **Step 2: TypeScript build**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Lint static check**

Use the editor's lint output / ReadLints on every modified file. The `npm run lint` command may fail due to the existing Node 18.0.0 / 18.17.0 constraint — that's a pre-existing environment issue, not part of this PR.

- [ ] **Step 4: Spot-check that the engine math is unchanged**

Quick sanity check: for any active market in `markets` (post-deploy), the modeled probability emitted by `run-model` should be identical to within floating-point error vs the previous deploy. This is checked manually by comparing two consecutive `model_outputs.feature_json.forecasted_high` and `modeled_probability` values across the deploy boundary.

- [ ] **Step 5: Apply migration in production**

After the PR is reviewed and ready to merge, apply `supabase/migrations/008_markets_and_calibrations_variable.sql` first (via Supabase SQL editor or CLI), then merge the application code.

Order matters: the migration must land before the app deploys, otherwise Supabase will reject INSERTs that include the `variable` column.

Verify post-migration before merging:

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'markets' AND column_name = 'variable';
-- Expect: 1 row, NOT NULL, DEFAULT 'daily_high'

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'city_calibrations' AND column_name = 'variable';
-- Expect: 1 row, NOT NULL, DEFAULT 'daily_high'

SELECT variable, COUNT(*) FROM markets GROUP BY variable;
-- Expect: only 'daily_high', count = current market count

SELECT city_key, variable FROM city_calibrations ORDER BY city_key;
-- Expect: 1 row per city, all variable = 'daily_high'
```

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin HEAD
```

Then open a PR titled `refactor: introduce variable dimension across pipeline (Phase 2a)` referencing the spec and plan. Body should call out:

- Phase 2a is a no-op behaviorally (no new markets, no new prompts visible in production)
- Migration 008 is additive; rollback is safe to leave the column in place
- Phase 2b is the follow-up that adds `KXLOWT*` series

---

## Post-deploy verification

1. **Within 1 hour** of deploy:
   ```sql
   SELECT (feature_json ->> 'variable') AS v, COUNT(*)
   FROM model_outputs
   WHERE captured_at > now() - INTERVAL '1 hour'
   GROUP BY v;
   ```
   Expect: only `daily_high`. If any row has `null`, a pre-Phase-2a model output is being read; that's fine for old rows, but new rows must all have `variable` set.

2. **Within 1 hour** of deploy:
   ```sql
   SELECT id, jsonb_typeof(normalized_json -> 'by_variable') AS by_variable_type
   FROM external_data_snapshots
   ORDER BY captured_at DESC LIMIT 6;
   ```
   Expect: all `'object'`.

3. **Within 7 days**:
   ```sql
   SELECT city_key, variable, sample_count, forecast_error_rmse
   FROM city_calibrations
   ORDER BY city_key, variable;
   ```
   Expect: 6 rows, all `variable = 'daily_high'`. RMSE values should match what they were before the deploy (within sampling noise; window-day cron rolls forward).

4. **Spot-check signal stability**: pick one settled market from before the deploy and compare its emitted modeled_probability and feature_json.forecasted_high with what the same market would produce post-deploy. Differences should be ≤0.001 absolute.

If any of those checks fail, revert the application-level commit. The DB migration stays.
