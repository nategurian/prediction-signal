# Weekly Insight Engine

## Problem

The signal engine already generates per-trade postmortems and per-signal explanations via LLM, but every call sees exactly one row. Reason codes like `polarity_error`, `expensive_no_leg_tail_loss`, and `edge_too_thin` accumulate in `trade_postmortems.reason_codes_json` without ever being aggregated. `structured_json.llm_analysis.suggested_tuning` strings — concrete parameter-change proposals — are written once per trade, read by a human clicking a trade page, and never cross-referenced. The per-trade AI output is forensic; there is no layer that says "here are the top three recurring failure modes this month, here is which parameter to tune first, here is the expected PnL impact."

This forces the user to come to the AI and say "check the data" instead of the AI surfacing patterns automatically. This spec builds the foundation layer that turns the existing postmortem data into weekly synthesis, and is designed so a downstream Self-Tuning layer (separate future spec) can consume its structured output directly.

## Solution

A weekly cron job generates one row in a new `ai_insights` table. The row contains both a markdown narrative (for human reading on an `/insights` page) and typed structured fields (for future machine consumption). The LLM sees aggregated rollups — never raw trades — so input token cost is bounded regardless of volume.

## Scope

Changes across five layers, one new table:

1. New `ai_insights` table with a `kind` column that future-proofs for drift alerts and tuning proposals.
2. Pure-SQL aggregation functions computing eight rollups over a 30-day window with a 7-day sub-window.
3. Orchestration module that calls the aggregator, invokes one `gpt-4o` completion, and inserts the row.
4. New API route `/api/jobs/generate-weekly-insights`, authenticated via the existing `validateCronSecret`.
5. New `/insights` page and detail route under the existing `(app)` route group.
6. New `pg_cron` migration scheduling the job for Monday 09:00 UTC.

Non-goals (deferred): email or Slack delivery, per-city slicing, automatic application of any tuning proposals, public-facing reports.

---

## 1. Database — `ai_insights` table

New migration `supabase/migrations/008_ai_insights_table.sql`:

```sql
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_size INTEGER NOT NULL,
  narrative TEXT NOT NULL,
  headline TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('improving','stable','degrading','insufficient_data')),
  top_failure_modes JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  tuning_clusters JSONB NOT NULL DEFAULT '[]'::jsonb,
  aggregates JSONB NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generated_by TEXT NOT NULL CHECK (generated_by IN ('cron','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_insights_kind_window ON ai_insights (kind, window_end DESC);

CREATE UNIQUE INDEX idx_ai_insights_cron_uniq
  ON ai_insights (kind, window_start, window_end)
  WHERE generated_by = 'cron';
```

**Rationale for key columns:**

- `kind` accepts `'weekly_report'` now. Future kinds (`'drift_alert'`, `'tuning_proposal'`) reuse the same table without migration.
- `aggregates` stores the exact JSON fed to the LLM. This enables prompt-regression testing and lets us re-score old windows against an improved prompt.
- `top_proposals` is shaped for machine consumption. The future Self-Tuning layer reads this column directly; no English parsing.
- The partial unique index only applies to cron-generated rows, so the "Generate now" button can always produce a fresh row for the same window.

## 2. Aggregator — `src/lib/ai/insightAggregates.ts`

New file exporting one public function and a typed result interface.

**Public API:**

```ts
export interface InsightAggregates {
  windowStart: string;         // ISO
  windowEnd: string;           // ISO
  sampleSize30d: number;
  sampleSize7d: number;
  global: { window7d: PerfMetrics; window30d: PerfMetrics };
  byContractStyle: Record<'threshold' | 'bucket', PerfMetrics>;
  byEntryPriceBucket: Record<'<=20' | '20-50' | '50-80' | '>=80', PerfMetrics>;
  bySide: Record<'YES' | 'NO', PerfMetrics>;
  reasonCodeFrequencies: Array<{ code: string; count: number; attributedPnl: number }>;
  failureModeDistribution: Record<string, number>;
  sanityFlagFrequencies: Record<string, number>;
  suggestedTuningStrings: string[];  // raw, LLM clusters them
}

export interface PerfMetrics {
  tradeCount: number;
  winRate: number | null;
  totalPnl: number;
  avgRealizedEdge: number | null;
}

export async function computeInsightAggregates(
  windowEnd: Date
): Promise<InsightAggregates>;
```

**Implementation notes:**

- Single Supabase client (server-side service role) executes the queries in parallel where safe.
- Window boundaries: `window_end = windowEnd`, `window_start_30d = windowEnd - 30d`, `window_start_7d = windowEnd - 7d`. The window is filtered on `trade_postmortems.created_at` (a postmortem row exists only after settlement, so this is equivalent to "settled in window"). This matches the pattern used by `src/app/api/jobs/recalibrate-sigma/route.ts`. There is no `settled_at` column on `simulated_trades`.
- Trades are joined to postmortems by `simulated_trade_id`. The aggregator's "trade universe" is `trade_postmortems IN window` JOIN `simulated_trades`.
- PnL source: `simulated_trades.realized_pnl` (nullable; nulls excluded from PnL sums but counted in `tradeCount`).
- Entry price bucketing happens in SQL (`CASE WHEN entry_price <= 0.20 THEN ... END`).
- `reasonCodeFrequencies` is computed from `trade_postmortems.reason_codes_json` (JSONB array) joined to `simulated_trades` for `realized_pnl` attribution; losses only contribute negative PnL.
- `suggestedTuningStrings` pulled from `trade_postmortems.structured_json -> 'llm_analysis' -> 'suggested_tuning'`, nulls filtered, capped at 100 strings to bound prompt size.
- No LLM calls in this file; pure SQL + typed reshaping.

## 3. Orchestrator — `src/lib/ai/weeklyInsights.ts`

New file exporting the top-level generator.

**Public API:**

```ts
export interface GenerateWeeklyInsightOptions {
  windowEnd?: Date;              // defaults to now()
  generatedBy: 'cron' | 'manual';
}

export async function generateWeeklyInsight(
  opts: GenerateWeeklyInsightOptions
): Promise<{ id: string } | { error: string }>;
```

**Flow:**

1. Call `computeInsightAggregates(windowEnd)`.
2. If `sampleSize30d === 0`, insert a degenerate row with `state='insufficient_data'`, a stub narrative, and return. Do not call the LLM.
3. Otherwise, build the user-message JSON payload from aggregates (omit empty arrays to save tokens).
4. Call `openai.chat.completions.create` with `model: 'gpt-4o'`, `response_format: { type: 'json_object' }`, `temperature: 0.3`, `max_tokens: 800`.
5. Parse the response against the expected schema. On parse failure or API error: log, return `{ error }`, do not insert.
6. On success, call `insertAiInsight` with the full row including `aggregates`, `model_version: 'gpt-4o'`, `prompt_version: 'weekly_v1'`, and the caller's `generated_by`.
7. Cron path handles the unique-index violation by treating it as a no-op (log "already generated for this window") so retries are safe.

## 4. Prompt — addition to `src/lib/ai/prompts.ts`

New exported constant `WEEKLY_INSIGHT_PROMPT`. The prompt is a single string with one `{{aggregates}}` placeholder. Output schema is strictly enforced.

**Prompt structure:**

```
You are a quantitative analyst reviewing the last 30 days of a prediction-market
signal engine focused on weather temperature markets on Kalshi.

You will receive pre-computed aggregates — never raw trades. Your job is to
produce ONE weekly synthesis report that helps the engine operator decide what
to tune next week.

## Input
{{aggregates}}

## Analysis instructions

1. Compare the 7-day window to the 30-day baseline. Is overall performance
   improving, stable, or degrading? If sample size < 20 over 30 days, output
   `insufficient_data` and be explicit that conclusions are anecdotal.
2. Identify the top 3 failure modes by attributed PnL loss (not by count).
3. For each failure mode, emit ONE concrete parameter-change proposal if the
   evidence supports it. If it does not, say so — do not fabricate.
4. Cluster the `suggestedTuningStrings` into recurring themes. Give each theme
   a frequency and two representative quotes.
5. Be honest about low sample sizes. Flag any slice with n < 10 as anecdotal.

## Output schema (strict JSON)
{
  "narrative": "markdown, 300-500 words, covers headline, what changed, failure
                modes, and proposals — the human-readable report",
  "headline": "one sentence",
  "state": "improving" | "stable" | "degrading" | "insufficient_data",
  "top_failure_modes": [
    { "code": string, "count": integer, "attributed_pnl": number }
  ],
  "top_proposals": [
    {
      "param_name": string,
      "current_value": string,
      "proposed_value": string,
      "rationale": string,
      "sample_size": integer,
      "confidence": "low" | "medium" | "high"
    }
  ],
  "tuning_clusters": [
    { "theme": string, "frequency": integer, "example_quotes": string[] }
  ]
}

Respond with valid JSON only.
```

Prompt version string: `'weekly_v1'`. Any future edit bumps this.

## 5. DB helpers — edits to `src/lib/supabase/db.ts`

Add three functions and one type:

- `export interface AiInsight { ... }` matching the table columns.
- `insertAiInsight(row: Omit<AiInsight, 'id' | 'created_at'>): Promise<{ id: string }>`
- `listAiInsights(kind: string, limit?: number): Promise<AiInsight[]>`
- `getAiInsight(id: string): Promise<AiInsight | null>`

## 6. API route — `src/app/api/jobs/generate-weekly-insights/route.ts`

Thin handler:

```ts
export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const generatedBy = body?.generatedBy === 'manual' ? 'manual' : 'cron';

  const result = await generateWeeklyInsight({ generatedBy });
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 200 });
}
```

The manual "Generate now" button does **not** call this route directly, because doing so from the client would require exposing the bearer token. Instead the button invokes a Next.js server action (see section 7), which calls `generateWeeklyInsight` in-process. This route exists only for the `pg_cron` HTTP path.

## 7. UI — `/insights` page

New route group entries:

**`src/app/(app)/insights/page.tsx`** (server component):

- Calls `listAiInsights('weekly_report', 20)`.
- Renders a vertical list of `<InsightCard>` components, newest first.
- Top of page: `<GenerateNowButton>` client component.

**`src/app/(app)/insights/[id]/page.tsx`** (server component):

- Calls `getAiInsight(params.id)`.
- 404s if not found.
- Renders: headline, window range, sample size, state badge, the narrative rendered as markdown, and collapsible sections for `top_failure_modes`, `top_proposals`, `tuning_clusters`, `aggregates` (raw JSON at the bottom for auditing).

**`src/components/insights/InsightCard.tsx`**:

- Shows headline, date range, sample size, state badge, and the top 2 proposals inline.
- Links to the detail page.

**`src/components/insights/GenerateNowButton.tsx`** (client):

- Calls a Next.js server action `generateNowAction()` which runs server-side, invokes `generateWeeklyInsight({ generatedBy: 'manual' })` directly (no HTTP round-trip, no bearer token exposure), then `revalidatePath('/insights')`.
- Shows a loading state; shows a toast on success or error.

Markdown rendering adds `react-markdown` as a new runtime dependency (the project currently has no markdown library). The implementation plan pins the version.

## 8. Cron migration — `supabase/migrations/009_cron_weekly_insights.sql`

Follows the exact pattern of `007_cron_recalibrate_sigma.sql`:

```sql
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'generate_weekly_insights';

SELECT cron.schedule(
  'generate_weekly_insights',
  '0 9 * * 1',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <replace-with-ETL_CRON_SECRET-value>'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/generate-weekly-insights')
);
```

Schedule: `0 9 * * 1` (09:00 UTC every Monday).

## 9. Guardrails

- **Low sample size:** if `sampleSize30d < 20`, still generate the row but set `state='insufficient_data'` and the prompt is explicitly told to be conservative. The row still renders on the page so the user knows "nothing actionable this week" is a real state, not a missing cron run.
- **LLM failure:** caught in the orchestrator, logged, returns `{ error }`. No partial row inserted. Cron retries next week; on-demand shows a toast.
- **Token budget:** input hard-capped at 4000 tokens. Truncation order if exceeded: `tuning_clusters` example text first, then rarest reason codes, then sanity flags. Core performance metrics (global + contract_style + entry_price_bucket) are never truncated.
- **Idempotency:** unique index prevents duplicate cron rows for the same window. Manual rows are exempt so regeneration is always possible.
- **Auth:** API route is bearer-protected via the existing `validateCronSecret`. The UI-triggered manual path uses a server action and never exposes the secret to the client.

## 10. Testing

- `insightAggregates.test.ts`: seed a test DB with fixture trades and postmortems; assert each rollup computes the expected values. Tests edge-price bucketing boundaries explicitly (`0.20` goes to `'<=20'`, `0.2001` goes to `'20-50'`).
- `weeklyInsights.test.ts`: mock OpenAI client; feed a canned aggregate input; assert the row is inserted with the expected shape, `prompt_version`, and `model_version`. Test the `sampleSize30d === 0` short-circuit path. Test LLM-failure path inserts nothing.
- No prompt-quality tests. Prompt regression is handled by bumping `prompt_version` and re-running offline against stored `aggregates` JSON.

## 11. Files touched

```
supabase/migrations/008_ai_insights_table.sql          (new)
supabase/migrations/009_cron_weekly_insights.sql       (new)
src/lib/ai/insightAggregates.ts                        (new)
src/lib/ai/weeklyInsights.ts                           (new)
src/lib/ai/prompts.ts                                  (edit: add WEEKLY_INSIGHT_PROMPT)
src/lib/supabase/db.ts                                 (edit: add ai_insights helpers + type)
src/app/api/jobs/generate-weekly-insights/route.ts     (new)
src/app/(app)/insights/page.tsx                        (new)
src/app/(app)/insights/[id]/page.tsx                   (new)
src/app/(app)/insights/actions.ts                      (new: server action for Generate Now)
src/components/insights/InsightCard.tsx                (new)
src/components/insights/GenerateNowButton.tsx          (new)
src/lib/ai/__tests__/insightAggregates.test.ts         (new)
src/lib/ai/__tests__/weeklyInsights.test.ts            (new)
```

## 12. Downstream consumers (not in this spec)

- Drift & Regime Monitor (roadmap #2): will read `aggregates` across rows to detect week-over-week shifts, write its own `kind='drift_alert'` rows.
- Self-Tuning Proposer (roadmap #3): will read `top_proposals` from the latest `weekly_report` rows, cluster by `param_name`, and write `kind='tuning_proposal'` rows the user approves from the UI. The decision to auto-apply versus require approval is defined in that future spec — this spec makes no assumption about it beyond shaping `top_proposals` to support either path.
