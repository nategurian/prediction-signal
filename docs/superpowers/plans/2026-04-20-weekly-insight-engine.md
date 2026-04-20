# Weekly Insight Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a weekly cron that aggregates the last 30 days of `trade_postmortems` + `simulated_trades` data, runs one `gpt-4o` synthesis call, stores the result in a new `ai_insights` table, and renders it on a new `/insights` page.

**Architecture:** Pure-SQL aggregator returns typed rollups → orchestrator passes them to a single LLM call with a strict JSON output schema → row written to `ai_insights`. The cron path uses the existing `validateCronSecret` Bearer pattern. The "Generate now" button uses a Next.js server action that calls the orchestrator in-process (no client-side bearer exposure). Pure helpers (bucketing, perf-metric math, reason-code tallying) are factored out for unit testing; the DB-touching wrapper composes them.

**Tech Stack:** TypeScript, Next.js 14 (App Router), Vitest, Supabase (Postgres + `pg_cron`), OpenAI SDK (`gpt-4o`), `react-markdown` (new dep).

**Spec:** [`docs/superpowers/specs/2026-04-20-weekly-insight-engine-design.md`](../specs/2026-04-20-weekly-insight-engine-design.md)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/008_ai_insights_table.sql` | Create | New `ai_insights` table + indexes |
| `supabase/migrations/009_cron_weekly_insights.sql` | Create | Schedule weekly cron job |
| `src/lib/supabase/db.ts` | Modify | Add `AiInsight` type + 3 helper functions |
| `src/lib/ai/insightAggregates.ts` | Create | Pure helpers + `computeInsightAggregates` |
| `src/lib/ai/__tests__/insightAggregates.test.ts` | Create | Unit tests for pure helpers |
| `src/lib/ai/prompts.ts` | Modify | Add `WEEKLY_INSIGHT_PROMPT` |
| `src/lib/ai/weeklyInsights.ts` | Create | Orchestrator: aggregate → LLM → insert |
| `src/lib/ai/__tests__/weeklyInsights.test.ts` | Create | Unit tests with mocked OpenAI + DB |
| `src/app/api/jobs/generate-weekly-insights/route.ts` | Create | Bearer-auth POST handler for cron |
| `src/app/(app)/insights/actions.ts` | Create | Server action for "Generate Now" button |
| `src/app/(app)/insights/page.tsx` | Create | List view, reverse-chrono |
| `src/app/(app)/insights/[id]/page.tsx` | Create | Detail view with markdown render |
| `src/components/insights/InsightCard.tsx` | Create | List item presentation |
| `src/components/insights/GenerateNowButton.tsx` | Create | Client component wrapping server action |
| `src/components/AppShell.tsx` | Modify | Add `/insights` NavLink (desktop + mobile) |
| `package.json` | Modify | Add `react-markdown` dependency |

---

### Task 1: Migration — `ai_insights` table

**Files:**
- Create: `supabase/migrations/008_ai_insights_table.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ai_insights: aggregated AI-generated synthesis rows.
-- `kind` future-proofs for drift_alert and tuning_proposal rows in later specs.
-- `aggregates` stores the exact JSON fed to the LLM for auditability and
-- prompt-regression replays.

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

-- Cron rows are unique per (kind, window). Manual rows can repeat.
CREATE UNIQUE INDEX idx_ai_insights_cron_uniq
  ON ai_insights (kind, window_start, window_end)
  WHERE generated_by = 'cron';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `008_ai_insights_table` and the SQL above, or run `supabase db push` if using the CLI.

Expected: migration succeeds, table appears in `public` schema.

- [ ] **Step 3: Verify the table**

Query via the Supabase MCP:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ai_insights'
ORDER BY ordinal_position;
```

Expected: 15 columns matching the migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_ai_insights_table.sql
git commit -m "feat(db): add ai_insights table for weekly synthesis"
```

---

### Task 2: Add `AiInsight` type and DB helpers

**Files:**
- Modify: `src/lib/supabase/db.ts`

- [ ] **Step 1: Add the `AiInsight` interface**

In `src/lib/supabase/db.ts`, add this interface after the `CityCalibration` interface (around line 144):

```typescript
export interface AiInsight {
  id: string;
  kind: string;
  window_start: string;
  window_end: string;
  sample_size: number;
  narrative: string;
  headline: string;
  state: "improving" | "stable" | "degrading" | "insufficient_data";
  top_failure_modes: Array<{ code: string; count: number; attributed_pnl: number }>;
  top_proposals: Array<{
    param_name: string;
    current_value: string;
    proposed_value: string;
    rationale: string;
    sample_size: number;
    confidence: "low" | "medium" | "high";
  }>;
  tuning_clusters: Array<{ theme: string; frequency: number; example_quotes: string[] }>;
  aggregates: Record<string, unknown>;
  model_version: string;
  prompt_version: string;
  generated_by: "cron" | "manual";
  created_at: string;
}
```

- [ ] **Step 2: Add the three helper functions**

Append at the end of `src/lib/supabase/db.ts`:

```typescript
export async function insertAiInsight(
  row: Omit<AiInsight, "id" | "created_at">
): Promise<{ id: string }> {
  const { data, error } = await db()
    .from("ai_insights")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function listAiInsights(
  kind: string,
  limit = 20
): Promise<AiInsight[]> {
  const { data, error } = await db()
    .from("ai_insights")
    .select("*")
    .eq("kind", kind)
    .order("window_end", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AiInsight[];
}

export async function getAiInsight(id: string): Promise<AiInsight | null> {
  const { data, error } = await db()
    .from("ai_insights")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as AiInsight) ?? null;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/db.ts
git commit -m "feat(db): add AiInsight type and ai_insights helpers"
```

---

### Task 3: Pure helper — `bucketEntryPrice`

**Files:**
- Create: `src/lib/ai/insightAggregates.ts`
- Create: `src/lib/ai/__tests__/insightAggregates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/__tests__/insightAggregates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { bucketEntryPrice } from "../insightAggregates";

describe("bucketEntryPrice", () => {
  it("buckets prices at and below 0.20 as <=20", () => {
    expect(bucketEntryPrice(0.05)).toBe("<=20");
    expect(bucketEntryPrice(0.20)).toBe("<=20");
  });

  it("buckets prices in (0.20, 0.50] as 20-50", () => {
    expect(bucketEntryPrice(0.2001)).toBe("20-50");
    expect(bucketEntryPrice(0.50)).toBe("20-50");
  });

  it("buckets prices in (0.50, 0.80] as 50-80", () => {
    expect(bucketEntryPrice(0.5001)).toBe("50-80");
    expect(bucketEntryPrice(0.80)).toBe("50-80");
  });

  it("buckets prices above 0.80 as >=80", () => {
    expect(bucketEntryPrice(0.8001)).toBe(">=80");
    expect(bucketEntryPrice(0.99)).toBe(">=80");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insightAggregates`
Expected: FAIL with "Cannot find module '../insightAggregates'".

- [ ] **Step 3: Create the file with the helper**

Create `src/lib/ai/insightAggregates.ts`:

```typescript
export type EntryPriceBucket = "<=20" | "20-50" | "50-80" | ">=80";

export function bucketEntryPrice(price: number): EntryPriceBucket {
  if (price <= 0.20) return "<=20";
  if (price <= 0.50) return "20-50";
  if (price <= 0.80) return "50-80";
  return ">=80";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insightAggregates`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/insightAggregates.ts src/lib/ai/__tests__/insightAggregates.test.ts
git commit -m "feat(ai): add bucketEntryPrice helper"
```

---

### Task 4: Pure helper — `computePerfMetrics`

**Files:**
- Modify: `src/lib/ai/insightAggregates.ts`
- Modify: `src/lib/ai/__tests__/insightAggregates.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/lib/ai/__tests__/insightAggregates.test.ts`:

```typescript
import { computePerfMetrics, type TradeForMetrics } from "../insightAggregates";

describe("computePerfMetrics", () => {
  it("returns zeros and nulls when input is empty", () => {
    const m = computePerfMetrics([]);
    expect(m.tradeCount).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.totalPnl).toBe(0);
    expect(m.avgRealizedEdge).toBeNull();
  });

  it("computes win rate, total pnl, and avg edge", () => {
    const trades: TradeForMetrics[] = [
      { realized_pnl: 0.30, realized_edge: 0.10 },
      { realized_pnl: 0.30, realized_edge: 0.15 },
      { realized_pnl: -0.70, realized_edge: 0.05 },
      { realized_pnl: -0.70, realized_edge: 0.20 },
    ];
    const m = computePerfMetrics(trades);
    expect(m.tradeCount).toBe(4);
    expect(m.winRate).toBeCloseTo(0.5, 5);
    expect(m.totalPnl).toBeCloseTo(-0.80, 5);
    expect(m.avgRealizedEdge).toBeCloseTo(0.125, 5);
  });

  it("excludes null pnl from sums but counts the trade", () => {
    const trades: TradeForMetrics[] = [
      { realized_pnl: 0.30, realized_edge: 0.10 },
      { realized_pnl: null, realized_edge: null },
    ];
    const m = computePerfMetrics(trades);
    expect(m.tradeCount).toBe(2);
    expect(m.totalPnl).toBeCloseTo(0.30, 5);
    expect(m.winRate).toBeCloseTo(1.0, 5);
    expect(m.avgRealizedEdge).toBeCloseTo(0.10, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insightAggregates`
Expected: FAIL with "computePerfMetrics is not a function" (or similar).

- [ ] **Step 3: Add the helper**

Append to `src/lib/ai/insightAggregates.ts`:

```typescript
export interface TradeForMetrics {
  realized_pnl: number | null;
  realized_edge: number | null;
}

export interface PerfMetrics {
  tradeCount: number;
  winRate: number | null;
  totalPnl: number;
  avgRealizedEdge: number | null;
}

export function computePerfMetrics(trades: TradeForMetrics[]): PerfMetrics {
  const tradeCount = trades.length;
  if (tradeCount === 0) {
    return { tradeCount: 0, winRate: null, totalPnl: 0, avgRealizedEdge: null };
  }

  const withPnl = trades.filter((t) => t.realized_pnl !== null);
  const wins = withPnl.filter((t) => (t.realized_pnl as number) > 0).length;
  const winRate = withPnl.length > 0 ? wins / withPnl.length : null;
  const totalPnl = withPnl.reduce((s, t) => s + (t.realized_pnl as number), 0);

  const withEdge = trades.filter((t) => t.realized_edge !== null);
  const avgRealizedEdge =
    withEdge.length > 0
      ? withEdge.reduce((s, t) => s + (t.realized_edge as number), 0) / withEdge.length
      : null;

  return { tradeCount, winRate, totalPnl, avgRealizedEdge };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insightAggregates`
Expected: PASS, 7 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/insightAggregates.ts src/lib/ai/__tests__/insightAggregates.test.ts
git commit -m "feat(ai): add computePerfMetrics helper"
```

---

### Task 5: Pure helper — `tallyReasonCodes`

**Files:**
- Modify: `src/lib/ai/insightAggregates.ts`
- Modify: `src/lib/ai/__tests__/insightAggregates.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/lib/ai/__tests__/insightAggregates.test.ts`:

```typescript
import { tallyReasonCodes, type PostmortemForTally } from "../insightAggregates";

describe("tallyReasonCodes", () => {
  it("returns empty array on no postmortems", () => {
    expect(tallyReasonCodes([])).toEqual([]);
  });

  it("counts code frequency and sums attributed pnl losses only", () => {
    const pms: PostmortemForTally[] = [
      { reason_codes: ["polarity_error", "edge_too_thin"], realized_pnl: -0.70 },
      { reason_codes: ["polarity_error"], realized_pnl: -0.50 },
      { reason_codes: ["edge_too_thin"], realized_pnl: 0.30 },
      { reason_codes: ["model_correct_direction"], realized_pnl: 0.30 },
    ];
    const t = tallyReasonCodes(pms);
    const polarity = t.find((x) => x.code === "polarity_error");
    const edge = t.find((x) => x.code === "edge_too_thin");
    expect(polarity).toEqual({
      code: "polarity_error",
      count: 2,
      attributed_pnl: -1.20,
    });
    expect(edge).toEqual({
      code: "edge_too_thin",
      count: 2,
      attributed_pnl: -0.70,
    });
  });

  it("sorts results by attributed_pnl ascending (most negative first)", () => {
    const pms: PostmortemForTally[] = [
      { reason_codes: ["a"], realized_pnl: -0.10 },
      { reason_codes: ["b"], realized_pnl: -0.50 },
      { reason_codes: ["c"], realized_pnl: -0.30 },
    ];
    const t = tallyReasonCodes(pms);
    expect(t.map((x) => x.code)).toEqual(["b", "c", "a"]);
  });

  it("treats null pnl as zero contribution but counts the code", () => {
    const pms: PostmortemForTally[] = [
      { reason_codes: ["x"], realized_pnl: null },
      { reason_codes: ["x"], realized_pnl: -0.20 },
    ];
    const t = tallyReasonCodes(pms);
    expect(t[0]).toEqual({ code: "x", count: 2, attributed_pnl: -0.20 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insightAggregates`
Expected: FAIL with "tallyReasonCodes is not a function".

- [ ] **Step 3: Add the helper**

Append to `src/lib/ai/insightAggregates.ts`:

```typescript
export interface PostmortemForTally {
  reason_codes: string[];
  realized_pnl: number | null;
}

export interface ReasonCodeTally {
  code: string;
  count: number;
  attributed_pnl: number;
}

export function tallyReasonCodes(pms: PostmortemForTally[]): ReasonCodeTally[] {
  const acc = new Map<string, { count: number; pnl: number }>();
  for (const pm of pms) {
    const lossContribution = pm.realized_pnl !== null && pm.realized_pnl < 0 ? pm.realized_pnl : 0;
    for (const code of pm.reason_codes) {
      const cur = acc.get(code) ?? { count: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += lossContribution;
      acc.set(code, cur);
    }
  }
  return Array.from(acc.entries())
    .map(([code, v]) => ({ code, count: v.count, attributed_pnl: v.pnl }))
    .sort((a, b) => a.attributed_pnl - b.attributed_pnl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insightAggregates`
Expected: PASS, 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/insightAggregates.ts src/lib/ai/__tests__/insightAggregates.test.ts
git commit -m "feat(ai): add tallyReasonCodes helper"
```

---

### Task 6: Pure helper — `tallyDistribution`

**Files:**
- Modify: `src/lib/ai/insightAggregates.ts`
- Modify: `src/lib/ai/__tests__/insightAggregates.test.ts`

This helper handles two rollups (failure-mode and sanity-flag distributions), both of which are simple frequency tallies of strings.

- [ ] **Step 1: Add the failing test**

Append to `src/lib/ai/__tests__/insightAggregates.test.ts`:

```typescript
import { tallyDistribution } from "../insightAggregates";

describe("tallyDistribution", () => {
  it("returns empty object for empty input", () => {
    expect(tallyDistribution([])).toEqual({});
  });

  it("counts each value", () => {
    expect(tallyDistribution(["a", "b", "a", "a", "c"])).toEqual({
      a: 3,
      b: 1,
      c: 1,
    });
  });

  it("ignores null and undefined", () => {
    expect(
      tallyDistribution(["a", null, "b", undefined, "a"] as Array<string | null | undefined>)
    ).toEqual({ a: 2, b: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- insightAggregates`
Expected: FAIL with "tallyDistribution is not a function".

- [ ] **Step 3: Add the helper**

Append to `src/lib/ai/insightAggregates.ts`:

```typescript
export function tallyDistribution(
  values: Array<string | null | undefined>
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const v of values) {
    if (v == null) continue;
    acc[v] = (acc[v] ?? 0) + 1;
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- insightAggregates`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/insightAggregates.ts src/lib/ai/__tests__/insightAggregates.test.ts
git commit -m "feat(ai): add tallyDistribution helper"
```

---

### Task 7: Public types and `computeInsightAggregates` (DB-touching)

**Files:**
- Modify: `src/lib/ai/insightAggregates.ts`

This task adds the orchestrating function that does the actual SQL fetches. It is **not** unit-tested directly because all the math lives in the pure helpers from tasks 3–6. We test the orchestrator via the integration test in task 9 (mocked Supabase).

- [ ] **Step 1: Add the public output types**

Append to `src/lib/ai/insightAggregates.ts`:

```typescript
export interface InsightAggregates {
  windowStart: string;
  windowEnd: string;
  sampleSize30d: number;
  sampleSize7d: number;
  global: { window7d: PerfMetrics; window30d: PerfMetrics };
  byContractStyle: Record<"threshold" | "bucket", PerfMetrics>;
  byEntryPriceBucket: Record<EntryPriceBucket, PerfMetrics>;
  bySide: Record<"YES" | "NO", PerfMetrics>;
  reasonCodeFrequencies: ReasonCodeTally[];
  failureModeDistribution: Record<string, number>;
  sanityFlagFrequencies: Record<string, number>;
  suggestedTuningStrings: string[];
}
```

- [ ] **Step 2: Add the fetcher function**

Append to `src/lib/ai/insightAggregates.ts`:

```typescript
import { getSupabaseAdmin } from "@/lib/supabase/server";

const MAX_TUNING_STRINGS = 100;

interface JoinedRow {
  created_at: string;
  reason_codes_json: string[] | null;
  structured_json: Record<string, unknown> | null;
  simulated_trades: {
    side: "YES" | "NO";
    entry_price: number;
    realized_pnl: number | null;
    markets: { market_structure: "binary_threshold" | "bucket_range" } | null;
  } | null;
}

export async function computeInsightAggregates(
  windowEnd: Date
): Promise<InsightAggregates> {
  const db = getSupabaseAdmin();
  const windowEndIso = windowEnd.toISOString();
  const window30dStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const window7dStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await db
    .from("trade_postmortems")
    .select(
      `
      created_at,
      reason_codes_json,
      structured_json,
      simulated_trades (
        side,
        entry_price,
        realized_pnl,
        markets ( market_structure )
      )
    `
    )
    .gte("created_at", window30dStart.toISOString())
    .lte("created_at", windowEndIso);

  if (error) throw error;

  const rows = ((data ?? []) as unknown) as JoinedRow[];
  const all30d = rows.filter((r) => r.simulated_trades !== null);
  const last7d = all30d.filter(
    (r) => new Date(r.created_at) >= window7dStart
  );

  const toMetrics = (subset: JoinedRow[]): TradeForMetrics[] =>
    subset.map((r) => ({
      realized_pnl: r.simulated_trades!.realized_pnl,
      realized_edge: extractRealizedEdge(r),
    }));

  const global = {
    window7d: computePerfMetrics(toMetrics(last7d)),
    window30d: computePerfMetrics(toMetrics(all30d)),
  };

  const byContractStyle: Record<"threshold" | "bucket", PerfMetrics> = {
    threshold: computePerfMetrics(
      toMetrics(
        all30d.filter(
          (r) => r.simulated_trades?.markets?.market_structure === "binary_threshold"
        )
      )
    ),
    bucket: computePerfMetrics(
      toMetrics(
        all30d.filter(
          (r) => r.simulated_trades?.markets?.market_structure === "bucket_range"
        )
      )
    ),
  };

  const buckets: EntryPriceBucket[] = ["<=20", "20-50", "50-80", ">=80"];
  const byEntryPriceBucket = Object.fromEntries(
    buckets.map((b) => [
      b,
      computePerfMetrics(
        toMetrics(
          all30d.filter((r) => bucketEntryPrice(r.simulated_trades!.entry_price) === b)
        )
      ),
    ])
  ) as Record<EntryPriceBucket, PerfMetrics>;

  const bySide: Record<"YES" | "NO", PerfMetrics> = {
    YES: computePerfMetrics(
      toMetrics(all30d.filter((r) => r.simulated_trades!.side === "YES"))
    ),
    NO: computePerfMetrics(
      toMetrics(all30d.filter((r) => r.simulated_trades!.side === "NO"))
    ),
  };

  const reasonCodeFrequencies = tallyReasonCodes(
    all30d.map((r) => ({
      reason_codes: r.reason_codes_json ?? [],
      realized_pnl: r.simulated_trades!.realized_pnl,
    }))
  );

  const failureModeDistribution = tallyDistribution(
    all30d.map((r) => extractLlmField(r, "primary_failure_mode"))
  );

  const sanityFlagFrequencies = tallySanityFlags(all30d);

  const suggestedTuningStrings = all30d
    .map((r) => extractLlmField(r, "suggested_tuning"))
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, MAX_TUNING_STRINGS);

  return {
    windowStart: window30dStart.toISOString(),
    windowEnd: windowEndIso,
    sampleSize30d: all30d.length,
    sampleSize7d: last7d.length,
    global,
    byContractStyle,
    byEntryPriceBucket,
    bySide,
    reasonCodeFrequencies,
    failureModeDistribution,
    sanityFlagFrequencies,
    suggestedTuningStrings,
  };
}

function extractRealizedEdge(row: JoinedRow): number | null {
  const s = row.structured_json;
  if (!s) return null;
  const v = s.trade_edge_yes ?? s.trade_edge_no;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function extractLlmField(row: JoinedRow, key: string): string | null {
  const s = row.structured_json;
  if (!s) return null;
  const llm = s.llm_analysis as Record<string, unknown> | undefined;
  const v = llm?.[key];
  return typeof v === "string" ? v : null;
}

function tallySanityFlags(rows: JoinedRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const flags = (r.structured_json?.sanity_flags as Record<string, unknown> | null) ?? null;
    if (!flags) continue;
    for (const [k, v] of Object.entries(flags)) {
      if (v) acc[k] = (acc[k] ?? 0) + 1;
    }
  }
  return acc;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Re-run all aggregator tests to confirm no regressions**

Run: `npm test -- insightAggregates`
Expected: PASS, 14 tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/insightAggregates.ts
git commit -m "feat(ai): add computeInsightAggregates fetcher"
```

---

### Task 8: Add `WEEKLY_INSIGHT_PROMPT`

**Files:**
- Modify: `src/lib/ai/prompts.ts`

- [ ] **Step 1: Append the prompt constant**

At the end of `src/lib/ai/prompts.ts`, append:

```typescript
export const WEEKLY_INSIGHT_PROMPT = `You are a quantitative analyst reviewing the last 30 days of a prediction-market signal engine focused on weather temperature markets on Kalshi.

You will receive pre-computed aggregates — never raw trades. Your job is to produce ONE weekly synthesis report that helps the engine operator decide what to tune next week.

## Input

The aggregates JSON contains:
- global: 7-day vs 30-day overall performance (tradeCount, winRate, totalPnl, avgRealizedEdge).
- byContractStyle, byEntryPriceBucket, bySide: same metrics sliced.
- reasonCodeFrequencies: top reason codes with count and attributed_pnl (most-negative first).
- failureModeDistribution: counts of primary_failure_mode classifications from per-trade postmortems.
- sanityFlagFrequencies: counts of polarity_mismatch, sigma_tail_event, forecast_inaccurate, etc.
- suggestedTuningStrings: raw natural-language tuning suggestions from the last 30 days of postmortems (you cluster them).

## Analysis instructions

1. Compare the 7-day window to the 30-day baseline. Output state as:
   - "improving" if 7d totalPnl > 30d-period-equivalent and winRate is up,
   - "degrading" if 7d totalPnl is materially worse than baseline,
   - "stable" if neither,
   - "insufficient_data" if sampleSize30d < 20 (be explicit; do not invent conclusions).
2. Identify the top 3 failure modes by attributed PnL loss (NOT by count).
3. For each failure mode, emit ONE concrete parameter-change proposal IF the evidence supports it. If it does not, say so — do not fabricate proposals.
4. Cluster the suggestedTuningStrings into recurring themes. Each theme gets a frequency and up to two short representative quotes.
5. Be honest about low sample sizes. Flag any slice with n < 10 as anecdotal in the narrative.

## Aggregates

{{aggregates}}

## Output schema (strict JSON, no extra fields)

{
  "narrative": "markdown string, 300-500 words, covering: headline, what changed vs baseline, top failure modes, top proposals. This is the human-readable report.",
  "headline": "one sentence summary",
  "state": "improving" | "stable" | "degrading" | "insufficient_data",
  "top_failure_modes": [
    { "code": "string (matches a reason_code or failure_mode label)", "count": integer, "attributed_pnl": number }
  ],
  "top_proposals": [
    {
      "param_name": "string (e.g., MIN_EDGE_NO_HIGH_ENTRY)",
      "current_value": "string (best guess from context, or 'unknown')",
      "proposed_value": "string",
      "rationale": "string (1-2 sentences)",
      "sample_size": integer,
      "confidence": "low" | "medium" | "high"
    }
  ],
  "tuning_clusters": [
    { "theme": "string", "frequency": integer, "example_quotes": ["string", "string"] }
  ]
}

Respond with valid JSON only.`;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat(ai): add WEEKLY_INSIGHT_PROMPT"
```

---

### Task 9: Orchestrator — `weeklyInsights.ts` + tests

**Files:**
- Create: `src/lib/ai/weeklyInsights.ts`
- Create: `src/lib/ai/__tests__/weeklyInsights.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/weeklyInsights.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertAiInsightMock = vi.fn();
const computeInsightAggregatesMock = vi.fn();
const openAiCreateMock = vi.fn();

vi.mock("@/lib/supabase/db", () => ({
  insertAiInsight: (row: unknown) => insertAiInsightMock(row),
}));

vi.mock("../insightAggregates", () => ({
  computeInsightAggregates: (d: Date) => computeInsightAggregatesMock(d),
}));

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: (args: unknown) => openAiCreateMock(args),
      },
    };
  },
}));

import { generateWeeklyInsight } from "../weeklyInsights";

const baseAggregates = {
  windowStart: "2026-03-21T00:00:00.000Z",
  windowEnd: "2026-04-20T00:00:00.000Z",
  sampleSize30d: 0,
  sampleSize7d: 0,
  global: { window7d: {}, window30d: {} },
  byContractStyle: {},
  byEntryPriceBucket: {},
  bySide: {},
  reasonCodeFrequencies: [],
  failureModeDistribution: {},
  sanityFlagFrequencies: {},
  suggestedTuningStrings: [],
};

beforeEach(() => {
  insertAiInsightMock.mockReset();
  computeInsightAggregatesMock.mockReset();
  openAiCreateMock.mockReset();
  insertAiInsightMock.mockResolvedValue({ id: "row-id" });
});

describe("generateWeeklyInsight", () => {
  it("short-circuits to insufficient_data when sampleSize30d is 0", async () => {
    computeInsightAggregatesMock.mockResolvedValue({ ...baseAggregates });

    const res = await generateWeeklyInsight({ generatedBy: "manual" });

    expect(openAiCreateMock).not.toHaveBeenCalled();
    expect(insertAiInsightMock).toHaveBeenCalledTimes(1);
    const inserted = insertAiInsightMock.mock.calls[0][0];
    expect(inserted.state).toBe("insufficient_data");
    expect(inserted.kind).toBe("weekly_report");
    expect(inserted.generated_by).toBe("manual");
    expect("id" in res).toBe(true);
  });

  it("calls OpenAI and inserts the parsed result on success", async () => {
    computeInsightAggregatesMock.mockResolvedValue({
      ...baseAggregates,
      sampleSize30d: 80,
      sampleSize7d: 20,
    });
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              narrative: "## Weekly summary\n\nThings.",
              headline: "Stable week",
              state: "stable",
              top_failure_modes: [{ code: "edge_too_thin", count: 5, attributed_pnl: -1.5 }],
              top_proposals: [],
              tuning_clusters: [],
            }),
          },
        },
      ],
    });

    const res = await generateWeeklyInsight({ generatedBy: "cron" });

    expect(openAiCreateMock).toHaveBeenCalledTimes(1);
    expect(insertAiInsightMock).toHaveBeenCalledTimes(1);
    const inserted = insertAiInsightMock.mock.calls[0][0];
    expect(inserted.state).toBe("stable");
    expect(inserted.headline).toBe("Stable week");
    expect(inserted.model_version).toBe("gpt-4o");
    expect(inserted.prompt_version).toBe("weekly_v1");
    expect(inserted.generated_by).toBe("cron");
    expect("id" in res).toBe(true);
  });

  it("returns an error and inserts nothing when LLM call throws", async () => {
    computeInsightAggregatesMock.mockResolvedValue({
      ...baseAggregates,
      sampleSize30d: 80,
    });
    openAiCreateMock.mockRejectedValue(new Error("boom"));

    const res = await generateWeeklyInsight({ generatedBy: "manual" });

    expect(insertAiInsightMock).not.toHaveBeenCalled();
    expect("error" in res).toBe(true);
  });

  it("returns an error and inserts nothing when LLM response is unparseable", async () => {
    computeInsightAggregatesMock.mockResolvedValue({
      ...baseAggregates,
      sampleSize30d: 80,
    });
    openAiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "not json at all" } }],
    });

    const res = await generateWeeklyInsight({ generatedBy: "manual" });

    expect(insertAiInsightMock).not.toHaveBeenCalled();
    expect("error" in res).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- weeklyInsights`
Expected: FAIL with "Cannot find module '../weeklyInsights'".

- [ ] **Step 3: Create the orchestrator**

Create `src/lib/ai/weeklyInsights.ts`:

```typescript
import OpenAI from "openai";
import { computeInsightAggregates, type InsightAggregates } from "./insightAggregates";
import { WEEKLY_INSIGHT_PROMPT } from "./prompts";
import { insertAiInsight, type AiInsight } from "@/lib/supabase/db";

const MODEL_VERSION = "gpt-4o";
const PROMPT_VERSION = "weekly_v1";
const MIN_SAMPLE_SIZE = 20;

export interface GenerateWeeklyInsightOptions {
  windowEnd?: Date;
  generatedBy: "cron" | "manual";
}

export type GenerateWeeklyInsightResult = { id: string } | { error: string };

interface LlmOutput {
  narrative: string;
  headline: string;
  state: AiInsight["state"];
  top_failure_modes: AiInsight["top_failure_modes"];
  top_proposals: AiInsight["top_proposals"];
  tuning_clusters: AiInsight["tuning_clusters"];
}

export async function generateWeeklyInsight(
  opts: GenerateWeeklyInsightOptions
): Promise<GenerateWeeklyInsightResult> {
  const windowEnd = opts.windowEnd ?? new Date();
  const aggregates = await computeInsightAggregates(windowEnd);

  if (aggregates.sampleSize30d < MIN_SAMPLE_SIZE) {
    return insertInsufficientDataRow(aggregates, opts.generatedBy);
  }

  let parsed: LlmOutput;
  try {
    parsed = await callLlm(aggregates);
  } catch (err) {
    console.error("generateWeeklyInsight LLM error:", err);
    return { error: err instanceof Error ? err.message : "llm_call_failed" };
  }

  try {
    const { id } = await insertAiInsight({
      kind: "weekly_report",
      window_start: aggregates.windowStart,
      window_end: aggregates.windowEnd,
      sample_size: aggregates.sampleSize30d,
      narrative: parsed.narrative,
      headline: parsed.headline,
      state: parsed.state,
      top_failure_modes: parsed.top_failure_modes,
      top_proposals: parsed.top_proposals,
      tuning_clusters: parsed.tuning_clusters,
      aggregates: aggregates as unknown as Record<string, unknown>,
      model_version: MODEL_VERSION,
      prompt_version: PROMPT_VERSION,
      generated_by: opts.generatedBy,
    });
    return { id };
  } catch (err) {
    // Cron path may hit unique-index conflict if a row already exists for this
    // (kind, window_start, window_end). Treat as no-op.
    if (opts.generatedBy === "cron" && isUniqueViolation(err)) {
      return { error: "already_generated_for_window" };
    }
    console.error("generateWeeklyInsight insert error:", err);
    return { error: err instanceof Error ? err.message : "insert_failed" };
  }
}

async function callLlm(aggregates: InsightAggregates): Promise<LlmOutput> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = WEEKLY_INSIGHT_PROMPT.replace(
    "{{aggregates}}",
    JSON.stringify(aggregates, null, 2)
  );

  const completion = await client.chat.completions.create({
    model: MODEL_VERSION,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 800,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("empty_llm_response");

  const json = JSON.parse(content) as Partial<LlmOutput>;
  if (
    typeof json.narrative !== "string" ||
    typeof json.headline !== "string" ||
    typeof json.state !== "string"
  ) {
    throw new Error("invalid_llm_response_shape");
  }
  return {
    narrative: json.narrative,
    headline: json.headline,
    state: json.state as AiInsight["state"],
    top_failure_modes: Array.isArray(json.top_failure_modes) ? json.top_failure_modes : [],
    top_proposals: Array.isArray(json.top_proposals) ? json.top_proposals : [],
    tuning_clusters: Array.isArray(json.tuning_clusters) ? json.tuning_clusters : [],
  };
}

async function insertInsufficientDataRow(
  aggregates: InsightAggregates,
  generatedBy: "cron" | "manual"
): Promise<GenerateWeeklyInsightResult> {
  try {
    const { id } = await insertAiInsight({
      kind: "weekly_report",
      window_start: aggregates.windowStart,
      window_end: aggregates.windowEnd,
      sample_size: aggregates.sampleSize30d,
      narrative:
        "## Insufficient data\n\nFewer than 20 settled trades in the last 30 days. No conclusions drawn.",
      headline: "Insufficient data this week",
      state: "insufficient_data",
      top_failure_modes: [],
      top_proposals: [],
      tuning_clusters: [],
      aggregates: aggregates as unknown as Record<string, unknown>,
      model_version: MODEL_VERSION,
      prompt_version: PROMPT_VERSION,
      generated_by: generatedBy,
    });
    return { id };
  } catch (err) {
    if (generatedBy === "cron" && isUniqueViolation(err)) {
      return { error: "already_generated_for_window" };
    }
    return { error: err instanceof Error ? err.message : "insert_failed" };
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- weeklyInsights`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/weeklyInsights.ts src/lib/ai/__tests__/weeklyInsights.test.ts
git commit -m "feat(ai): add weeklyInsights orchestrator"
```

---

### Task 10: API route for cron

**Files:**
- Create: `src/app/api/jobs/generate-weekly-insights/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/jobs/generate-weekly-insights/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { generateWeeklyInsight } from "@/lib/ai/weeklyInsights";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const result = await generateWeeklyInsight({ generatedBy: "cron" });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    console.error("generate-weekly-insights route error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test the unauthenticated path**

Start dev server: `npm run dev` (in a separate terminal).
In another terminal:

```bash
curl -i -X POST http://localhost:3000/api/jobs/generate-weekly-insights
```

Expected: HTTP 401 with `{"error":"Unauthorized"}`. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/jobs/generate-weekly-insights/route.ts
git commit -m "feat(api): add generate-weekly-insights cron route"
```

---

### Task 11: Add `react-markdown` dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install react-markdown@^9`
Expected: package added to dependencies, lock file updated.

- [ ] **Step 2: Verify**

Run: `npm ls react-markdown`
Expected: shows version in the 9.x range.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add react-markdown for insights rendering"
```

---

### Task 12: Server action for "Generate Now"

**Files:**
- Create: `src/app/(app)/insights/actions.ts`

- [ ] **Step 1: Create the action**

Create `src/app/(app)/insights/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { generateWeeklyInsight } from "@/lib/ai/weeklyInsights";

export async function generateNowAction(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const result = await generateWeeklyInsight({ generatedBy: "manual" });
  if ("error" in result) {
    return { ok: false, error: result.error };
  }
  revalidatePath("/insights");
  return { ok: true, id: result.id };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/insights/actions.ts"
git commit -m "feat(insights): add generateNowAction server action"
```

---

### Task 13: `InsightCard` component

**Files:**
- Create: `src/components/insights/InsightCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/insights/InsightCard.tsx`:

```typescript
import Link from "next/link";
import type { AiInsight } from "@/lib/supabase/db";

const STATE_BADGE: Record<AiInsight["state"], string> = {
  improving: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  stable: "bg-zinc-800 text-zinc-300 border-zinc-700",
  degrading: "bg-rose-900/40 text-rose-300 border-rose-700",
  insufficient_data: "bg-amber-900/40 text-amber-300 border-amber-700",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function InsightCard({ insight }: { insight: AiInsight }) {
  return (
    <Link
      href={`/insights/${insight.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs text-zinc-500">
            {fmtDate(insight.window_start)} → {fmtDate(insight.window_end)} · n=
            {insight.sample_size} · {insight.generated_by}
          </div>
          <h3 className="mt-1 text-base font-semibold text-white">
            {insight.headline}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATE_BADGE[insight.state]}`}
        >
          {insight.state}
        </span>
      </div>

      {insight.top_proposals.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {insight.top_proposals.slice(0, 2).map((p, i) => (
            <li key={i}>
              <span className="text-zinc-300">{p.param_name}</span>:{" "}
              {p.current_value} → {p.proposed_value}
              <span className="ml-2 text-xs text-zinc-500">({p.confidence})</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/insights/InsightCard.tsx
git commit -m "feat(insights): add InsightCard component"
```

---

### Task 14: `GenerateNowButton` client component

**Files:**
- Create: `src/components/insights/GenerateNowButton.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/insights/GenerateNowButton.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { generateNowAction } from "@/app/(app)/insights/actions";

export function GenerateNowButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const onClick = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await generateNowAction();
      if (res.ok) {
        setMessage({ kind: "ok", text: "Report generated." });
      } else {
        setMessage({ kind: "err", text: `Failed: ${res.error}` });
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Generating…" : "Generate now"}
      </button>
      {message && (
        <span
          className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-rose-400"}`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/insights/GenerateNowButton.tsx
git commit -m "feat(insights): add GenerateNowButton client component"
```

---

### Task 15: `/insights` list page

**Files:**
- Create: `src/app/(app)/insights/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(app)/insights/page.tsx`:

```typescript
import { listAiInsights } from "@/lib/supabase/db";
import { InsightCard } from "@/components/insights/InsightCard";
import { GenerateNowButton } from "@/components/insights/GenerateNowButton";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const insights = await listAiInsights("weekly_report", 20);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Insights</h1>
          <p className="text-sm text-zinc-500">
            AI synthesis of the last 30 days of postmortems and trades.
          </p>
        </div>
        <GenerateNowButton />
      </div>

      {insights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-zinc-500">
          No reports yet. Click &ldquo;Generate now&rdquo; or wait for the Monday
          09:00 UTC cron.
        </div>
      ) : (
        <ul className="space-y-3">
          {insights.map((i) => (
            <li key={i.id}>
              <InsightCard insight={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/insights/page.tsx"
git commit -m "feat(insights): add /insights list page"
```

---

### Task 16: `/insights/[id]` detail page

**Files:**
- Create: `src/app/(app)/insights/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `src/app/(app)/insights/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getAiInsight, type AiInsight } from "@/lib/supabase/db";

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<AiInsight["state"], string> = {
  improving: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  stable: "bg-zinc-800 text-zinc-300 border-zinc-700",
  degrading: "bg-rose-900/40 text-rose-300 border-rose-700",
  insufficient_data: "bg-amber-900/40 text-amber-300 border-amber-700",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function InsightDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const insight = await getAiInsight(params.id);
  if (!insight) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/insights"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← All reports
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>
            {fmt(insight.window_start)} → {fmt(insight.window_end)}
          </span>
          <span>·</span>
          <span>n={insight.sample_size}</span>
          <span>·</span>
          <span>{insight.generated_by}</span>
          <span>·</span>
          <span>{insight.prompt_version}</span>
        </div>
        <h1 className="text-2xl font-bold text-white">{insight.headline}</h1>
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATE_BADGE[insight.state]}`}
        >
          {insight.state}
        </span>
      </header>

      <article className="prose prose-invert max-w-none">
        <ReactMarkdown>{insight.narrative}</ReactMarkdown>
      </article>

      <Section title="Top failure modes">
        {insight.top_failure_modes.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {insight.top_failure_modes.map((f, i) => (
              <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="font-mono text-zinc-300">{f.code}</div>
                <div className="text-xs text-zinc-500">
                  count={f.count} · attributed_pnl={f.attributed_pnl.toFixed(2)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Top proposals">
        {insight.top_proposals.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {insight.top_proposals.map((p, i) => (
              <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="font-mono text-zinc-300">{p.param_name}</div>
                <div className="text-xs text-zinc-500">
                  {p.current_value} → {p.proposed_value} · {p.confidence} (n={p.sample_size})
                </div>
                <div className="mt-1 text-zinc-400">{p.rationale}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tuning clusters">
        {insight.tuning_clusters.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {insight.tuning_clusters.map((c, i) => (
              <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="text-zinc-300">{c.theme}</div>
                <div className="text-xs text-zinc-500">frequency={c.frequency}</div>
                <ul className="mt-1 list-disc pl-5 text-xs text-zinc-400">
                  {c.example_quotes.map((q, j) => (
                    <li key={j}>&ldquo;{q}&rdquo;</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <details className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs">
        <summary className="cursor-pointer text-zinc-400">Raw aggregates</summary>
        <pre className="mt-2 overflow-x-auto text-zinc-500">
          {JSON.stringify(insight.aggregates, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty() {
  return <div className="text-xs text-zinc-600">none</div>;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/insights/[id]/page.tsx"
git commit -m "feat(insights): add detail page with markdown render"
```

---

### Task 17: Add `/insights` to `AppShell` nav

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Add the desktop NavLink**

In `src/components/AppShell.tsx`, find the desktop sidebar nav block and add `<NavLink href="/insights">Insights</NavLink>` immediately after the `Models` NavLink (around line 107):

```typescript
        <NavLink href="/opportunities">Opportunities</NavLink>
        <NavLink href="/trades">Trades</NavLink>
        <NavLink href="/performance">Performance</NavLink>
        <NavLink href="/models">Models</NavLink>
        <NavLink href="/insights">Insights</NavLink>
```

- [ ] **Step 2: Add the mobile NavLink**

In the same file, find the mobile-nav block and add the corresponding entry after the `Models` mobile NavLink (around line 132):

```typescript
            <NavLink href="/models" onNavigate={closeNav}>
              Models
            </NavLink>
            <NavLink href="/insights" onNavigate={closeNav}>
              Insights
            </NavLink>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(insights): add /insights link to app nav"
```

---

### Task 18: Cron migration

**Files:**
- Create: `supabase/migrations/009_cron_weekly_insights.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/009_cron_weekly_insights.sql`. Replace the bearer token placeholder with the actual `ETL_CRON_SECRET` value before applying (matches the convention in `007_cron_recalibrate_sigma.sql`):

```sql
-- Schedule the weekly insight engine.
-- Runs every Monday at 09:00 UTC.
--
-- Replace the bearer token with the production ETL_CRON_SECRET before applying.

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
        'Authorization', 'Bearer <REPLACE_WITH_ETL_CRON_SECRET>'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/generate-weekly-insights')
);
```

- [ ] **Step 2: Apply the migration**

Replace `<REPLACE_WITH_ETL_CRON_SECRET>` in the file with the production secret value, then apply via the Supabase MCP `apply_migration` tool with name `009_cron_weekly_insights`. After applying, restore the placeholder in the file so the secret is not committed.

- [ ] **Step 3: Verify the job is scheduled**

Query via the Supabase MCP:

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname = 'generate_weekly_insights';
```

Expected: one row with schedule `0 9 * * 1`.

- [ ] **Step 4: Commit (with placeholder, not the real secret)**

```bash
git add supabase/migrations/009_cron_weekly_insights.sql
git commit -m "feat(cron): schedule weekly insight engine"
```

---

### Task 19: End-to-end smoke test

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Visit `/insights`**

Open `http://localhost:3000/insights` in a browser.

Expected: page loads with header, "Generate now" button, and either an empty state or any existing rows.

- [ ] **Step 3: Click "Generate now"**

Click the button.

Expected: button shows "Generating…", then "Report generated." appears in green and a new card shows up in the list within a few seconds. (If `OPENAI_API_KEY` is unset or the trade volume is < 20, expect an `insufficient_data` row instead — still success.)

- [ ] **Step 4: Click into the new report**

Click the new card.

Expected: detail page renders with headline, state badge, markdown narrative, structured sections, and a collapsible "Raw aggregates" block.

- [ ] **Step 5: Verify the row in the database**

Query via the Supabase MCP:

```sql
SELECT id, kind, state, sample_size, generated_by, created_at
FROM ai_insights
ORDER BY created_at DESC
LIMIT 3;
```

Expected: the most recent row has `kind='weekly_report'`, `generated_by='manual'`, sensible `sample_size`, and a non-null `created_at`.

- [ ] **Step 6: Stop the dev server**

No commit for this task.

---

## Verification checklist (run before marking the plan complete)

- [ ] `npm test` passes (all existing + 14 new aggregator tests + 4 new orchestrator tests = +18 tests)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `/insights` page renders, "Generate now" produces a row, detail page renders that row
- [ ] `cron.job` table contains the `generate_weekly_insights` schedule
- [ ] All 18 implementation tasks committed
