/**
 * Kalshi trading fee model.
 *
 * Per Kalshi's published fee schedule, the trading fee (in dollars) for a
 * single order is:
 *
 *   fee = ceil( FEE_RATE × contracts × P × (1 − P) × 100 ) / 100
 *
 * where P is the contract price in dollars (0..1). This is charged on every
 * fill (both entry and exit). Settlement itself is free — winning contracts
 * just pay $1 with no additional fee.
 *
 * We also expose `expectedFeePerContract`, the *unrounded* per-contract fee
 * used by the signal engine to estimate the true cost of entering a
 * position when deciding whether an edge clears minTradeEdge. The rounded
 * `kalshiTradingFee` is used at actual trade-open / settlement time for
 * realized PnL.
 */

/** Kalshi trading fee rate (7% of the notional price × complement). */
export const KALSHI_FEE_RATE = 0.07;

/**
 * Exact Kalshi trading fee for an order of `contracts` at price
 * `priceInDollars`. Returns dollars, rounded up to the nearest cent.
 * Returns 0 for degenerate prices (0 or 1) and non-positive quantities.
 */
export function kalshiTradingFee(priceInDollars: number, contracts: number): number {
  if (contracts <= 0) return 0;
  if (priceInDollars <= 0 || priceInDollars >= 1) return 0;
  const cents =
    KALSHI_FEE_RATE * contracts * priceInDollars * (1 - priceInDollars) * 100;
  // Small epsilon guard: IEEE-754 drift can turn an exact-cent result like
  // 1.75 into 1.7500000000000002, which would spuriously ceil up to the next
  // cent. 1e-9 is far below any meaningful fee resolution.
  return Math.ceil(cents - 1e-9) / 100;
}

/**
 * Per-contract expected fee, *without* the cent-rounding step, suitable for
 * estimating edge in the signal engine. Because the rounding ceiling is
 * batched across an entire order, the realized per-contract fee for a
 * typical 10-contract trade is within ~0.1¢ of this value.
 */
export function expectedFeePerContract(priceInDollars: number): number {
  if (priceInDollars <= 0 || priceInDollars >= 1) return 0;
  return KALSHI_FEE_RATE * priceInDollars * (1 - priceInDollars);
}
