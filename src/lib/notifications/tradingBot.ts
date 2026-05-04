/**
 * Trading-bot webhook client.
 *
 * Forwards `worth_trading` signals from `run-signals` to an external Kalshi
 * trading bot (see `Documents/TradingBot/server.py`, endpoint `POST /webhook`).
 *
 * Design constraints:
 *   1. Unit conversion. The bot reads `yes_ask` / `no_ask` as integer cents
 *      (1-99). prediction-signals stores them as 0.0-1.0 fractions. We convert
 *      here, in one place, so the bot's existing reader stays untouched.
 *   2. Sizing for small bankrolls. Default `contracts = 1`. With $50-$100
 *      starting capital, a single contract risks $0.30-$0.75 entry, leaving
 *      30+ stacked-position headroom. Override via `TRADING_BOT_CONTRACTS`
 *      once the pipeline is proven and bankroll grows. Note that this
 *      intentionally diverges from `fixedTradeQuantity = 10` used by the
 *      paper-trading simulation in Supabase; the simulation continues to
 *      record at quantity 10 for backtest comparability.
 *   3. Non-blocking. A bot outage must not break the cron pipeline. All
 *      errors are caught and returned in the result object; nothing throws.
 *      The caller logs the result and continues.
 *   4. Auth. HMAC-SHA256 over the raw JSON body, hex-encoded, sent as
 *      `X-Webhook-Signature`. Matches `_verify_signature` in
 *      `Documents/TradingBot/server.py`. If `TRADING_BOT_WEBHOOK_SECRET` is
 *      unset, the bot accepts unsigned requests (development only).
 *   5. Opt-in. If `TRADING_BOT_WEBHOOK_URL` is unset the helper is a no-op,
 *      so the cron job behaves identically to its pre-webhook state.
 */
import { createHmac } from "node:crypto";
import type { Market, MarketSnapshot, Signal } from "@/lib/supabase/db";

export interface TradingBotPayload {
  signal_id: string;
  captured_at: string;
  market_ticker: string;
  /** "BUY_YES" or "BUY_NO" — NO_TRADE signals are never forwarded. */
  signal_type: "BUY_YES" | "BUY_NO";
  /** Integer cents in [1, 99]. Converted from the 0.0-1.0 fraction stored in market_snapshots. */
  yes_ask: number;
  no_ask: number;
  yes_bid: number;
  no_bid: number;
  /** Number of $1 contracts to buy. */
  contracts: number;
  confidence_score: number;
  modeled_yes_probability: number;
  trade_edge_yes: number | null;
  trade_edge_no: number | null;
  model_version: string;
  market_structure: "binary_threshold" | "bucket_range";
  threshold_value: number | null;
}

export interface TradingBotDeliveryResult {
  /** Whether delivery is considered successful. `skipped: true` also implies ok. */
  ok: boolean;
  /** True when the webhook URL is unset and we deliberately did nothing. */
  skipped?: boolean;
  status?: number;
  /** Bot response body if the request reached the bot (parsed JSON or raw text). */
  response?: unknown;
  /** Error string if the request failed before getting a response. */
  error?: string;
}

const FRACTION_TO_CENTS = 100;

/** 0.0-1.0 fraction → integer cents in [1, 99]. Floor-clamps to keep the bot's
 *  limit-order price legal. Returns 0 for null / NaN inputs (bot will reject). */
function priceToCents(price: number | null | undefined): number {
  if (price == null || !Number.isFinite(price)) return 0;
  const cents = Math.round(price * FRACTION_TO_CENTS);
  if (cents < 1) return 1;
  if (cents > 99) return 99;
  return cents;
}

function resolveContractCount(): number {
  const raw = process.env.TRADING_BOT_CONTRACTS;
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/**
 * Build the wire payload sent to the trading bot. Pure function — exported
 * for unit tests. Does not include `NO_TRADE` signals; callers must filter.
 */
export function buildSignalPayload(args: {
  signal: Signal;
  snapshot: MarketSnapshot;
  market: Market;
  contracts?: number;
}): TradingBotPayload | null {
  const { signal, snapshot, market } = args;
  if (signal.signal_type !== "BUY_YES" && signal.signal_type !== "BUY_NO") {
    return null;
  }
  return {
    signal_id: signal.id,
    captured_at: signal.captured_at,
    market_ticker: market.ticker,
    signal_type: signal.signal_type,
    yes_ask: priceToCents(snapshot.yes_ask),
    no_ask: priceToCents(snapshot.no_ask),
    yes_bid: priceToCents(snapshot.yes_bid),
    no_bid: priceToCents(snapshot.no_bid),
    contracts: args.contracts ?? resolveContractCount(),
    confidence_score: signal.confidence_score,
    modeled_yes_probability: signal.modeled_yes_probability,
    trade_edge_yes: signal.trade_edge_yes,
    trade_edge_no: signal.trade_edge_no,
    model_version: signal.model_version,
    market_structure: market.market_structure,
    threshold_value: market.threshold_value,
  };
}

/**
 * HMAC-SHA256(body, secret) hex-encoded. Matches the bot's verification:
 *   hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
 */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * POST a `worth_trading` signal to the configured trading bot. Returns a
 * structured result; never throws. Caller is expected to log non-ok results.
 *
 * Timeout is 8 seconds — long enough to absorb the bot's synchronous
 * Kalshi place_order roundtrip, short enough that a stuck bot doesn't
 * consume the cron's 30-60s budget.
 */
export async function sendSignalToTradingBot(args: {
  signal: Signal;
  snapshot: MarketSnapshot;
  market: Market;
  contracts?: number;
  /** Override the URL/secret for tests; defaults to env. */
  webhookUrl?: string;
  webhookSecret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TradingBotDeliveryResult> {
  const url = args.webhookUrl ?? process.env.TRADING_BOT_WEBHOOK_URL;
  if (!url) return { ok: true, skipped: true };

  const payload = buildSignalPayload({
    signal: args.signal,
    snapshot: args.snapshot,
    market: args.market,
    contracts: args.contracts,
  });
  if (!payload) return { ok: true, skipped: true };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = args.webhookSecret ?? process.env.TRADING_BOT_WEBHOOK_SECRET;
  if (secret) headers["X-Webhook-Signature"] = signWebhookBody(body, secret);

  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = args.timeoutMs ?? 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave as raw text
    }
    return { ok: res.ok, status: res.status, response: parsed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
