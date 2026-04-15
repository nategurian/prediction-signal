# Ensemble-Derived Dynamic Sigma

## Problem

Sigma is hardcoded per city (NYC=3.5°F, Miami=2.5°F) and never changes. The model applies identical uncertainty to a calm day when all forecast models agree and to a volatile day when they diverge. Live ECMWF IFS ensemble data shows NYC's current stdev at ~0.94°F — the static 3.5 is nearly 4× too wide, suppressing edge detection and missing profitable trades. On high-uncertainty days the opposite problem occurs: the static sigma may be too tight, making the model overconfident.

## Solution

Replace the static sigma with the standard deviation of ECMWF IFS ensemble member daily high forecasts (50 perturbed members), enforcing a minimum floor to prevent pathological overconfidence. Fall back to the static config sigma when the ensemble API is unavailable.

## Scope

Changes across four layers, no schema migration needed (ensemble data is stored in existing `normalized_json` / `feature_json` JSONB columns):

1. Fetch ECMWF IFS ensemble data alongside the deterministic forecast
2. Compute ensemble stdev and persist it in external data snapshots
3. Use ensemble-derived sigma (with a floor) in probability and confidence calculations
4. Surface ensemble metadata in feature_json for postmortems and future calibration

---

## 1. Weather Client — `fetchEnsembleForecast`

New function in `src/lib/weather/client.ts`.

**API endpoint:** `https://ensemble-api.open-meteo.com/v1/ensemble`

**Parameters:**
- `models=ecmwf_ifs025`
- `daily=temperature_2m_max`
- `temperature_unit=fahrenheit`
- `timezone` — from city config
- `forecast_days=3`
- `latitude`, `longitude` — from city config

**Response parsing:**
- The API returns `temperature_2m_max` (control run) plus `temperature_2m_max_member01` through `temperature_2m_max_member50`
- Extract all 50 member values for today (index 0)
- Compute: mean, stdev, min, max across the 50 members

**Error handling:**
- Wrap in try/catch, return `null` on any failure (network, parse, missing data)
- Log a warning on failure so it's visible but never blocks the pipeline

**Return type:** `EnsembleForecast | null`

## 2. Types

New interface in `src/lib/weather/types.ts`:

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

## 3. Config Changes

In `src/lib/config.ts`:

- Add `sigmaFloor: number` to `CityConfig` — minimum sigma regardless of ensemble (1.5 for both cities)
- Existing `sigma` field remains as static fallback
- Bump `modelVersion` to `"weather_temp_v3"` for both cities

## 4. Normalized External Data

Update `buildNormalizedExternalJson` in `src/lib/weather/normalizeExternal.ts`:

- Add optional `ensemble: EnsembleForecast | null` parameter
- When ensemble is present, add to normalized JSON:
  - `ensemble_mean: number`
  - `ensemble_stdev: number`
  - `ensemble_min: number`
  - `ensemble_max: number`
  - `ensemble_member_count: number`
  - `ensemble_sigma_used: number` — `max(ensemble_stdev, sigmaFloor)`
  - `ensemble_available: true`
- When ensemble is null:
  - `ensemble_available: false`
  - No numeric ensemble fields

The `sigmaFloor` value is passed in from the city config by the caller.

## 5. refresh-external-data

Update `src/app/api/jobs/refresh-external-data/route.ts`:

- After `fetchWeatherForecast(cityKey)`, also call `fetchEnsembleForecast(cityKey)`
- The two calls are independent; if ensemble fails (returns null), the deterministic forecast still gets stored
- Pass the ensemble result into `buildNormalizedExternalJson`
- Pass `cityConfig.sigmaFloor` so the normalization layer can compute `ensemble_sigma_used`

## 6. run-model

Update `src/app/api/jobs/run-model/route.ts`:

- Read `ensemble_sigma_used` and `ensemble_available` from the external data's `normalized_json`
- Determine effective sigma:
  - If `ensemble_available === true` and `ensemble_sigma_used` is a finite number: use `ensemble_sigma_used`
  - Otherwise: fall back to `cityConfig.sigma`
- Pass the effective sigma into `computeModeledProbability` and `computeConfidenceScore`
- Add to `feature_json`:
  - `sigma` — the effective sigma actually used
  - `sigma_source: "ensemble" | "static_fallback"`
  - `ensemble_stdev` — raw stdev (when available), for calibration analysis
  - `ensemble_mean` — ensemble mean high (when available)
  - `ensemble_member_count` — number of members (when available)

## 7. Opportunities Route

Update `src/app/api/opportunities/route.ts`:

- In the live fallback path (where no model output exists), read `ensemble_sigma_used` and `ensemble_available` from the external data's `normalized_json`
- Use the same sigma selection logic as run-model: ensemble sigma if available, static fallback otherwise
- Pass the resolved sigma into `computeModeledProbability` and `computeConfidenceScore`

## 8. Confidence Score

No code changes needed. `computeThresholdDistanceComponent` and `computeRevisionStabilityComponent` already normalize by the sigma parameter — they automatically benefit from the dynamic value.

---

## Fallback Behavior

| Scenario | Sigma used | `sigma_source` |
|----------|-----------|----------------|
| Ensemble available, stdev > floor | ensemble stdev | `"ensemble"` |
| Ensemble available, stdev ≤ floor | sigma floor (1.5) | `"ensemble"` |
| Ensemble API fails | static config sigma | `"static_fallback"` |

## Files Changed

| File | Change |
|------|--------|
| `src/lib/weather/types.ts` | Add `EnsembleForecast` interface |
| `src/lib/weather/client.ts` | Add `fetchEnsembleForecast` function |
| `src/lib/config.ts` | Add `sigmaFloor` to config, bump model version |
| `src/lib/weather/normalizeExternal.ts` | Accept optional ensemble, emit ensemble fields |
| `src/app/api/jobs/refresh-external-data/route.ts` | Fetch ensemble, pass to normalization |
| `src/app/api/jobs/run-model/route.ts` | Read ensemble sigma, use as effective sigma |
| `src/app/api/opportunities/route.ts` | Same sigma resolution in live fallback path |

## Not in Scope

- Multi-model disagreement (GFS vs ECMWF) — future enhancement
- NWS alerts integration — future enhancement
- Calibration feedback loop — future enhancement, depends on accumulated ensemble-era data
- Changes to `probability.ts` or `confidence.ts` — these modules are sigma-agnostic; they receive sigma as a parameter
