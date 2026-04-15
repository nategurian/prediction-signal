# Ensemble-Derived Dynamic Sigma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded per-city sigma with ECMWF IFS ensemble stdev (50 members) so the probability model uses real forecast uncertainty.

**Architecture:** A new `fetchEnsembleForecast` function calls the Open-Meteo ensemble API in parallel with the existing deterministic forecast. The ensemble stdev (floored at 1.5°F) flows through normalized JSON into run-model, where it replaces the static config sigma. Static sigma remains as fallback when the API is unavailable.

**Tech Stack:** TypeScript, Next.js 14, Vitest, Open-Meteo Ensemble API, Supabase (no schema migration — uses existing JSONB columns)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/weather/types.ts` | Modify | Add `EnsembleForecast` interface |
| `src/lib/weather/client.ts` | Modify | Add `fetchEnsembleForecast` function |
| `src/lib/weather/__tests__/ensemble.test.ts` | Create | Tests for ensemble parsing and stdev computation |
| `src/lib/config.ts` | Modify | Add `sigmaFloor`, bump model version |
| `src/lib/weather/normalizeExternal.ts` | Modify | Accept optional ensemble, emit ensemble fields |
| `src/lib/weather/__tests__/normalizeExternal.test.ts` | Create | Tests for ensemble fields in normalized JSON |
| `src/app/api/jobs/refresh-external-data/route.ts` | Modify | Fetch ensemble alongside deterministic forecast |
| `src/app/api/jobs/run-model/route.ts` | Modify | Read ensemble sigma from external data, use as effective sigma |
| `src/app/api/opportunities/route.ts` | Modify | Same sigma resolution in live fallback path |

---

### Task 1: Add `EnsembleForecast` Type

**Files:**
- Modify: `src/lib/weather/types.ts`

- [ ] **Step 1: Add the interface**

In `src/lib/weather/types.ts`, add after the `WeatherForecast` interface:

```typescript
export interface EnsembleForecast {
  ensembleMean: number;
  ensembleStdev: number;
  ensembleMin: number;
  ensembleMax: number;
  memberCount: number;
  memberHighs: number[];
  forecastDate: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/weather/types.ts
git commit -m "feat: add EnsembleForecast type"
```

---

### Task 2: Add `sigmaFloor` to Config and Bump Model Version

**Files:**
- Modify: `src/lib/config.ts`

- [ ] **Step 1: Add `sigmaFloor` to `CityConfig` and city entries**

In `src/lib/config.ts`, add `sigmaFloor: number` to the `CityConfig` interface after the `sigma` field.

Set `sigmaFloor: 1.5` for both `nyc` and `miami` in `CITY_REGISTRY`.

Change `modelVersion` from `"weather_temp_v2"` to `"weather_temp_v3"` for both cities.

```typescript
export interface CityConfig {
  cityCoords: { latitude: number; longitude: number };
  timezone: string;
  seriesTicker: string;
  sigma: number;
  sigmaFloor: number;
  modelVersion: string;
  // ... rest unchanged
}
```

```typescript
export const CITY_REGISTRY: Record<CityKey, CityConfig> = {
  nyc: {
    cityCoords: { latitude: 40.7128, longitude: -74.006 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHNY",
    sigma: 3.5,
    sigmaFloor: 1.5,
    modelVersion: "weather_temp_v3",
    ...SHARED_TRADING_DEFAULTS,
  },
  miami: {
    cityCoords: { latitude: 25.7617, longitude: -80.1918 },
    timezone: "America/New_York",
    seriesTicker: "KXHIGHMIA",
    sigma: 2.5,
    sigmaFloor: 1.5,
    modelVersion: "weather_temp_v3",
    ...SHARED_TRADING_DEFAULTS,
  },
};
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add sigmaFloor to config, bump model version to v3"
```

---

### Task 3: Implement `fetchEnsembleForecast`

**Files:**
- Modify: `src/lib/weather/client.ts`
- Create: `src/lib/weather/__tests__/ensemble.test.ts`

- [ ] **Step 1: Write tests for ensemble parsing**

Create `src/lib/weather/__tests__/ensemble.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseEnsembleMembers } from "../client";

describe("parseEnsembleMembers", () => {
  it("extracts member values for a given day index", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
      temperature_2m_max_member01: [84.0],
      temperature_2m_max_member02: [86.0],
      temperature_2m_max_member03: [85.5],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([84.0, 86.0, 85.5]);
  });

  it("filters out null member values", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
      temperature_2m_max_member01: [84.0],
      temperature_2m_max_member02: [null],
      temperature_2m_max_member03: [85.5],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([84.0, 85.5]);
  });

  it("returns empty array when no member keys exist", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([]);
  });

  it("uses correct day index for multi-day response", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15", "2026-04-16"],
      temperature_2m_max: [85.0, 90.0],
      temperature_2m_max_member01: [84.0, 89.0],
      temperature_2m_max_member02: [86.0, 91.0],
    };
    const day0 = parseEnsembleMembers(daily, 0);
    const day1 = parseEnsembleMembers(daily, 1);
    expect(day0).toEqual([84.0, 86.0]);
    expect(day1).toEqual([89.0, 91.0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/weather/__tests__/ensemble.test.ts`
Expected: FAIL — `parseEnsembleMembers` is not exported.

- [ ] **Step 3: Implement `parseEnsembleMembers` and `fetchEnsembleForecast`**

In `src/lib/weather/client.ts`, add the import for the new type at the top:

```typescript
import type { OpenMeteoResponse, WeatherForecast, EnsembleForecast } from "./types";
```

Add these functions after the existing `findClosestHourIndex` function:

```typescript
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";

export function parseEnsembleMembers(
  daily: Record<string, unknown>,
  dayIndex: number
): number[] {
  const members: number[] = [];
  for (const key of Object.keys(daily)) {
    if (!key.startsWith("temperature_2m_max_member")) continue;
    const arr = daily[key];
    if (!Array.isArray(arr)) continue;
    const val = arr[dayIndex];
    if (typeof val === "number" && Number.isFinite(val)) {
      members.push(val);
    }
  }
  return members;
}

export async function fetchEnsembleForecast(
  cityKey: string
): Promise<EnsembleForecast | null> {
  try {
    const { cityCoords, timezone } = getCityConfig(cityKey);

    const params = new URLSearchParams({
      latitude: cityCoords.latitude.toString(),
      longitude: cityCoords.longitude.toString(),
      models: "ecmwf_ifs025",
      daily: "temperature_2m_max",
      temperature_unit: "fahrenheit",
      timezone,
      forecast_days: "3",
    });

    const res = await fetch(`${ENSEMBLE_URL}?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`Ensemble API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const daily = data.daily as Record<string, unknown> | undefined;
    if (!daily) return null;

    const todayIndex = 0;
    const times = daily.time as string[] | undefined;
    if (!times || times.length === 0) return null;

    const memberHighs = parseEnsembleMembers(daily, todayIndex);
    if (memberHighs.length < 2) return null;

    const mean = memberHighs.reduce((a, b) => a + b, 0) / memberHighs.length;
    const variance =
      memberHighs.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      (memberHighs.length - 1);
    const stdev = Math.sqrt(variance);

    return {
      ensembleMean: mean,
      ensembleStdev: stdev,
      ensembleMin: Math.min(...memberHighs),
      ensembleMax: Math.max(...memberHighs),
      memberCount: memberHighs.length,
      memberHighs,
      forecastDate: times[todayIndex],
    };
  } catch (err) {
    console.warn("Ensemble forecast fetch failed:", err);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/weather/__tests__/ensemble.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/weather/client.ts src/lib/weather/__tests__/ensemble.test.ts
git commit -m "feat: add fetchEnsembleForecast with ECMWF IFS ensemble parsing"
```

---

### Task 4: Update `buildNormalizedExternalJson` for Ensemble Data

**Files:**
- Modify: `src/lib/weather/normalizeExternal.ts`
- Create: `src/lib/weather/__tests__/normalizeExternal.test.ts`

- [ ] **Step 1: Write tests for ensemble fields in normalized JSON**

Create `src/lib/weather/__tests__/normalizeExternal.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildNormalizedExternalJson } from "../normalizeExternal";
import type { WeatherForecast, EnsembleForecast } from "../types";

const baseForecast: WeatherForecast = {
  forecastedHigh: 85,
  forecastDate: "2026-04-15",
  currentTemp: 78,
  hourlyTemps: [],
  forecastTimestamp: new Date().toISOString(),
  utcOffsetSeconds: -14400,
  rawResponse: {} as WeatherForecast["rawResponse"],
};

describe("buildNormalizedExternalJson — ensemble fields", () => {
  it("includes ensemble fields when ensemble data is provided", () => {
    const ensemble: EnsembleForecast = {
      ensembleMean: 85.2,
      ensembleStdev: 2.1,
      ensembleMin: 81.0,
      ensembleMax: 89.5,
      memberCount: 50,
      memberHighs: Array.from({ length: 50 }, (_, i) => 81 + i * 0.18),
      forecastDate: "2026-04-15",
    };
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(true);
    expect(result.ensemble_mean).toBe(85.2);
    expect(result.ensemble_stdev).toBe(2.1);
    expect(result.ensemble_min).toBe(81.0);
    expect(result.ensemble_max).toBe(89.5);
    expect(result.ensemble_member_count).toBe(50);
    expect(result.ensemble_sigma_used).toBe(2.1);
  });

  it("applies sigma floor when ensemble stdev is below it", () => {
    const ensemble: EnsembleForecast = {
      ensembleMean: 85.0,
      ensembleStdev: 0.8,
      ensembleMin: 83.5,
      ensembleMax: 86.2,
      memberCount: 50,
      memberHighs: Array.from({ length: 50 }, (_, i) => 83.5 + i * 0.055),
      forecastDate: "2026-04-15",
    };
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(true);
    expect(result.ensemble_stdev).toBe(0.8);
    expect(result.ensemble_sigma_used).toBe(1.5);
  });

  it("marks ensemble_available false when ensemble is null", () => {
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble: null,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(false);
    expect(result.ensemble_mean).toBeUndefined();
    expect(result.ensemble_stdev).toBeUndefined();
    expect(result.ensemble_sigma_used).toBeUndefined();
  });

  it("still includes all original fields when ensemble is provided", () => {
    const result = buildNormalizedExternalJson(baseForecast, 84, "nyc", {
      ensemble: null,
      sigmaFloor: 1.5,
    });
    expect(result.forecasted_high).toBe(85);
    expect(result.previous_forecast_high).toBe(84);
    expect(result.forecast_revision).toBe(1);
  });

  it("preserves backward compatibility when no ensemble options passed", () => {
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc");
    expect(result.forecasted_high).toBe(85);
    expect(result.ensemble_available).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/weather/__tests__/normalizeExternal.test.ts`
Expected: FAIL — function signature doesn't accept ensemble options yet.

- [ ] **Step 3: Update `buildNormalizedExternalJson`**

In `src/lib/weather/normalizeExternal.ts`, add the import for `EnsembleForecast`:

```typescript
import type { WeatherForecast, EnsembleForecast } from "./types";
```

Update the function signature to accept an optional fourth parameter:

```typescript
export function buildNormalizedExternalJson(
  forecast: WeatherForecast,
  previousForecastHigh: number | null,
  cityKey: string,
  ensembleOptions?: {
    ensemble: EnsembleForecast | null;
    sigmaFloor: number;
  }
): Record<string, unknown> {
```

At the end of the returned object (before the closing `return`), add the ensemble fields conditionally. Replace the existing `return { ... }` block. Keep all existing fields, and append ensemble fields after them:

```typescript
  const base: Record<string, unknown> = {
    forecasted_high: forecast.forecastedHigh,
    forecast_date: forecast.forecastDate,
    current_temp: forecast.currentTemp,
    previous_forecast_high: previousForecastHigh,
    forecast_revision:
      previousForecastHigh != null ? forecast.forecastedHigh - previousForecastHigh : null,
    forecast_timestamp: forecast.forecastTimestamp,
    hourly_temps_count: forecast.hourlyTemps.length,
    lead_time_hours_to_forecast_local_noon: leadHours,
    climatology_normal_high_f: climatologyNormalHighF,
    forecast_anomaly_vs_climatology_f: forecastAnomalyVsClimatologyF,
    utc_offset_seconds: forecast.utcOffsetSeconds,
  };

  if (ensembleOptions) {
    const { ensemble, sigmaFloor } = ensembleOptions;
    if (ensemble) {
      base.ensemble_available = true;
      base.ensemble_mean = ensemble.ensembleMean;
      base.ensemble_stdev = ensemble.ensembleStdev;
      base.ensemble_min = ensemble.ensembleMin;
      base.ensemble_max = ensemble.ensembleMax;
      base.ensemble_member_count = ensemble.memberCount;
      base.ensemble_sigma_used = Math.max(ensemble.ensembleStdev, sigmaFloor);
    } else {
      base.ensemble_available = false;
    }
  }

  return base;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/weather/__tests__/normalizeExternal.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing tests unaffected because the new param is optional).

- [ ] **Step 6: Commit**

```bash
git add src/lib/weather/normalizeExternal.ts src/lib/weather/__tests__/normalizeExternal.test.ts
git commit -m "feat: add ensemble fields to normalized external JSON"
```

---

### Task 5: Wire Up Ensemble Fetch in `refresh-external-data`

**Files:**
- Modify: `src/app/api/jobs/refresh-external-data/route.ts`

- [ ] **Step 1: Import `fetchEnsembleForecast` and `getCityConfig`**

In `src/app/api/jobs/refresh-external-data/route.ts`, add imports:

```typescript
import { fetchWeatherForecast, fetchEnsembleForecast } from "@/lib/weather/client";
```

And add `getCityConfig` to the existing config import:

```typescript
import { getAllCityKeys, getCityConfig, sharedConfig } from "@/lib/config";
```

- [ ] **Step 2: Fetch ensemble and pass to normalization**

Inside the `for (const cityKey of cityKeys)` loop, after the `forecast` fetch and before the `validation` call, add the ensemble fetch. Then update the `buildNormalizedExternalJson` call to pass ensemble options.

After `const forecast = await fetchWeatherForecast(cityKey);`, add:

```typescript
        const cityConfig = getCityConfig(cityKey);
        const ensemble = await fetchEnsembleForecast(cityKey);
```

Update the `buildNormalizedExternalJson` call to pass ensemble options as the fourth argument:

```typescript
        const normalizedJson = buildNormalizedExternalJson(
          forecast,
          previousForecastHigh,
          cityKey,
          { ensemble, sigmaFloor: cityConfig.sigmaFloor }
        );
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/jobs/refresh-external-data/route.ts
git commit -m "feat: fetch ensemble forecast in refresh-external-data pipeline"
```

---

### Task 6: Use Ensemble Sigma in `run-model`

**Files:**
- Modify: `src/app/api/jobs/run-model/route.ts`

- [ ] **Step 1: Add sigma resolution logic**

In `src/app/api/jobs/run-model/route.ts`, inside the `for (const market of markets)` loop, after reading `forecastAnomalyVsClimatologyF` from the normalized JSON (around line 49), add:

```typescript
        const ensembleAvailable = normalized.ensemble_available === true;
        const ensembleSigmaUsed = normalized.ensemble_sigma_used;
        const ensembleStdev = normalized.ensemble_stdev;
        const ensembleMean = normalized.ensemble_mean;
        const ensembleMemberCount = normalized.ensemble_member_count;

        const effectiveSigma =
          ensembleAvailable &&
          typeof ensembleSigmaUsed === "number" &&
          Number.isFinite(ensembleSigmaUsed)
            ? ensembleSigmaUsed
            : cityConfig.sigma;

        const sigmaSource = ensembleAvailable &&
          typeof ensembleSigmaUsed === "number" &&
          Number.isFinite(ensembleSigmaUsed)
            ? "ensemble" as const
            : "static_fallback" as const;
```

- [ ] **Step 2: Replace `cityConfig.sigma` with `effectiveSigma`**

Update the `computeModeledProbability` call to use `effectiveSigma`:

```typescript
        const probResult = computeModeledProbability({
          forecastHigh: forecastedHigh,
          marketStructure: market.market_structure,
          threshold: market.threshold_value,
          thresholdDirection: market.threshold_direction,
          bucketLower: market.bucket_lower,
          bucketUpper: market.bucket_upper,
          sigma: effectiveSigma,
        });
```

Update the `computeConfidenceScore` call to use `effectiveSigma`:

```typescript
        const confidence = computeConfidenceScore({
          forecastTimestamp,
          forecastHigh: forecastedHigh,
          threshold: market.threshold_value,
          previousForecastHigh,
          yesBid: snapshot.yes_bid,
          yesAsk: snapshot.yes_ask,
          sigma: effectiveSigma,
        }, sharedConfig.confidenceWeights);
```

- [ ] **Step 3: Update `featureJson` to include ensemble metadata**

Replace the `sigma` line and add new fields in the `featureJson` object:

```typescript
        const featureJson = {
          forecasted_high: forecastedHigh,
          current_temp: currentTemp,
          forecast_timestamp: forecastTimestamp,
          previous_forecast_high: previousForecastHigh,
          forecast_revision: previousForecastHigh != null ? forecastedHigh - previousForecastHigh : null,
          lead_time_hours_to_forecast_local_noon:
            typeof leadTimeHours === "number" && Number.isFinite(leadTimeHours) ? leadTimeHours : null,
          climatology_normal_high_f:
            typeof climatologyNormalHighF === "number" && Number.isFinite(climatologyNormalHighF)
              ? climatologyNormalHighF
              : null,
          forecast_anomaly_vs_climatology_f:
            typeof forecastAnomalyVsClimatologyF === "number" &&
            Number.isFinite(forecastAnomalyVsClimatologyF)
              ? forecastAnomalyVsClimatologyF
              : null,
          sigma: effectiveSigma,
          sigma_source: sigmaSource,
          ensemble_stdev:
            typeof ensembleStdev === "number" && Number.isFinite(ensembleStdev)
              ? ensembleStdev
              : null,
          ensemble_mean:
            typeof ensembleMean === "number" && Number.isFinite(ensembleMean)
              ? ensembleMean
              : null,
          ensemble_member_count:
            typeof ensembleMemberCount === "number" ? ensembleMemberCount : null,
          threshold: market.threshold_value,
          threshold_direction: market.threshold_direction,
          bucket_lower: market.bucket_lower,
          bucket_upper: market.bucket_upper,
          market_structure: market.market_structure,
          yes_bid: snapshot.yes_bid,
          yes_ask: snapshot.yes_ask,
          no_bid: snapshot.no_bid,
          no_ask: snapshot.no_ask,
        };
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/jobs/run-model/route.ts
git commit -m "feat: use ensemble-derived sigma in run-model pipeline"
```

---

### Task 7: Use Ensemble Sigma in Opportunities Route

**Files:**
- Modify: `src/app/api/opportunities/route.ts`

- [ ] **Step 1: Add sigma resolution in the live fallback path**

In `src/app/api/opportunities/route.ts`, in the `else if (externalData && snapshot)` block (around line 79), after reading `forecastedHigh` and `forecastTimestamp` from the normalized JSON, add the same sigma resolution logic:

```typescript
          const ensembleAvailable = normalized.ensemble_available === true;
          const ensembleSigmaUsed = normalized.ensemble_sigma_used;

          const effectiveSigma =
            ensembleAvailable &&
            typeof ensembleSigmaUsed === "number" &&
            Number.isFinite(ensembleSigmaUsed)
              ? ensembleSigmaUsed
              : cityConfig.sigma;
```

- [ ] **Step 2: Replace `cityConfig.sigma` with `effectiveSigma`**

Update both calls in this block:

```typescript
              const probResult = computeModeledProbability({
                forecastHigh: forecastedHigh,
                marketStructure: market.market_structure,
                threshold: market.threshold_value,
                bucketLower: market.bucket_lower,
                bucketUpper: market.bucket_upper,
                sigma: effectiveSigma,
              });
              confidenceScore = computeConfidenceScore({
                forecastTimestamp,
                forecastHigh: forecastedHigh,
                threshold: market.threshold_value,
                previousForecastHigh,
                yesBid: snapshot.yes_bid,
                yesAsk: snapshot.yes_ask,
                sigma: effectiveSigma,
              }, sharedConfig.confidenceWeights);
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/opportunities/route.ts
git commit -m "feat: use ensemble sigma in opportunities live fallback path"
```

---

### Task 8: Smoke Test with Live API

- [ ] **Step 1: Run the dev server and hit refresh-external-data**

Run: `npm run dev` (in a separate terminal)

Then call:
```bash
curl -s -X POST http://localhost:3000/api/jobs/refresh-external-data \
  -H "Authorization: Bearer $ETL_CRON_SECRET" | python3 -m json.tool
```

Expected: Response has `ok: true` with snapshot IDs for each city.

- [ ] **Step 2: Verify ensemble fields in the stored snapshot**

Query the latest external_data_snapshot from Supabase (via the dashboard or CLI) and confirm the `normalized_json` contains:
- `ensemble_available: true`
- `ensemble_mean`, `ensemble_stdev`, `ensemble_min`, `ensemble_max` with plausible values
- `ensemble_sigma_used` equal to `max(ensemble_stdev, 1.5)`
- `ensemble_member_count: 50`

- [ ] **Step 3: Run the model pipeline and verify sigma in feature_json**

```bash
curl -s -X POST http://localhost:3000/api/jobs/run-model \
  -H "Authorization: Bearer $ETL_CRON_SECRET" | python3 -m json.tool
```

Query the latest `model_outputs` row and confirm `feature_json` contains:
- `sigma` — the effective sigma value (should differ from the old static value)
- `sigma_source: "ensemble"`
- `ensemble_stdev`, `ensemble_mean`, `ensemble_member_count` with plausible values

- [ ] **Step 4: Final commit with model version bump confirmation**

```bash
git log --oneline -7
```

Expected: 7 clean commits from Tasks 1–7, each with a descriptive message.
