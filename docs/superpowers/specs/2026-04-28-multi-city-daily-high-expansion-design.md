# Multi-City Daily-High Expansion (Phase 1)

## Problem

The signal engine is hardcoded to two cities (NYC, Miami). All architecture is multi-city aware (city-keyed external data, per-city calibration, per-city configuration), but only two cities are wired in. Kalshi actively lists daily-high contracts for at least four additional U.S. cities — Chicago (`KXHIGHCHI`), Los Angeles (`KXHIGHLAX`), Denver (`KXHIGHDEN`), and Philadelphia (`KXHIGHPHIL`) — each with 10+ open markets at any time. Adding these roughly 3× our daily market count using exactly the same model and gating discipline already in production.

This spec is **Phase 1** of a previously-discussed three-phase weather-market expansion. Phase 2 (daily lows) is deferred to its own spec/PR — Kalshi lists daily-low markets under the `KXLOWT*` series prefix (e.g. `KXLOWTNYC`, `KXLOWTMIA`, `KXLOWTCHI`, `KXLOWTLAX`, `KXLOWTDEN`, `KXLOWTPHIL`, `KXLOWTHOU`), each with 10+ open markets, but adding them requires introducing a `variable` dimension across `markets`, `city_calibrations`, `external_data_snapshots.normalized_json`, the run-model pairing, the recalibrate-sigma cron, climatology, AI postmortem prompts, and the v1-replay script — substantially more architectural work than this spec covers. Phase 3 (hourly NYC) remains deferred — no Kalshi series for hourly NYC temperatures could be located.

## Solution

Add Chicago, Los Angeles, Denver, and Philadelphia to `CITY_REGISTRY` as additional daily-high cities. Reuse the existing forecast pipeline, probability model, calibration loop, settlement loop, and dashboard. No schema migration, no new code paths, no changes to engine math.

The only new ingredients are:
1. Per-city numerical configuration (coordinates, timezone, σ priors, climatology normals)
2. UI labels in `CityBadge`
3. Test fixtures asserting that the existing parser handles the new tickers

The model and gates remain identical. Empirical σ calibration kicks in per-city after `minCalibrationSamples` settled trades, exactly as it does today for NYC and Miami.

## Scope

**In scope:**
- Add 4 cities × 1 variable (daily high) = 4 new series ingested
- Conservative σ priors per city, climate-aware
- NOAA 1991–2020 monthly-normal-high climatology for the 4 new cities
- `CityBadge` UI labels for the new cities
- Unit tests covering ticker parsing, city resolution, and climatology lookups for each new city

**Out of scope (explicitly deferred):**
- Daily lows for any city — the `KXLOWT*` series are confirmed live (10+ open markets each across NYC/MIA/CHI/LAX/DEN/PHIL/HOU), but require introducing a `variable` dimension throughout the schema and pipeline. Tracked as Phase 2, separate spec.
- Hourly NYC (no Kalshi series found — Phase 3 if/when located)
- Houston (`KXHIGHHOU` — series exists but currently 0 open markets; trivial to add later by config alone). Note: `KXLOWTHOU` *is* live, but Houston enters the picture as part of Phase 2 along with lows for the other cities.
- Any change to the engine, schema, calibration, or AI prompts
- Bumping `modelVersion` (the model is identical)

---

## 1. Configuration — `src/lib/config.ts`

### 1.1 Extend `CityKey`

```ts
export type CityKey = "nyc" | "miami" | "chi" | "la" | "den" | "phil";
```

City keys are short and consistent with the existing `nyc` / `miami` style. They are *not* required to match Kalshi's city slug — the connection is via `seriesTicker`.

### 1.2 New `CITY_REGISTRY` entries

Each entry uses `SHARED_TRADING_DEFAULTS` for trading gates (identical to NYC/Miami). The city-specific values are:

| city | coords (lat, lng) | timezone | seriesTicker | σ | σ floor | σ ceiling | min calibration samples | calibration window days | disabled structures |
|---|---|---|---|---|---|---|---|---|---|
| `chi`  | 41.9803, −87.9090 (ORD) | `America/Chicago` | `KXHIGHCHI`  | 4.0 | 2.5 | 8.0 | 5 | 14 | none |
| `la`   | 33.9416, −118.4085 (LAX) | `America/Los_Angeles` | `KXHIGHLAX` | 2.5 | 1.5 | 5.0 | 5 | 14 | `["bucket_range"]` |
| `den`  | 39.8617, −104.6731 (DEN) | `America/Denver` | `KXHIGHDEN`  | 4.5 | 3.0 | 9.0 | 5 | 14 | none |
| `phil` | 39.8729, −75.2437 (PHL) | `America/New_York` | `KXHIGHPHIL` | 3.5 | 3.0 | 7.0 | 5 | 14 | none |

**Coordinate choice:** each city uses its primary NWS-reporting airport. Kalshi settles these markets against NWS Daily Climate Reports keyed to those stations, so forecasting against airport coordinates aligns the forecast variable with the settlement variable. (NYC uses NYC city coords today rather than EWR/LGA/JFK — that's a pre-existing choice we are *not* changing in this spec.)

**σ choices, rationale:**
- **Chicago (4.0):** Continental midwest with frequent frontal passages and lake-breeze effects in spring/summer. Empirically wider than NYC.
- **LA (2.5):** Coastal Mediterranean climate; mirrors Miami's stability profile. Bucket markets pre-disabled because narrow 1°F buckets at this σ are below the `minBucketWidthSigmaRatio = 1.5` gate (1°F / 2.5°F ≈ 0.4) and would all NO_TRADE anyway — the disable is for clarity, not safety.
- **Denver (4.5):** High-altitude continental + downslope (chinook) winds → wider error tails than the other three. Highest σ in the registry.
- **Philadelphia (3.5):** Mid-Atlantic seaboard, very similar regime to NYC. Same σ as NYC.

These are starting priors. After 5+ settled trades per city, the `recalibrate-sigma` cron replaces them with empirical RMSE.

`modelVersion` for each new city is `"weather_temp_v8"` — same as NYC and Miami. The model is unchanged, so the version is unchanged.

### 1.3 No changes to `cityKeyFromMarketTicker` / `cityKeyFromSeriesTicker`

Both functions iterate `CITY_REGISTRY` and match by `seriesTicker` prefix. Adding registry entries makes them work automatically. There is no per-city special-casing.

---

## 2. Climatology — `src/lib/weather/climatology.ts`

Add monthly average high (°F) anchors for each new city. Source: NOAA 1991–2020 climate normals from the city's primary NWS station (ORD, LAX, DEN, PHL).

```ts
const CLIMATOLOGY_MONTHLY_AVG_HIGH_F: Record<string, readonly number[]> = {
  nyc:   [39, 42, 50, 61, 71, 80, 85, 84, 77, 66, 55, 45],
  miami: [76, 78, 80, 83, 87, 90, 91, 91, 89, 86, 81, 77],
  chi:   [32, 36, 47, 59, 70, 80, 85, 83, 76, 62, 49, 36],
  la:    [68, 68, 70, 73, 74, 78, 82, 83, 82, 78, 73, 68],
  den:   [45, 47, 55, 61, 71, 83, 90, 88, 80, 65, 53, 44],
  phil:  [41, 44, 53, 64, 73, 82, 86, 84, 78, 67, 56, 46],
};
```

The interpolation logic in `climatologyNormalHighFahrenheit` is unchanged. New keys plug in via the same path.

---

## 3. UI — `CityBadge` in `src/app/(app)/trades/page.tsx`

Replace the inline ternary at line 151 with a lookup map. New labels:

| city_key | badge label |
|---|---|
| `nyc`   | NYC |
| `miami` | MIA |
| `chi`   | CHI |
| `la`    | LAX |
| `den`   | DEN |
| `phil`  | PHL |

Pattern: 3-letter airport-style code, all caps. Falls back to `city.toUpperCase()` for any future city not in the map (forward-compatible with adding Houston later).

The opportunities page does not currently surface city. No change there.

---

## 4. Cron / scheduling

No changes. The `refresh-markets`, `refresh-external-data`, `run-model`, `recalibrate-sigma`, and `settle-trades` jobs all already iterate `getAllCityKeys()` internally. Adding entries to `CITY_REGISTRY` extends every cron automatically.

The Open-Meteo `forecast` and `ensemble` endpoints are called once per city per cron tick. We're going from 2 → 6 cities, so the request volume to Open-Meteo triples. Open-Meteo's free tier allows 10,000 requests/day per IP; we are nowhere near that limit (current cron rate is roughly 96 calls/day per city).

The Kalshi `getMarketsBySeries` calls similarly triple. No rate-limit concern at this scale.

---

## 5. Tests

### 5.1 New tests

- `src/lib/kalshi/__tests__/marketMetadata.test.ts`: add a parametrized test that runs the existing assertions across one example ticker per new city (`KXHIGHCHI-26APR29-T61`, `KXHIGHLAX-26APR29-T73`, `KXHIGHDEN-26APR29-B62.5`, `KXHIGHPHIL-26APR29-T71`), confirming the regex-based parsing extracts the right `market_structure`, `threshold_value`, `bucket_lower/upper`, and `threshold_direction`.
- `src/lib/weather/__tests__/climatology.test.ts`: add a parametrized test that for each new city, the lookup is finite, within a sane band (10–110°F), and matches the configured anchors at month-midpoints.

### 5.2 Existing tests that should pass unmodified

- All probability, confidence, calibration, fees, signal, and simulation tests are city-agnostic — they pass `cityKey` through.
- The `cityKeyFromMarketTicker` / `cityKeyFromSeriesTicker` tests, if present, should be extended to cover one new ticker each (or added if not present).

### 5.3 No integration test required

The system is fully integration-tested in production via the cron loop. We rely on observability for production validation: after deploy, the next `refresh-markets` cron should populate `markets` rows for each new city, and `run-model` should generate signals.

---

## 6. Migration / deployment

No DB migration. No env changes. No cron schedule changes.

Deployment plan:
1. Merge the PR.
2. The next `refresh-markets` cron tick imports markets for the new cities. Verify in Supabase: `SELECT city_key, COUNT(*) FROM markets WHERE status = 'active' GROUP BY city_key`.
3. The next `refresh-external-data` cron tick fetches Open-Meteo forecasts for the new cities. Verify: `SELECT city_key, MAX(captured_at) FROM external_data_snapshots GROUP BY city_key`.
4. The next `run-model` cron tick produces signals for the new markets. Verify: trades dashboard shows city filter chips for the 4 new cities.
5. After each city accumulates 5+ settled markets, `recalibrate-sigma` replaces the prior σ with empirical RMSE. This typically takes ~1 week.

There is no rollback complication: removing the new entries from `CITY_REGISTRY` makes the system stop ingesting them. Existing markets/snapshots/signals stay in the DB but are simply not refreshed.

---

## 7. Risks

1. **Climatology drift.** NOAA 1991–2020 normals are a 30-year average; the present is warmer than that mean. The climatology number is only used as a confidence input (via `forecast_anomaly_vs_climatology_f`) and as a fallback in postmortem context — not as a prediction. A 1–2°F bias in the normals doesn't materially affect signal quality.
2. **Coordinate-vs-settlement-station drift.** Open-Meteo forecasts the lat/lng we give it. We're using NWS-reporting airport coordinates, which is the right frame for these markets. NYC is the lone outlier (city coords, not airport) — out of scope for this PR.
3. **Wider σ priors mean fewer Phase-1 trades.** Conservative starting σ (Chicago 4.0, Denver 4.5) means the model will be cautious until empirical calibration kicks in. This is intentional and matches the discipline used for NYC's launch.
4. **LA bucket disable.** Pre-disabling `bucket_range` for LA mirrors Miami's empirical finding. If it turns out LA's empirical σ is wider than expected, this disable is a no-op (the width-σ gate would also block). If σ is tighter than expected, we'd be over-restrictive — easy to flip with a config change later.
5. **Houston omitted.** `KXHIGHHOU` exists but had 0 open markets at design time. Adding it later is a one-line config change; no architectural cost to deferring.

---

## 8. Success criteria

- Within 24 hours of deploy: ≥1 active market per new city in `markets`.
- Within 48 hours: ≥1 model output per new city in `model_outputs` and ≥0 signals (signal count depends on whether any market clears the gates — early days will likely produce zero, which is correct).
- Within 7 days: ≥1 settled market per new city, allowing `recalibrate-sigma` to seed empirical σ.
- Within 14 days: each new city has ≥5 settled markets, empirical σ replaces the prior, and the trades dashboard shows P&L by city for all 6 cities.

If the engine produces signals on the new cities at materially worse win-rate than NYC/Miami over the first 30 settled trades, the response is to tighten σ priors / re-enable structure disables — not to revert this PR.
