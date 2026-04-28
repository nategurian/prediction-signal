#!/usr/bin/env node
/**
 * v1 counterfactual replay.
 *
 * Re-runs v1 signal-engine logic against preserved snapshots and settles the
 * resulting trades against actual weather outcomes. Lets us answer
 * "would v1 have been green in this period?" without touching production.
 *
 * v1 logic (commit 4245489, ran Apr 6 - Apr 15):
 *   - Static sigma = 2.5 for everything
 *   - P(YES) for binary = P(high > threshold)  (no threshold_direction support)
 *   - Gates: minTradeEdge 0.05, minConfidenceScore 0.6, maxSpread 0.06,
 *            slippage 0.01, uncertainty 0.02, maxMinutes 180
 *   - No fees, no max NO price, no bucket-YES block
 *
 * Outputs a markdown report to stdout + writes per-trade CSV to
 * tmp/v1-replay-<periodStart>-<periodEnd>.csv
 *
 * Usage:
 *   node scripts/v1-replay.mjs                     # Apr 15 - today
 *   node scripts/v1-replay.mjs --from 2026-04-07 --to 2026-04-14   # fidelity check
 *   node scripts/v1-replay.mjs --cities nyc         # NYC only (strict v1)
 *   node scripts/v1-replay.mjs --cities nyc,miami   # v1 gates expanded to miami
 */

import dotenv from "dotenv";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
dotenv.config({ path: resolve(root, ".env") });

// -------- v1 config (extracted from commit 4245489) --------
const V1 = {
  sigma: 2.5,
  minTradeEdge: 0.05,
  minConfidenceScore: 0.6,
  maxSpread: 0.06,
  slippagePenalty: 0.01,
  feePenalty: 0.0,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  fixedTradeQuantity: 10,
  confidenceWeights: {
    forecastFreshness: 0.35,
    thresholdDistance: 0.35,
    revisionStability: 0.2,
    spreadQuality: 0.1,
  },
};

// -------- v1 math --------
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const a = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1.0 / (1.0 + p * a);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-a * a);
  return sign * y;
}
function normalCdf(x, mu, sigma) {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// -------- v1 probability (always uses P(high > threshold), polarity bug preserved) --------
function v1BinaryProbability(forecastHigh, threshold, sigma) {
  return 1 - normalCdf(threshold, forecastHigh, sigma);
}
function v1BucketProbability(forecastHigh, lo, hi, sigma) {
  return normalCdf(hi, forecastHigh, sigma) - normalCdf(lo, forecastHigh, sigma);
}
function v1ModeledYesProbability(market, forecastHigh, sigma) {
  if (market.market_structure === "binary_threshold") {
    if (market.threshold_value == null) return null;
    return v1BinaryProbability(forecastHigh, market.threshold_value, sigma);
  }
  if (market.bucket_lower == null || market.bucket_upper == null) return null;
  return v1BucketProbability(
    forecastHigh,
    market.bucket_lower,
    market.bucket_upper,
    sigma
  );
}

// -------- v1 confidence --------
function hoursAgoMs(tsMs, nowMs) {
  return Math.max(0, (nowMs - tsMs) / 3_600_000);
}
function freshnessScore(forecastTimestamp, nowMs) {
  const h = hoursAgoMs(Date.parse(forecastTimestamp), nowMs);
  if (h <= 1) return 1.0;
  if (h <= 3) return 0.8;
  if (h <= 6) return 0.6;
  if (h <= 12) return 0.3;
  return 0.1;
}
function thresholdDistanceScore(forecastHigh, threshold, sigma) {
  if (threshold == null) return 0.5;
  const nd = Math.abs(forecastHigh - threshold) / sigma;
  if (nd >= 2.0) return 1.0;
  if (nd >= 1.0) return 0.7;
  if (nd >= 0.5) return 0.4;
  return 0.2;
}
function revisionStabilityScore(forecastHigh, prev, sigma) {
  if (prev == null) return 0.5;
  const nr = Math.abs(forecastHigh - prev) / sigma;
  if (nr <= 0.25) return 1.0;
  if (nr <= 0.5) return 0.8;
  if (nr <= 1.0) return 0.5;
  return 0.2;
}
function spreadQualityScore(yesBid, yesAsk) {
  if (yesBid == null || yesAsk == null) return 0.3;
  const s = yesAsk - yesBid;
  if (s <= 0.02) return 1.0;
  if (s <= 0.04) return 0.8;
  if (s <= 0.06) return 0.5;
  return 0.2;
}
function v1Confidence(inputs, nowMs) {
  const w = V1.confidenceWeights;
  const score =
    w.forecastFreshness * freshnessScore(inputs.forecastTimestamp, nowMs) +
    w.thresholdDistance *
      thresholdDistanceScore(inputs.forecastHigh, inputs.threshold, V1.sigma) +
    w.revisionStability *
      revisionStabilityScore(
        inputs.forecastHigh,
        inputs.previousForecastHigh,
        V1.sigma
      ) +
    w.spreadQuality * spreadQualityScore(inputs.yesBid, inputs.yesAsk);
  return clamp(score, 0, 1);
}

// -------- v1 action selection --------
function v1SelectAction(p) {
  if (p.hasOpenTradeForMarket) return "NO_TRADE";
  if (p.confidenceScore < V1.minConfidenceScore) return "NO_TRADE";
  const yesSpread = p.yesAsk - p.yesBid;
  const noSpread = p.noAsk - p.noBid;
  if (yesSpread > V1.maxSpread && noSpread > V1.maxSpread) return "NO_TRADE";
  if (p.settlementTime) {
    const minutes = (Date.parse(p.settlementTime) - p.nowMs) / 60000;
    if (minutes < V1.maxMinutesBeforeSettlementToEnter) return "NO_TRADE";
  }
  const yesQ = p.tradeEdgeYes >= V1.minTradeEdge && yesSpread <= V1.maxSpread;
  const noQ = p.tradeEdgeNo >= V1.minTradeEdge && noSpread <= V1.maxSpread;
  if (yesQ && noQ) return p.tradeEdgeYes >= p.tradeEdgeNo ? "BUY_YES" : "BUY_NO";
  if (yesQ) return "BUY_YES";
  if (noQ) return "BUY_NO";
  return "NO_TRADE";
}

function v1TradeEdges(pYes, yesAsk, noAsk) {
  const eff = V1.slippagePenalty + V1.feePenalty + V1.uncertaintyBuffer;
  return {
    effectiveYesEntry: yesAsk + eff,
    effectiveNoEntry: noAsk + eff,
    tradeEdgeYes: pYes - (yesAsk + eff),
    tradeEdgeNo: 1 - pYes - (noAsk + eff),
  };
}

// -------- CLI --------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { from: null, to: null, cities: ["nyc", "miami"], out: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from") opts.from = args[++i];
    else if (args[i] === "--to") opts.to = args[++i];
    else if (args[i] === "--cities")
      opts.cities = args[++i].split(",").map((s) => s.trim());
    else if (args[i] === "--out") opts.out = args[++i];
  }
  if (!opts.from) opts.from = "2026-04-15";
  if (!opts.to) opts.to = new Date().toISOString().slice(0, 10);
  return opts;
}

// -------- DB connection (direct Postgres, IPv6-aware) --------
async function openPgClient() {
  const { default: pg } = await import("pg");
  const { default: parseConnectionString } = await import(
    "pg-connection-string"
  );

  function firstNonEmpty(...keys) {
    for (const k of keys) {
      const v = process.env[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  }
  function buildDatabaseUrl() {
    const fromEnv = firstNonEmpty(
      "DATABASE_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
      "DIRECT_URL"
    );
    if (fromEnv) return fromEnv;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!supabaseUrl || !password) return null;
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split(".")[0];
    return `postgresql://postgres:${encodeURIComponent(
      password
    )}@db.${ref}.supabase.co:5432/postgres`;
  }

  const databaseUrl = buildDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      "Missing DB creds: set DATABASE_URL or SUPABASE_DB_PASSWORD in .env"
    );
  }
  const cfg = parseConnectionString.parseIntoClientConfig(databaseUrl);

  // Resolve v6 (or v4) explicitly, like deploy-cron does — direct hostnames
  // on Supabase are often IPv6-only and Node's dns.lookup() can ENOTFOUND.
  const hostname = cfg.host;
  if (hostname && !/^\[?[0-9a-f:]+]$/i.test(hostname)) {
    let ip = null;
    try {
      const v6 = await dns.resolve6(hostname);
      if (v6?.length) ip = v6[0];
    } catch {
      /* try v4 */
    }
    if (!ip) {
      try {
        const v4 = await dns.resolve4(hostname);
        if (v4?.length) ip = v4[0];
      } catch {
        /* fall through */
      }
    }
    if (ip) {
      cfg.host = ip;
      cfg.ssl = {
        rejectUnauthorized: false,
        servername: hostname,
        ...(cfg.ssl && typeof cfg.ssl === "object" ? cfg.ssl : {}),
      };
    } else {
      cfg.ssl = {
        rejectUnauthorized: false,
        ...(cfg.ssl && typeof cfg.ssl === "object" ? cfg.ssl : {}),
      };
    }
  }
  const client = new pg.Client(cfg);
  await client.connect();
  return client;
}

// -------- main --------
async function main() {
  const opts = parseArgs();

  console.error(
    `v1 replay: ${opts.from} → ${opts.to}, cities=${opts.cities.join("+")}`
  );
  const tStart = Date.now();
  const client = await openPgClient();
  console.error(`  [t+${Date.now() - tStart}ms] db connected`);

  // Replay window: simulate signal evaluation from `from` 00:00 UTC through
  // `to` 23:59:59 UTC. External-data snapshots are the "ticks" that drive
  // evaluation; they must fall inside this window. Market snapshots get a
  // small 1-hour lookback so we can price-match the first few ticks of `from`.
  const fromMs = Date.parse(opts.from + "T00:00:00Z");
  const toMs = Date.parse(opts.to + "T00:00:00Z") + 86400000;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const msLookbackIso = new Date(fromMs - 3_600_000).toISOString();

  // Markets
  // Include markets that were tradable at any point in [from, to]:
  // settlement_time must be > window start (i.e. the market hadn't settled yet),
  // and market_date must be on-or-before window end + 10 days (upper bound on
  // how far forward the listing goes).
  // Phase 2a: this script reads `forecasted_high` from the legacy root of
  // normalized_json, which is always daily_high data. Filtering to
  // variable='daily_high' here defends against Phase 2b daily_low markets
  // accidentally entering the replay before the script learns the
  // by_variable lookup.
  const marketsRes = await client.query(
    `SELECT id, ticker, city_key,
            COALESCE(variable, 'daily_high') AS variable,
            market_structure::text AS market_structure,
            to_char(market_date, 'YYYY-MM-DD') AS market_date,
            threshold_value, threshold_direction, bucket_lower,
            bucket_upper,
            settlement_time::text AS settlement_time,
            close_time::text AS close_time
       FROM markets
      WHERE city_key = ANY($1)
        AND COALESCE(variable, 'daily_high') = 'daily_high'
        AND market_date BETWEEN ($2::date - INTERVAL '1 day')
                            AND ($3::date + INTERVAL '10 days')
        AND (settlement_time IS NULL OR settlement_time > $2::timestamptz)`,
    [opts.cities, opts.from, opts.to]
  );
  const markets = marketsRes.rows.map((m) => ({
    ...m,
    threshold_value: m.threshold_value == null ? null : Number(m.threshold_value),
    bucket_lower: m.bucket_lower == null ? null : Number(m.bucket_lower),
    bucket_upper: m.bucket_upper == null ? null : Number(m.bucket_upper),
  }));
  console.error(
    `  [t+${Date.now() - tStart}ms] markets: ${markets.length}`
  );
  const marketIds = markets.map((m) => m.id);

  // Settlements
  const settlementsRes = await client.query(
    `SELECT market_id, outcome, settlement_value
       FROM settlements
      WHERE market_id = ANY($1)`,
    [marketIds]
  );
  const settlementByMarket = new Map(
    settlementsRes.rows.map((s) => [s.market_id, s])
  );
  console.error(
    `  [t+${Date.now() - tStart}ms] settlements: ${settlementsRes.rowCount}`
  );

  // External data (per city)
  const edsRes = await client.query(
    `SELECT city_key, captured_at,
            normalized_json->>'forecasted_high' AS forecasted_high,
            normalized_json->>'forecast_timestamp' AS forecast_timestamp,
            normalized_json->>'previous_forecast_high' AS previous_forecast_high
       FROM external_data_snapshots
      WHERE city_key = ANY($1)
        AND captured_at BETWEEN $2 AND $3
      ORDER BY captured_at ASC`,
    [opts.cities, fromIso, toIso]
  );
  const edsByCity = new Map();
  for (const city of opts.cities) edsByCity.set(city, []);
  for (const r of edsRes.rows) {
    edsByCity.get(r.city_key)?.push({
      captured_at: new Date(r.captured_at).toISOString(),
      forecasted_high:
        r.forecasted_high == null ? null : Number(r.forecasted_high),
      forecast_timestamp: r.forecast_timestamp,
      previous_forecast_high:
        r.previous_forecast_high == null
          ? null
          : Number(r.previous_forecast_high),
    });
  }
  for (const [c, a] of edsByCity)
    console.error(
      `  [t+${Date.now() - tStart}ms] external_data_snapshots ${c}: ${a.length}`
    );

  const msRes = await client.query(
    `SELECT market_id, captured_at, yes_bid, yes_ask, no_bid, no_ask
       FROM market_snapshots
      WHERE market_id = ANY($1)
        AND captured_at BETWEEN $2 AND $3
      ORDER BY market_id, captured_at ASC`,
    [marketIds, msLookbackIso, toIso]
  );
  const msByMarket = new Map();
  for (const m of markets) msByMarket.set(m.id, []);
  for (const r of msRes.rows) {
    msByMarket.get(r.market_id)?.push({
      captured_at_ms: new Date(r.captured_at).getTime(),
      yes_bid: r.yes_bid == null ? null : Number(r.yes_bid),
      yes_ask: r.yes_ask == null ? null : Number(r.yes_ask),
      no_bid: r.no_bid == null ? null : Number(r.no_bid),
      no_ask: r.no_ask == null ? null : Number(r.no_ask),
    });
  }
  console.error(
    `  [t+${Date.now() - tStart}ms] market_snapshots: ${msRes.rowCount}`
  );

  await client.end();

  // Replay: for each city, walk external_data timeline. For each tick:
  //   - for each market in city that has not yet fired a trade and is still tradable
  //   - find latest market_snapshot at-or-before the tick
  //   - evaluate v1 action; if BUY_YES/NO, record trade.
  const trades = [];
  const firedMarkets = new Set();
  // Markets grouped by city for fast loop
  const marketsByCity = new Map();
  for (const m of markets) {
    if (!marketsByCity.has(m.city_key)) marketsByCity.set(m.city_key, []);
    marketsByCity.get(m.city_key).push(m);
  }

  for (const city of opts.cities) {
    const eds = edsByCity.get(city) || [];
    const cityMarkets = marketsByCity.get(city) || [];
    // Per-market "last snapshot index" cursor to avoid O(n²) scans
    const msCursor = new Map();
    for (const m of cityMarkets) msCursor.set(m.id, 0);

    for (const snap of eds) {
      const nowMs = Date.parse(snap.captured_at);
      const forecastedHigh = snap.forecasted_high;
      const forecastTimestamp = snap.forecast_timestamp;
      const previousForecastHigh = snap.previous_forecast_high;
      if (!Number.isFinite(forecastedHigh) || !forecastTimestamp) continue;

      for (const m of cityMarkets) {
        if (firedMarkets.has(m.id)) continue;
        if (m.settlement_time && new Date(m.settlement_time).getTime() <= nowMs)
          continue;
        const arr = msByMarket.get(m.id) || [];
        let i = msCursor.get(m.id);
        while (i + 1 < arr.length && arr[i + 1].captured_at_ms <= nowMs) i++;
        msCursor.set(m.id, i);
        const ms = arr[i];
        if (!ms || ms.captured_at_ms > nowMs) continue;
        if (
          ms.yes_bid == null ||
          ms.yes_ask == null ||
          ms.no_bid == null ||
          ms.no_ask == null
        )
          continue;

        // v1 modeled probability (polarity bug included)
        const pYes = v1ModeledYesProbability(m, forecastedHigh, V1.sigma);
        if (pYes == null) continue;

        const edges = v1TradeEdges(pYes, ms.yes_ask, ms.no_ask);
        const confidence = v1Confidence(
          {
            forecastTimestamp,
            forecastHigh: forecastedHigh,
            threshold: m.threshold_value,
            previousForecastHigh,
            yesBid: ms.yes_bid,
            yesAsk: ms.yes_ask,
          },
          nowMs
        );

        const action = v1SelectAction({
          tradeEdgeYes: edges.tradeEdgeYes,
          tradeEdgeNo: edges.tradeEdgeNo,
          confidenceScore: confidence,
          yesAsk: ms.yes_ask,
          yesBid: ms.yes_bid,
          noAsk: ms.no_ask,
          noBid: ms.no_bid,
          settlementTime: m.settlement_time,
          hasOpenTradeForMarket: false, // we track firedMarkets separately
          nowMs,
        });

        if (action === "NO_TRADE") continue;

        const entryPrice = action === "BUY_YES" ? ms.yes_ask : ms.no_ask;
        const modeledSideProb =
          action === "BUY_YES" ? pYes : 1 - pYes;
        const tradeEdge =
          action === "BUY_YES" ? edges.tradeEdgeYes : edges.tradeEdgeNo;

        // Settle using settlements.settlement_value.
        // settlement_value is {0,1}: 1 if YES outcome, 0 if NO outcome.
        const st = settlementByMarket.get(m.id);
        let exitPrice = null;
        let realizedPnl = null;
        let settled = false;
        if (st && Number.isFinite(st.settlement_value)) {
          const yesWon = st.settlement_value === 1;
          const myWon = action === "BUY_YES" ? yesWon : !yesWon;
          exitPrice = myWon ? 1 : 0;
          realizedPnl = (exitPrice - entryPrice) * V1.fixedTradeQuantity;
          settled = true;
        }

        trades.push({
          entry_time: new Date(nowMs).toISOString(),
          city: m.city_key,
          ticker: m.ticker,
          market_structure: m.market_structure,
          threshold_direction: m.threshold_direction,
          threshold: m.threshold_value,
          bucket_lower: m.bucket_lower,
          bucket_upper: m.bucket_upper,
          market_date: m.market_date,
          side: action === "BUY_YES" ? "YES" : "NO",
          entry_price: entryPrice,
          modeled_yes_probability: pYes,
          modeled_side_probability: modeledSideProb,
          trade_edge: tradeEdge,
          confidence,
          forecasted_high: forecastedHigh,
          exit_price: exitPrice,
          realized_pnl: realizedPnl,
          settled,
        });
        firedMarkets.add(m.id);
      }
    }
  }

  // Write per-trade CSV
  mkdirSync(join(root, "tmp"), { recursive: true });
  const csvPath =
    opts.out ||
    join(
      root,
      `tmp/v1-replay-${opts.from}-to-${opts.to}-${opts.cities.join("_")}.csv`
    );
  const cols = Object.keys(
    trades[0] || {
      entry_time: "",
      city: "",
      ticker: "",
      market_structure: "",
      threshold_direction: "",
      threshold: "",
      bucket_lower: "",
      bucket_upper: "",
      market_date: "",
      side: "",
      entry_price: "",
      modeled_yes_probability: "",
      modeled_side_probability: "",
      trade_edge: "",
      confidence: "",
      forecasted_high: "",
      exit_price: "",
      realized_pnl: "",
      settled: "",
    }
  );
  const csvBody = trades
    .map((t) =>
      cols
        .map((c) => {
          const v = t[c];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");
  writeFileSync(csvPath, cols.join(",") + "\n" + csvBody);
  console.error(`  wrote ${trades.length} trades to ${csvPath}`);

  // -------- Summary --------
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const round2 = (x) => Math.round(x * 100) / 100;
  const round3 = (x) => Math.round(x * 1000) / 1000;

  const settledTrades = trades.filter((t) => t.settled);
  const wins = settledTrades.filter((t) => t.realized_pnl > 0).length;
  const losses = settledTrades.filter((t) => t.realized_pnl <= 0).length;
  const totalPnl = round2(sum(settledTrades.map((t) => t.realized_pnl)));
  const avgPnl = settledTrades.length
    ? round3(totalPnl / settledTrades.length)
    : null;

  console.log(`\n# v1 replay ${opts.from} → ${opts.to}  (${opts.cities.join("+")})`);
  console.log(
    `\n## Overall\n- trades fired: **${trades.length}** (${settledTrades.length} settled, ${trades.length - settledTrades.length} open)` +
      `\n- settled W/L: ${wins}/${losses}  (win% ${settledTrades.length ? ((wins / settledTrades.length) * 100).toFixed(1) : "—"})` +
      `\n- total realized P&L: **$${totalPnl}**  ($${avgPnl ?? "—"}/trade)`
  );

  // By-day
  const dayGroups = new Map();
  for (const t of trades) {
    const k = t.entry_time.slice(0, 10);
    if (!dayGroups.has(k)) dayGroups.set(k, []);
    dayGroups.get(k).push(t);
  }
  console.log(`\n## By day\n| day | trades | settled | W/L | P&L |\n|---|---|---|---|---|`);
  for (const [day, ts] of [...dayGroups.entries()].sort()) {
    const st = ts.filter((t) => t.settled);
    const w = st.filter((t) => t.realized_pnl > 0).length;
    const l = st.filter((t) => t.realized_pnl <= 0).length;
    const pnl = round2(sum(st.map((t) => t.realized_pnl)));
    console.log(`| ${day} | ${ts.length} | ${st.length} | ${w}/${l} | $${pnl} |`);
  }

  // By city
  const cityGroups = new Map();
  for (const t of trades) {
    if (!cityGroups.has(t.city)) cityGroups.set(t.city, []);
    cityGroups.get(t.city).push(t);
  }
  console.log(`\n## By city\n| city | trades | settled | W/L | P&L | $/trade |\n|---|---|---|---|---|---|`);
  for (const [city, ts] of [...cityGroups.entries()].sort()) {
    const st = ts.filter((t) => t.settled);
    const w = st.filter((t) => t.realized_pnl > 0).length;
    const l = st.filter((t) => t.realized_pnl <= 0).length;
    const pnl = round2(sum(st.map((t) => t.realized_pnl)));
    const avg = st.length ? round3(pnl / st.length) : "—";
    console.log(
      `| ${city} | ${ts.length} | ${st.length} | ${w}/${l} | $${pnl} | $${avg} |`
    );
  }

  // By structure × side
  const sgKey = (t) => `${t.market_structure}|${t.side}`;
  const sgGroups = new Map();
  for (const t of trades) {
    const k = sgKey(t);
    if (!sgGroups.has(k)) sgGroups.set(k, []);
    sgGroups.get(k).push(t);
  }
  console.log(
    `\n## By structure × side\n| structure | side | trades | settled | W/L | P&L |\n|---|---|---|---|---|---|`
  );
  for (const [k, ts] of [...sgGroups.entries()].sort()) {
    const [s, sd] = k.split("|");
    const st = ts.filter((t) => t.settled);
    const w = st.filter((t) => t.realized_pnl > 0).length;
    const l = st.filter((t) => t.realized_pnl <= 0).length;
    const pnl = round2(sum(st.map((t) => t.realized_pnl)));
    console.log(`| ${s} | ${sd} | ${ts.length} | ${st.length} | ${w}/${l} | $${pnl} |`);
  }

  // By threshold_direction (polarity-bug tracker)
  const dirGroups = new Map();
  for (const t of trades) {
    if (t.market_structure !== "binary_threshold") continue;
    const k = `${t.threshold_direction}|${t.side}`;
    if (!dirGroups.has(k)) dirGroups.set(k, []);
    dirGroups.get(k).push(t);
  }
  if (dirGroups.size > 0) {
    console.log(
      `\n## Binary: threshold_direction × side (polarity diagnostic)\n| direction | side | trades | W/L | P&L |\n|---|---|---|---|---|`
    );
    for (const [k, ts] of [...dirGroups.entries()].sort()) {
      const [dir, sd] = k.split("|");
      const st = ts.filter((t) => t.settled);
      const w = st.filter((t) => t.realized_pnl > 0).length;
      const l = st.filter((t) => t.realized_pnl <= 0).length;
      const pnl = round2(sum(st.map((t) => t.realized_pnl)));
      console.log(`| ${dir} | ${sd} | ${ts.length} | ${w}/${l} | $${pnl} |`);
    }
  }

  console.log(`\n_per-trade CSV_: ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
