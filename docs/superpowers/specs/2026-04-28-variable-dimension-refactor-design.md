# Variable-Dimension Refactor (Phase 2a)

## Problem

Every part of the signal pipeline implicitly assumes the predictand is "daily high temperature." `markets`, `external_data_snapshots.normalized_json`, `city_calibrations`, the run-model job, the recalibrate-sigma job, postmortem prompts, and the v1-replay script all reference `forecasted_high` / `actual_high_temp` directly. `CITY_REGISTRY` carries a single `seriesTicker` per city. To support daily-low markets (Phase 2b — Kalshi's `KXLOWT*` series with 10+ open markets per city), we need to introduce a `variable` dimension throughout, refactor `CITY_REGISTRY` so it can hold multiple series per city, and make the read/write paths variable-aware.

This spec covers **Phase 2a only**: the architectural refactor with **no behavior change**. The `SERIES_REGISTRY` ships with only `daily_high` entries (the existing 6 cities). All existing markets backfill to `variable = 'daily_high'`. Daily-low data fetching, low climatology, and the `KXLOWT*` series entries are deferred to Phase 2b.

## Solution

1. Add a `variable` column to `markets` and `city_calibrations` with a CHECK constraint allowing `'daily_high'` and `'daily_low'`.
2. Split the existing `CITY_REGISTRY` into:
   - `CITY_REGISTRY` — pure city/geography (coords, timezone, calibration window, shared trading defaults)
   - `SERIES_REGISTRY` — per-series config (cityKey, variable, σ priors, modelVersion, structure disables)
3. Extend `external_data_snapshots.normalized_json` with a `by_variable` block, while keeping legacy root fields (`forecasted_high`, `daily_forecasts`) as backwards-compat mirrors.
4. Make `run-model`, `recalibrate-sigma`, `postmortemTradePayload`, AI prompts, and `v1-replay` variable-aware — reading from new fields when present, falling back to legacy fields otherwise.
5. Add new helpers: `getSeriesConfig(cityKey, variable)`, `getSeriesConfigByTicker(ticker)`, `seriesInfoFromMarketTicker(ticker)`. Refactor existing helpers to use them.

The change is backward-compatible by construction: every read site falls back to the legacy field when the new field is absent, and every write site emits both. After Phase 2a deploys, the system runs identically to today; only the *shape* of the data and code is variable-aware.

## Scope

**In scope:**
- DB migration `008_markets_and_calibrations_variable.sql` adding `variable` column + CHECK to both tables, replacing the `city_calibrations` unique key
- Refactor `src/lib/config.ts` — `WeatherVariable` type, `SeriesConfig`, `SERIES_REGISTRY`, helpers
- Add `by_variable` block to `normalizeExternal.ts` output (populates `daily_high` slice from current data)
- Update `run-model`, `refresh-markets`, `recalibrate-sigma`, `postmortemTradePayload`, AI prompts, `v1-replay`, DB type definitions
- Variable-aware regression tests across config, normalization, calibration, postmortems

**Out of scope (Phase 2b):**
- Adding `KXLOWT*` series entries to `SERIES_REGISTRY`
- Fetching `temperature_2m_min` from Open-Meteo (forecast and ensemble)
- `fetchActualLowTemperature`
- Monthly-normal-low climatology
- Houston (no current Kalshi markets to make it worth a config entry)

**Out of scope (any phase):**
- Hourly NYC (no Kalshi series located)
- Renaming `city_calibrations` to `series_calibrations` (deferred — additive column is safer)
- `niche_key` changes (the niche stays `weather_daily_temp` for both variables; calibration belongs in the same niche so trading discipline applies uniformly)

---

## 1. DB migration — `008_markets_and_calibrations_variable.sql`

```sql
-- Phase 2a: introduce variable dimension on markets and city_calibrations.
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

Rollback: drop the new constraints, drop the new index, drop the new columns, restore the old unique constraint on `city_calibrations(city_key)`. No data loss because backfilled values are `'daily_high'` everywhere.

---

## 2. `src/lib/config.ts` refactor

### 2.1 New types

```ts
export type WeatherVariable = "daily_high" | "daily_low";

export const WEATHER_VARIABLES: readonly WeatherVariable[] = [
  "daily_high",
  "daily_low",
] as const;

export interface SeriesConfig {
  seriesTicker: string;
  cityKey: CityKey;
  variable: WeatherVariable;
  sigma: number;
  sigmaFloor: number;
  sigmaCeiling: number;
  modelVersion: string;
  disabledMarketStructures: readonly MarketStructure[];
}
```

### 2.2 `CityConfig` slimmed down

Remove from `CityConfig`: `seriesTicker`, `sigma`, `sigmaFloor`, `sigmaCeiling`, `modelVersion`, `disabledMarketStructures`. Keep `cityCoords`, `timezone`, `minCalibrationSamples`, `calibrationWindowDays`, plus the spread of `SHARED_TRADING_DEFAULTS`. Trading gates stay shared between high and low because the engine's edge / confidence / spread / settlement-time gates are not variable-specific.

### 2.3 `SERIES_REGISTRY` (Phase 2a — daily_high only)

Keyed by series ticker. Phase 2a contains 6 entries:

| seriesTicker | cityKey | variable | σ | floor | ceiling | disables |
|---|---|---|---|---|---|---|
| `KXHIGHNY` | `nyc` | `daily_high` | 3.5 | 3.0 | 7.0 | none |
| `KXHIGHMIA` | `miami` | `daily_high` | 2.5 | 1.5 | 5.0 | `["bucket_range"]` |
| `KXHIGHCHI` | `chi` | `daily_high` | 4.0 | 2.5 | 8.0 | none |
| `KXHIGHLAX` | `la` | `daily_high` | 2.5 | 1.5 | 5.0 | `["bucket_range"]` |
| `KXHIGHDEN` | `den` | `daily_high` | 4.5 | 3.0 | 9.0 | none |
| `KXHIGHPHIL` | `phil` | `daily_high` | 3.5 | 3.0 | 7.0 | none |

`modelVersion` for each: `"weather_temp_v8"` (unchanged from today).

### 2.4 Helpers

```ts
export function getSeriesConfig(cityKey: CityKey, variable: WeatherVariable): SeriesConfig;
export function getSeriesConfigByTicker(seriesTicker: string): SeriesConfig | null;
export function seriesInfoFromMarketTicker(marketTicker: string):
  { cityKey: CityKey; variable: WeatherVariable; seriesTicker: string } | null;
export function getAllSeriesConfigs(): SeriesConfig[];
export function getSeriesTickersForCity(cityKey: CityKey): string[];
```

`cityKeyFromSeriesTicker` and `cityKeyFromMarketTicker` are kept (still useful) and reimplemented on top of `seriesInfoFromMarketTicker`.

### 2.5 What does NOT change

- `getCityConfig(cityKey)` — same signature; returns slimmed `CityConfig`. Call sites that read `cityConfig.sigma` / `.modelVersion` / `.disabledMarketStructures` move to `getSeriesConfig`.
- `sharedConfig` and confidence weights — unchanged.

---

## 3. `external_data_snapshots.normalized_json` schema v2

```json
{
  "schema_version": 2,
  "forecasted_high": 75,
  "forecast_date": "2026-04-29",
  "current_temp": 62,
  "previous_forecast_high": 73,
  "forecast_revision": 2,
  "forecast_timestamp": "...",
  "hourly_temps_count": 168,
  "lead_time_hours_to_forecast_local_noon": 14.5,
  "climatology_normal_high_f": 65.0,
  "forecast_anomaly_vs_climatology_f": 10.0,
  "utc_offset_seconds": -14400,
  "daily_forecasts": [...],
  "ensemble_available": true,
  "ensemble_mean": 75.2,
  "ensemble_stdev": 1.4,
  "ensemble_min": 73,
  "ensemble_max": 77,
  "ensemble_member_count": 50,
  "ensemble_sigma_used": 1.5,

  "by_variable": {
    "daily_high": {
      "daily_forecasts": [...],
      "ensemble": {
        "available": true,
        "mean": 75.2, "stdev": 1.4,
        "min": 73, "max": 77,
        "member_count": 50,
        "sigma_used": 1.5
      }
    }
  }
}
```

Phase 2a only emits `by_variable.daily_high`. Phase 2b adds `by_variable.daily_low` once the Open-Meteo low fetch is wired in. Reads use `by_variable[variable]` when present, fall back to the root legacy fields when absent (e.g. for snapshots captured before Phase 2a deploys).

---

## 4. Run-model variable-aware reads

`run-model/route.ts`:

```ts
const seriesConfig = getSeriesConfig(market.city_key, market.variable);
const cityConfig = getCityConfig(market.city_key);

// Variable-aware forecast lookup with legacy fallback:
const variableSlice = (normalized.by_variable as Record<string, unknown> | undefined)?.[market.variable];
const dailyForecast =
  variableSlice
    ? findDailyForecastInSlice(variableSlice, market.market_date)
    : findDailyForecastForDate(normalized, market.market_date); // legacy
```

`seriesConfig.sigma` / `.sigmaFloor` / `.sigmaCeiling` / `.modelVersion` / `.disabledMarketStructures` replace the corresponding `cityConfig.*` reads. The `feature_json` written into `model_outputs` gains:

```json
{
  "variable": "daily_high",
  "forecasted_value": 75,
  "actual_value_field": "actual_high_temp",
  ... existing fields preserved as mirrors ...
}
```

---

## 5. Calibration

`recalibrate-sigma` becomes per (city, variable):

```ts
for (const series of getAllSeriesConfigs()) {
  // Filter postmortems: structured_json.city_key === series.cityKey
  //                    AND structured_json.variable === series.variable
  //                    (fallback: variable absent ⇒ implicit 'daily_high')
  // Read: actual_value || actual_high_temp
  //       forecasted_value || forecasted_high
  // Upsert by (city_key, variable)
}
```

`upsertCityCalibration(...)` gains a `variable: WeatherVariable` parameter; existing callers default to `'daily_high'`.

`getAllCityCalibrations()` returns rows keyed by `(city_key, variable)`. `run-model` looks up the relevant row via `calibrationByCityVariable.get(\`${cityKey}|${variable}\`)`.

---

## 6. Postmortem `structured_json` schema

`postmortemTradePayload.ts` adds new fields alongside legacy ones:

```json
{
  "variable": "daily_high",
  "actual_value": 78,
  "forecasted_value": 75,
  "actual_high_temp": 78,
  "forecasted_high": 75,
  ...
}
```

`recalibrate-sigma` prefers the new fields; backfill-postmortems route is unchanged for Phase 2a (still fetches `fetchActualHighTemperature` for the only existing variable).

---

## 7. AI prompts

`src/lib/ai/prompts.ts` postmortem prompt switches from:

> "Actual high {X}°F vs forecasted high {Y}°F"

to:

> "Actual {label} {X}°F vs forecasted {label} {Y}°F"  where `label = variable === 'daily_high' ? 'high' : 'low'`

Two sentence templates, selected by variable. The prompt header keeps "weather temperature markets" (covers both variables).

---

## 8. v1-replay

Reads `markets.variable` (defaults `'daily_high'` for old rows). For each tick, reads forecast value from `normalized.by_variable[variable].daily_forecasts` if available, falls back to `normalized.daily_forecasts` (legacy = always daily_high). Settles using `settlement_value` (binary) — no change.

---

## 9. Type updates in `src/lib/supabase/db.ts`

`Market` interface gains `variable: WeatherVariable`. `CityCalibration` gains `variable: WeatherVariable`. `upsertCityCalibration` signature gains the field.

---

## 10. Tests

New tests:
- `src/lib/__tests__/config.test.ts` — extend with `getSeriesConfig`, `getSeriesConfigByTicker`, `seriesInfoFromMarketTicker` cases. Confirm `SERIES_REGISTRY` has 6 daily_high entries and zero daily_low entries.
- `src/lib/weather/__tests__/normalizeExternal.test.ts` — assert `by_variable.daily_high` block is populated; legacy root fields still match.
- `src/lib/__tests__/postmortemPayload.test.ts` (new) — assert payload writes both `variable`/`actual_value`/`forecasted_value` AND legacy mirrors.
- Recalibrate-sigma is hard to unit-test directly (route-level); covered by the calibration unit tests + manual production smoke.

Existing tests must keep passing without modification — that is the proof of "behavioral no-op." Any test that breaks because field shapes changed indicates an unintended behavior change in 2a.

---

## 11. Migration / deployment

1. Apply migration `008_markets_and_calibrations_variable.sql` to Supabase. Existing rows backfill to `variable = 'daily_high'`.
2. Merge the PR. Vercel deploys.
3. **Within 1 hour** of next `refresh-markets` cron tick:
   ```sql
   SELECT variable, COUNT(*) FROM markets WHERE status = 'active' GROUP BY variable;
   ```
   Expected: only `daily_high` rows (no daily_low yet — Phase 2b).
4. **Within 1 hour** of next `refresh-external-data` cron tick:
   ```sql
   SELECT id, jsonb_typeof(normalized_json -> 'by_variable') AS by_variable_type
   FROM external_data_snapshots
   ORDER BY captured_at DESC
   LIMIT 6;
   ```
   Expected: all 6 latest rows have `by_variable_type = 'object'`.
5. **Within 1 hour** of next `run-model` cron tick:
   ```sql
   SELECT (feature_json ->> 'variable') AS v, COUNT(*)
   FROM model_outputs
   WHERE captured_at > now() - INTERVAL '1 hour'
   GROUP BY v;
   ```
   Expected: only `daily_high`. No production behavior change in win rate, P&L, or volume.
6. **Within 7 days**: `recalibrate-sigma` produces rows in `city_calibrations` with `variable = 'daily_high'` for each city; sigma values match what we'd expect from the same window today.

Rollback path: if anything regresses, revert the application-level commit. The DB migration is additive — leaving it in place is safe even after a code revert because the legacy code paths ignore the new column.

---

## 12. Risks

1. **Subtle behavior change snuck in.** The biggest risk in a "pure refactor" PR is an unintended behavior change. Mitigation: every existing test must keep passing without modification; spot-check one production day's `model_outputs` after deploy and confirm modeled probabilities are within 0.001 of pre-deploy.
2. **`normalized_json` write path drift.** If Phase 2a writes the new `by_variable` block but Phase 2b later reorganizes it, every snapshot written between the two phases lives in an in-between shape. Mitigation: Phase 2a fixes the schema with `schema_version: 2`; Phase 2b only *adds* the `daily_low` slice. We don't change `daily_high` again.
3. **Postmortem schema duality.** Carrying both `actual_value`/`forecasted_value` AND `actual_high_temp`/`forecasted_high` indefinitely is a smell. Plan: Phase 2a writes both; once 2b ships and is stable for 30 days, a Phase 2c cleanup PR removes the legacy mirrors. (Out of scope for this spec.)
4. **`disabledMarketStructures` per series, not per city.** Today this is per city. The refactor moves it to series. Phase 2a keeps the same effective behavior (only daily_high series exist; the existing Miami/LA disables carry over). Phase 2b can choose different structure disables for daily_low independently.

---

## 13. Success criteria

- All existing tests pass without modification.
- Within 24 hours of deploy, all production verification queries (§11) return expected results.
- Modeled probabilities for active markets are stable to ≤0.001 absolute change vs pre-deploy.
- No new errors in cron job logs.
- `city_calibrations` continues to populate empirical σ for all 6 cities, indistinguishable from pre-deploy.

If any of those fail, the response is to revert the application-level commit (DB migration stays).
