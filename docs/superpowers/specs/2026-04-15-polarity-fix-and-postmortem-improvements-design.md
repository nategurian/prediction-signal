# Polarity Fix & Actionable Postmortems

## Problem

1. **Polarity bug**: `computeBinaryProbability` always returns P(temp > threshold) as P(YES). Kalshi threshold markets come in two flavors — `strike_type: "greater"` (P(YES) = P(temp > threshold)) and `strike_type: "less"` (P(YES) = P(temp < threshold)). The engine ignores the distinction, inverting probabilities on every "less" market.

2. **Postmortems lack ground truth**: The postmortem payload includes the forecast but never the actual observed temperature. Without it, the LLM cannot distinguish "forecast was wrong" from "model was miscalibrated."

3. **Postmortem output is shallow**: 1–2 sentence summaries that narrate outcomes instead of diagnosing failure modes. No structured fields for aggregation or tuning.

## Scope

Three changes, in dependency order:

1. Fix polarity bug (schema → metadata → probability → model)
2. Fetch actual observed temperature at settlement time
3. Restructured postmortem prompt, deterministic sanity checks, richer JSON output

After all three, backfill all 46 existing postmortems.

---

## 1. Polarity Fix

### Schema change

Add column `threshold_direction` to `markets`:

```sql
ALTER TABLE markets
  ADD COLUMN threshold_direction text
  CHECK (threshold_direction IN ('greater', 'less'));
```

Nullable — bucket markets and legacy rows leave it NULL.

### Market metadata

`deriveMarketMetadataFromKalshi` gains a `threshold_direction` field:

- `strike_type: "greater"` → `"greater"`
- `strike_type: "less"` → `"less"`
- Title heuristics: `>` / `≥` → `"greater"`, `<` → `"less"`
- Bucket markets / unknown → `null`

`refresh-markets` stores it on the market row.

### Probability

`computeBinaryProbability` gains a `direction` param (`"greater" | "less"`):

- `"greater"` (default): `1 - normalCdf(threshold, forecast, sigma)` (unchanged)
- `"less"`: `normalCdf(threshold, forecast, sigma)`

`computeModeledProbability` passes `direction` from its params.

### run-model

Passes `market.threshold_direction` through to `computeModeledProbability`.

### Backfill existing markets

A one-time SQL update:

```sql
UPDATE markets
SET threshold_direction = raw_json->>'strike_type'
WHERE market_structure = 'binary_threshold'
  AND raw_json->>'strike_type' IN ('greater', 'less');
```

---

## 2. Actual Observed Temperature

### New weather client function

`fetchActualHighTemperature(date: string, coords)` calls Open-Meteo Historical API:

```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude=40.7128&longitude=-74.006
  &start_date=2026-04-14&end_date=2026-04-14
  &daily=temperature_2m_max&temperature_unit=fahrenheit
  &timezone=America/New_York
```

Returns `number | null`.

### Integration point

In `settle-trades`, after settling but before building the postmortem payload, fetch the actual high for the market's `market_date`. Add `actual_high_temp` to the postmortem trade data. If the fetch fails, continue without it (graceful degradation).

### Postmortem payload

`buildPostmortemTradePayload` adds `actual_high_temp: number | null` to its return.

---

## 3. Better Postmortems

### Deterministic sanity checks

Before calling the LLM, compute flags from the payload data:

| Flag | Logic |
|------|-------|
| `polarity_mismatch` | Threshold market where model P(YES) contradicts obvious forecast direction (e.g. P(YES for <79°) = 94% when forecast is 82.9°) |
| `forecast_accurate` | `actual_high_temp` within 1 sigma of forecast |
| `forecast_inaccurate` | `actual_high_temp` outside 1 sigma |
| `sigma_tail_event` | `actual_high_temp` outside 2 sigma |
| `max_loss_entry` | Entry price >= 0.80 and trade lost |

These are included in the payload sent to the LLM and stored on the postmortem.

### Structured LLM output

Replace the 1–2 sentence summary with a richer schema:

```typescript
interface PostmortemResult {
  narrative: string;           // 2-3 sentence diagnostic
  forecast_accuracy: "accurate" | "inaccurate" | "unknown";
  model_calibration: "well_calibrated" | "overconfident" | "underconfident" | "polarity_error";
  primary_failure_mode: "forecast_error" | "model_error" | "edge_too_thin" | "tail_risk" | "none";
  suggested_tuning: string;    // specific parameter/rule change suggestion
  reasonCodes: string[];
}
```

### Prompt redesign

The prompt asks diagnostic questions instead of open-ended analysis:

1. Forecast accuracy: How did actual temp compare to forecast?
2. Model calibration: Was the modeled probability reasonable?
3. Market efficiency: Was the market mispricing or was the model wrong?
4. Edge quality: Was edge sufficient given sigma and tail risk?
5. Lesson: What specific change would improve this outcome?

### Model upgrade

Switch from `gpt-4o-mini` to `gpt-4o` for postmortems (batch analysis, ~$0.01/trade at current volume).

### Backward compatibility

`summary` column continues to be populated (from `narrative` field) for the existing UI. The `structured_json` column stores the full enriched result including the new fields and sanity check flags.

---

## Implementation Order

1. DB migration: add `threshold_direction` column
2. `marketMetadata.ts`: extract direction from Kalshi data
3. `probability.ts`: accept and use direction param
4. `run-model/route.ts`: pass direction through
5. Backfill `threshold_direction` on existing market rows
6. `weather/client.ts`: add `fetchActualHighTemperature`
7. `settle-trades/route.ts`: fetch actual temp, pass to payload
8. `postmortemTradePayload.ts`: add actual temp + sanity checks
9. `prompts.ts`: redesigned postmortem prompt
10. `postmortems.ts`: structured output, gpt-4o, enriched fallback
11. Run existing tests, add new ones for polarity + sanity checks
12. Backfill all postmortems via `/api/jobs/backfill-postmortems`
