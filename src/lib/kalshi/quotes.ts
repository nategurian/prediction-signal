import type { KalshiMarket } from "./types";

/** Kalshi cents field (0–100) → probability price 0–1 */
function centsToPrice(cents: number | undefined | null): number | null {
  if (cents == null || Number.isNaN(Number(cents))) return null;
  return Number(cents) / 100;
}

/** Parse *_dollars (already 0–1 contract price) or fall back to cent field */
function dollarOrCents(
  dollars: string | number | undefined | null,
  cents: number | undefined | null
): number | null {
  if (dollars != null && dollars !== "") {
    const n = typeof dollars === "string" ? parseFloat(dollars) : Number(dollars);
    if (!Number.isNaN(n)) return n;
  }
  return centsToPrice(cents);
}

export interface KalshiQuotePrices {
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
}

/**
 * Normalize Kalshi market JSON to 0–1 snapshot prices.
 * Trade API v2 often sends yes_ask_dollars / no_bid_dollars (strings); older payloads use integer cents.
 */
export function kalshiMarketToQuotePrices(km: KalshiMarket): KalshiQuotePrices {
  return {
    yes_bid: dollarOrCents(km.yes_bid_dollars, km.yes_bid),
    yes_ask: dollarOrCents(km.yes_ask_dollars, km.yes_ask),
    no_bid: dollarOrCents(km.no_bid_dollars, km.no_bid),
    no_ask: dollarOrCents(km.no_ask_dollars, km.no_ask),
    last_price: dollarOrCents(km.last_price_dollars, km.last_price),
  };
}

/**
 * Kalshi `GET /markets` list responses often omit some top-of-book *_dollars fields
 * (commonly bids while asks are present). `GET /markets/{ticker}` returns full quotes.
 */
export function needsFullMarketQuoteFetch(km: KalshiMarket): boolean {
  const q = kalshiMarketToQuotePrices(km);
  return (
    q.yes_ask == null ||
    q.no_ask == null ||
    q.yes_bid == null ||
    q.no_bid == null
  );
}

export function kalshiVolume(km: KalshiMarket): number {
  if (km.volume != null && !Number.isNaN(Number(km.volume))) return Number(km.volume);
  if (km.volume_fp != null && km.volume_fp !== "") {
    const v = parseFloat(km.volume_fp);
    if (!Number.isNaN(v)) return Math.round(v);
  }
  return 0;
}
