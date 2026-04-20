import {
  insertSimulatedTrade,
  updateTrade,
  getDefaultAccount,
  updateAccountBalance,
  insertSettlement,
  getTradesForMarket,
  type SimulatedTrade,
  type MarketSnapshot,
  type Signal,
  type Market,
} from "@/lib/supabase/db";
import { getCityConfig } from "@/lib/config";
import { kalshiTradingFee } from "@/lib/engine/fees";

export async function openPaperTrade(
  signal: Signal,
  snapshot: MarketSnapshot,
  market: Market
): Promise<SimulatedTrade | null> {
  if (signal.signal_type === "NO_TRADE" || !signal.worth_trading) return null;

  const existingTrades = await getTradesForMarket(market.id);
  if (existingTrades.length > 0) return null;

  const account = await getDefaultAccount();
  const side = signal.signal_type === "BUY_YES" ? "YES" : "NO";
  const askPrice = side === "YES" ? snapshot.yes_ask : snapshot.no_ask;

  if (askPrice == null) return null;

  const cityConfig = getCityConfig(market.city_key);
  // Fold Kalshi's per-contract trading fee into the effective entry price
  // so realized PnL correctly reflects the fee haircut. The fee is batched
  // (cent-rounded once per order) so we divide by quantity to amortize it
  // evenly across contracts.
  const quantity = cityConfig.fixedTradeQuantity;
  const feePerContract = kalshiTradingFee(askPrice, quantity) / quantity;
  const entryPrice = askPrice + cityConfig.slippagePenalty + feePerContract;

  return insertSimulatedTrade({
    account_id: account.id,
    market_id: market.id,
    signal_id: signal.id,
    side,
    quantity,
    entry_time: new Date().toISOString(),
    entry_price: entryPrice,
    current_mark_price: askPrice,
    exit_time: null,
    exit_price: null,
    status: "open",
    unrealized_pnl: 0,
    realized_pnl: null,
    notes: null,
  });
}

export async function markTradeToMarket(
  trade: SimulatedTrade,
  currentSnapshot: MarketSnapshot
): Promise<SimulatedTrade> {
  const markPrice =
    trade.side === "YES" ? currentSnapshot.yes_bid : currentSnapshot.no_bid;

  if (markPrice == null) return trade;

  const unrealizedPnl = (markPrice - trade.entry_price) * trade.quantity;

  return updateTrade(trade.id, {
    current_mark_price: markPrice,
    unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
  });
}

export async function settleTrade(
  trade: SimulatedTrade,
  outcome: string,
  settlementValue: number,
  market: Market
): Promise<SimulatedTrade> {
  await insertSettlement({
    market_id: market.id,
    settled_at: new Date().toISOString(),
    outcome,
    settlement_value: settlementValue,
    raw_json: null,
  });

  let payout: number;
  if (trade.side === "YES") {
    payout = settlementValue === 1 ? 1 : 0;
  } else {
    payout = settlementValue === 0 ? 1 : 0;
  }

  const realizedPnl = (payout - trade.entry_price) * trade.quantity;

  const account = await getDefaultAccount();
  await updateAccountBalance(
    account.id,
    account.current_balance + realizedPnl
  );

  return updateTrade(trade.id, {
    exit_time: new Date().toISOString(),
    exit_price: payout,
    status: "settled",
    realized_pnl: Math.round(realizedPnl * 100) / 100,
    unrealized_pnl: 0,
  });
}
