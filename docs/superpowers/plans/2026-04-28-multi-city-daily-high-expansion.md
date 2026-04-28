# Multi-City Daily-High Expansion (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chicago (`KXHIGHCHI`), Los Angeles (`KXHIGHLAX`), Denver (`KXHIGHDEN`), and Philadelphia (`KXHIGHPHIL`) as four new daily-high cities reusing the existing engine, schema, and cron loop.

**Architecture:** Pure config + climatology + UI label additions. No schema migrations, no engine changes, no new code paths. Each new city adds an entry to `CITY_REGISTRY`, a row of monthly-normal-high values in `climatology.ts`, and a label in `CityBadge`. The existing market-discovery cron, normalization pipeline, run-model job, and recalibrate-sigma job all already iterate `getAllCityKeys()` — extending the registry extends every pipeline automatically.

**Tech Stack:** TypeScript, Next.js 14, Vitest. Reuses Open-Meteo forecast/ensemble APIs and Kalshi market API at unchanged endpoints.

**Spec:** `docs/superpowers/specs/2026-04-28-multi-city-daily-high-expansion-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/weather/__tests__/climatology.test.ts` | Modify | Tests for new-city normals before adding the data |
| `src/lib/weather/climatology.ts` | Modify | Add monthly-avg-high anchors for `chi`, `la`, `den`, `phil` |
| `src/lib/__tests__/config.test.ts` | Create | Tests for `cityKeyFromMarketTicker` / `cityKeyFromSeriesTicker` covering new cities |
| `src/lib/config.ts` | Modify | Extend `CityKey` union and `CITY_REGISTRY` with 4 new entries |
| `src/lib/kalshi/__tests__/marketMetadata.test.ts` | Modify | Parametrized regression tests for new-city ticker parsing |
| `src/app/(app)/trades/page.tsx` | Modify | Replace `CityBadge` ternary with a label map covering all 6 cities |

No DB migrations. No cron changes. No env changes. No new dependencies.

---

### Task 1: Climatology data for 4 new cities (TDD)

**Files:**
- Modify: `src/lib/weather/__tests__/climatology.test.ts`
- Modify: `src/lib/weather/climatology.ts`

**Source for monthly-normal-high values:** NOAA 1991–2020 climate normals at each city's primary NWS-reporting station. Values used in this task:

| city | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `chi` (ORD)  | 32 | 36 | 47 | 59 | 70 | 80 | 85 | 83 | 76 | 62 | 49 | 36 |
| `la` (LAX)   | 68 | 68 | 70 | 73 | 74 | 78 | 82 | 83 | 82 | 78 | 73 | 68 |
| `den` (DEN)  | 45 | 47 | 55 | 61 | 71 | 83 | 90 | 88 | 80 | 65 | 53 | 44 |
| `phil` (PHL) | 41 | 44 | 53 | 64 | 73 | 82 | 86 | 84 | 78 | 67 | 56 | 46 |

These are 1°F-rounded approximations of the published normals, matching the fidelity of the existing `nyc` and `miami` rows.

- [ ] **Step 1: Add failing tests for the new cities**

In `src/lib/weather/__tests__/climatology.test.ts`, append the following block at the end of the existing `describe`:

```typescript
  it("returns sensible warm-season normals for each new city", () => {
    const cases: { city: string; min: number; max: number }[] = [
      { city: "chi", min: 78, max: 92 },
      { city: "la", min: 78, max: 88 },
      { city: "den", min: 82, max: 95 },
      { city: "phil", min: 80, max: 92 },
    ];
    for (const { city, min, max } of cases) {
      const v = climatologyNormalHighFahrenheit(city, "2026-07-15");
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it("returns midwinter normals lower than midsummer for each new city", () => {
    for (const city of ["chi", "la", "den", "phil"]) {
      const summer = climatologyNormalHighFahrenheit(city, "2026-07-15");
      const winter = climatologyNormalHighFahrenheit(city, "2026-01-15");
      expect(summer).toBeGreaterThan(winter);
    }
  });

  it("LA has the smallest annual swing among the new cities", () => {
    const cities = ["chi", "la", "den", "phil"];
    const swings = cities.map((c) => {
      const summer = climatologyNormalHighFahrenheit(c, "2026-07-15");
      const winter = climatologyNormalHighFahrenheit(c, "2026-01-15");
      return { c, swing: summer - winter };
    });
    const la = swings.find((s) => s.c === "la")!;
    for (const other of swings) {
      if (other.c === "la") continue;
      expect(la.swing).toBeLessThan(other.swing);
    }
  });

  it("does not return the generic fallback for known new cities", () => {
    for (const city of ["chi", "la", "den", "phil"]) {
      const v = climatologyNormalHighFahrenheit(city, "2026-06-15");
      expect(v).not.toBe(65);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/weather/__tests__/climatology.test.ts`

Expected: 4 new tests fail. The "does not return the generic fallback" test fails because new cities resolve to the `GENERIC_FALLBACK = 65` constant.

- [ ] **Step 3: Add the climatology data**

In `src/lib/weather/climatology.ts`, replace the `CLIMATOLOGY_MONTHLY_AVG_HIGH_F` const with:

```typescript
const CLIMATOLOGY_MONTHLY_AVG_HIGH_F: Record<string, readonly number[]> = {
  nyc:   [39, 42, 50, 61, 71, 80, 85, 84, 77, 66, 55, 45],
  miami: [76, 78, 80, 83, 87, 90, 91, 91, 89, 86, 81, 77],
  chi:   [32, 36, 47, 59, 70, 80, 85, 83, 76, 62, 49, 36],
  la:    [68, 68, 70, 73, 74, 78, 82, 83, 82, 78, 73, 68],
  den:   [45, 47, 55, 61, 71, 83, 90, 88, 80, 65, 53, 44],
  phil:  [41, 44, 53, 64, 73, 82, 86, 84, 78, 67, 56, 46],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/weather/__tests__/climatology.test.ts`

Expected: all tests pass (existing 4 + new 4 = 8 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather/climatology.ts src/lib/weather/__tests__/climatology.test.ts
git commit -m "feat(weather): add climatology normals for chi/la/den/phil"
```

---

### Task 2: Extend `CityKey` and `CITY_REGISTRY` (TDD)

**Files:**
- Create: `src/lib/__tests__/config.test.ts`
- Modify: `src/lib/config.ts`

- [ ] **Step 1: Create the failing config test**

Create `src/lib/__tests__/config.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import {
  CITY_REGISTRY,
  cityKeyFromMarketTicker,
  cityKeyFromSeriesTicker,
  getAllCityKeys,
} from "@/lib/config";

describe("CITY_REGISTRY", () => {
  it("contains all six expected cities", () => {
    const keys = getAllCityKeys().sort();
    expect(keys).toEqual(["chi", "den", "la", "miami", "nyc", "phil"]);
  });

  it("each city has a unique seriesTicker", () => {
    const tickers = Object.values(CITY_REGISTRY).map((c) => c.seriesTicker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it("each city has finite numeric sigma fields with floor <= sigma <= ceiling", () => {
    for (const [key, cfg] of Object.entries(CITY_REGISTRY)) {
      expect(Number.isFinite(cfg.sigma), `${key}.sigma`).toBe(true);
      expect(Number.isFinite(cfg.sigmaFloor), `${key}.sigmaFloor`).toBe(true);
      expect(Number.isFinite(cfg.sigmaCeiling), `${key}.sigmaCeiling`).toBe(true);
      expect(cfg.sigmaFloor).toBeLessThanOrEqual(cfg.sigma);
      expect(cfg.sigma).toBeLessThanOrEqual(cfg.sigmaCeiling);
    }
  });
});

describe("cityKeyFromSeriesTicker", () => {
  const cases: [string, string][] = [
    ["KXHIGHNY", "nyc"],
    ["KXHIGHMIA", "miami"],
    ["KXHIGHCHI", "chi"],
    ["KXHIGHLAX", "la"],
    ["KXHIGHDEN", "den"],
    ["KXHIGHPHIL", "phil"],
  ];
  it.each(cases)("maps %s -> %s", (series, city) => {
    expect(cityKeyFromSeriesTicker(series)).toBe(city);
  });

  it("returns null for unknown series", () => {
    expect(cityKeyFromSeriesTicker("KXFOO")).toBeNull();
  });
});

describe("cityKeyFromMarketTicker", () => {
  const cases: [string, string][] = [
    ["KXHIGHNY-26APR06-T67", "nyc"],
    ["KXHIGHMIA-26APR15-B88.5", "miami"],
    ["KXHIGHCHI-26APR29-T61", "chi"],
    ["KXHIGHLAX-26APR29-B72.5", "la"],
    ["KXHIGHDEN-26APR29-T63", "den"],
    ["KXHIGHPHIL-26APR29-T71", "phil"],
  ];
  it.each(cases)("maps %s -> %s", (ticker, city) => {
    expect(cityKeyFromMarketTicker(ticker)).toBe(city);
  });

  it("returns null for unknown market ticker prefixes", () => {
    expect(cityKeyFromMarketTicker("KXFOOBAR-26APR06-T67")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/config.test.ts`

Expected: TypeScript / runtime errors because `getAllCityKeys()` returns only `["nyc", "miami"]` and the new series tickers are not registered. Tests for `chi`/`la`/`den`/`phil` should fail.

- [ ] **Step 3: Extend `CityKey` and `CITY_REGISTRY`**

In `src/lib/config.ts`, replace the `CityKey` type and the `CITY_REGISTRY` const with:

```typescript
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
    minCalibrationSamples: 5,
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
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    disabledMarketStructures: ["bucket_range"],
  },
  chi: {
    cityCoords: { latitude: 41.9803, longitude: -87.9090 },
    timezone: "America/Chicago",
    seriesTicker: "KXHIGHCHI",
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
    sigma: 2.5,
    sigmaFloor: 1.5,
    sigmaCeiling: 5.0,
    minCalibrationSamples: 5,
    calibrationWindowDays: 14,
    modelVersion: "weather_temp_v8",
    ...SHARED_TRADING_DEFAULTS,
    // 1°F-wide bucket markets at σ=2.5°F fall below minBucketWidthSigmaRatio=1.5
    // (1/2.5 = 0.4); the engine would NO_TRADE all bucket_range entries anyway.
    // Disabling them explicitly mirrors Miami and clarifies intent.
    disabledMarketStructures: ["bucket_range"],
  },
  den: {
    cityCoords: { latitude: 39.8617, longitude: -104.6731 },
    timezone: "America/Denver",
    seriesTicker: "KXHIGHDEN",
    // High-altitude continental + downslope (chinook) winds → wider error tails.
    // Highest sigma in the registry; calibration may relax this within ~1 week.
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
```

Note: this replaces the existing inline `SHARED_TRADING_DEFAULTS` and `CITY_REGISTRY` declarations. The existing `getCityConfig`, `getAllCityKeys`, `cityKeyFromSeriesTicker`, `cityKeyFromMarketTicker`, and `sharedConfig` functions/exports below remain unchanged.

- [ ] **Step 4: Run config tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/config.test.ts`

Expected: 4 describe blocks, all green (10+ assertions across the parametrized cases).

- [ ] **Step 5: Run TypeScript build to confirm no compile breakage**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/config.ts src/lib/__tests__/config.test.ts
git commit -m "feat(config): register chi/la/den/phil daily-high cities"
```

---

### Task 3: Ticker-parser regression tests for new cities

These tests should pass without any code change (the `deriveMarketMetadataFromKalshi` parser is variable-agnostic). Adding them now guards against future regressions if anyone touches the parser.

**Files:**
- Modify: `src/lib/kalshi/__tests__/marketMetadata.test.ts`

- [ ] **Step 1: Add parametrized parser tests for new cities**

Append the following block inside the existing `describe("deriveMarketMetadataFromKalshi", ...)` body, before the closing `});`:

```typescript
  it.each([
    {
      city: "Chicago",
      ticker: "KXHIGHCHI-26APR29-T61",
      title: "Will the high temp in Chicago be >61° on Apr 29, 2026?",
      strike_type: "greater" as const,
      floor_strike: 61,
      cap_strike: undefined,
      expectStructure: "binary_threshold" as const,
      expectThreshold: 61,
      expectDirection: "greater" as const,
    },
    {
      city: "LA",
      ticker: "KXHIGHLAX-26APR29-B72.5",
      title: "Will the **high temp in LA** be 72-73° on Apr 29, 2026?",
      strike_type: "between" as const,
      floor_strike: 72,
      cap_strike: 73,
      expectStructure: "bucket_range" as const,
      expectThreshold: null,
      expectDirection: null,
    },
    {
      city: "Denver",
      ticker: "KXHIGHDEN-26APR29-T56",
      title: "Will the **high temp in Denver** be <56° on Apr 29, 2026?",
      strike_type: "less" as const,
      floor_strike: undefined,
      cap_strike: 56,
      expectStructure: "binary_threshold" as const,
      expectThreshold: 56,
      expectDirection: "less" as const,
    },
    {
      city: "Philadelphia",
      ticker: "KXHIGHPHIL-26APR29-T71",
      title: "Will the **high temp in Philadelphia** be >71° on Apr 29, 2026?",
      strike_type: "greater" as const,
      floor_strike: 71,
      cap_strike: undefined,
      expectStructure: "binary_threshold" as const,
      expectThreshold: 71,
      expectDirection: "greater" as const,
    },
  ])("parses $city ticker $ticker correctly", (c) => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        ticker: c.ticker,
        title: c.title,
        strike_type: c.strike_type,
        floor_strike: c.floor_strike,
        cap_strike: c.cap_strike,
      })
    );
    expect(m.market_structure).toBe(c.expectStructure);
    expect(m.threshold_value).toBe(c.expectThreshold);
    expect(m.threshold_direction).toBe(c.expectDirection);
    if (c.expectStructure === "bucket_range") {
      expect(m.bucket_lower).toBe(c.floor_strike);
      expect(m.bucket_upper).toBe(c.cap_strike);
    }
  });
```

- [ ] **Step 2: Run parser tests to verify they pass**

Run: `npx vitest run src/lib/kalshi/__tests__/marketMetadata.test.ts`

Expected: all tests green, including 4 new parametrized cases. No source changes were needed because the parser only uses `strike_type`/strikes/title/`-T#` regex — none of which depend on city.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kalshi/__tests__/marketMetadata.test.ts
git commit -m "test(kalshi): regression coverage for chi/la/den/phil tickers"
```

---

### Task 4: Update `CityBadge` UI labels

**Files:**
- Modify: `src/app/(app)/trades/page.tsx`

- [ ] **Step 1: Replace the inline ternary with a label map**

In `src/app/(app)/trades/page.tsx`, replace the existing `CityBadge` function (currently at lines 149–157) with:

```typescript
const CITY_LABELS: Record<string, string> = {
  nyc: "NYC",
  miami: "MIA",
  chi: "CHI",
  la: "LAX",
  den: "DEN",
  phil: "PHL",
};

function CityBadge({ city }: { city: string | null }) {
  if (!city) return <span className="text-zinc-600">—</span>;
  const label = CITY_LABELS[city] ?? city.toUpperCase();
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
      {label}
    </span>
  );
}
```

The fallback to `city.toUpperCase()` keeps the page forward-compatible if a future city (e.g. Houston) lands in the DB before its label is mapped.

- [ ] **Step 2: Verify build and lint**

Run: `npx tsc --noEmit`

Expected: no errors.

Run: `npm run lint`

Expected: no errors in `trades/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/trades/page.tsx
git commit -m "feat(ui): CityBadge labels for chi/la/den/phil"
```

---

### Task 5: Final verification

**Files:** none modified

- [ ] **Step 1: Full test suite**

Run: `npm test`

Expected: all tests pass. New tests added in Tasks 1–3 contribute roughly 14 new assertions/cases; nothing else should regress.

- [ ] **Step 2: TypeScript build**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 4: Confirm config integrity by booting the dev server (optional sanity check)**

Run: `npm run dev` for ~10 seconds, then kill.

Expected: no startup errors; Next compiles. Visiting `http://localhost:3000/trades` renders the existing dashboard without server errors.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin HEAD
```

Then open a PR titled `feat: multi-city daily-high expansion (Phase 1: chi/la/den/phil)` referencing the spec and plan. Body should call out:

- 4 cities added: Chicago, Los Angeles, Denver, Philadelphia
- No DB migration, no engine change, no cron schedule change
- Open-Meteo and Kalshi request volume tripling within free-tier limits
- Post-merge verification queries (in spec §6) for confirming markets/snapshots/signals appear

---

## Post-merge production verification

Not part of the implementation, but documented here so the operator runs them after deploy:

1. **Markets are imported.** Within 1 hour of the next `refresh-markets` cron tick:

   ```sql
   SELECT city_key, COUNT(*) AS active_count
   FROM markets
   WHERE status = 'active'
   GROUP BY city_key
   ORDER BY city_key;
   ```

   Expected: rows for `chi`, `la`, `den`, `phil` with non-zero counts.

2. **External data is captured.** Within 1 hour of the next `refresh-external-data` cron tick:

   ```sql
   SELECT city_key, MAX(captured_at) AS latest
   FROM external_data_snapshots
   GROUP BY city_key
   ORDER BY city_key;
   ```

   Expected: rows for all 6 cities, all `latest` within the past hour.

3. **Model outputs flow.** Within 1 hour of the next `run-model` cron tick:

   ```sql
   SELECT m.city_key, COUNT(*) AS outputs_today
   FROM model_outputs mo
   JOIN markets m ON m.id = mo.market_id
   WHERE mo.captured_at > now() - INTERVAL '1 hour'
   GROUP BY m.city_key
   ORDER BY m.city_key;
   ```

   Expected: non-zero counts for all 6 cities. (Signal counts depend on whether any market clears the gates and may legitimately be zero in early days.)

4. **Empirical σ kicks in (within ~7 days).** After 5 settled markets per new city, `recalibrate-sigma` replaces the static prior:

   ```sql
   SELECT city_key, sigma_value, sample_count, last_calibrated_at
   FROM city_calibrations
   ORDER BY city_key;
   ```

   Expected: `sample_count >= 5` for each new city; `sigma_value` likely different from the priors set in `CITY_REGISTRY`.

If any of these checks fail, the rollback is to revert `CITY_REGISTRY` entries — no DB cleanup is needed (existing rows simply stop being refreshed).
