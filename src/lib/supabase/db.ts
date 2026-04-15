import { getSupabaseAdmin } from "./server";

// ─── Types matching DB schema ───────────────────────────────────────────────

export interface Market {
  id: string;
  ticker: string;
  title: string;
  category: string | null;
  niche_key: string;
  city_key: string;
  market_structure: "binary_threshold" | "bucket_range";
  market_date: string | null;
  threshold_value: number | null;
  threshold_direction: "greater" | "less" | null;
  bucket_lower: number | null;
  bucket_upper: number | null;
  close_time: string | null;
  settlement_time: string | null;
  status: "active" | "closed" | "settled";
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MarketSnapshot {
  id: string;
  market_id: string;
  captured_at: string;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
  implied_probability: number | null;
  volume: number | null;
  raw_json: Record<string, unknown> | null;
}

export interface ExternalDataSnapshot {
  id: string;
  niche_key: string;
  city_key: string;
  source_name: string;
  captured_at: string;
  normalized_json: Record<string, unknown>;
  raw_json: Record<string, unknown> | null;
}

export interface ModelOutput {
  id: string;
  market_id: string;
  captured_at: string;
  modeled_probability: number;
  confidence_score: number;
  feature_json: Record<string, unknown>;
  model_version: string;
  /** Weather snapshot used for this output (when present). */
  external_data_id: string | null;
}

export interface Signal {
  id: string;
  market_id: string;
  model_output_id: string;
  captured_at: string;
  signal_type: "BUY_YES" | "BUY_NO" | "NO_TRADE";
  confidence_score: number;
  explanation: string | null;
  reason_codes_json: string[] | null;
  status: string;
  modeled_yes_probability: number;
  modeled_no_probability: number;
  effective_yes_entry_price: number | null;
  effective_no_entry_price: number | null;
  trade_edge_yes: number | null;
  trade_edge_no: number | null;
  worth_trading: boolean;
  model_version: string;
}

export interface SimulatedAccount {
  id: string;
  name: string;
  starting_balance: number;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface SimulatedTrade {
  id: string;
  account_id: string;
  market_id: string;
  signal_id: string;
  side: "YES" | "NO";
  quantity: number;
  entry_time: string;
  entry_price: number;
  current_mark_price: number | null;
  exit_time: string | null;
  exit_price: number | null;
  status: "open" | "settled" | "cancelled";
  unrealized_pnl: number;
  realized_pnl: number | null;
  notes: string | null;
}

export interface Settlement {
  id: string;
  market_id: string;
  settled_at: string;
  outcome: string;
  settlement_value: number;
  raw_json: Record<string, unknown> | null;
}

export interface TradePostmortem {
  id: string;
  simulated_trade_id: string;
  created_at: string;
  outcome_label: string;
  reason_codes_json: string[] | null;
  summary: string;
  structured_json: Record<string, unknown> | null;
}

// ─── Query helpers ──────────────────────────────────────────────────────────

const db = () => getSupabaseAdmin();

export async function getActiveMarkets(): Promise<Market[]> {
  const { data, error } = await db()
    .from("markets")
    .select("*")
    .eq("status", "active")
    .order("market_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Market[];
}

export async function getMarketByTicker(ticker: string): Promise<Market | null> {
  const { data, error } = await db()
    .from("markets")
    .select("*")
    .eq("ticker", ticker)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as Market) ?? null;
}

export async function getMarketById(id: string): Promise<Market | null> {
  const { data, error } = await db().from("markets").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as Market) ?? null;
}

export async function upsertMarket(market: Partial<Market> & { ticker: string }): Promise<Market> {
  const { data, error } = await db()
    .from("markets")
    .upsert({ ...market, updated_at: new Date().toISOString() }, { onConflict: "ticker" })
    .select()
    .single();
  if (error) throw error;
  return data as Market;
}

export async function insertMarketSnapshot(snapshot: Omit<MarketSnapshot, "id">): Promise<MarketSnapshot> {
  const { data, error } = await db()
    .from("market_snapshots")
    .insert(snapshot)
    .select()
    .single();
  if (error) throw error;
  return data as MarketSnapshot;
}

export async function getLatestSnapshot(marketId: string): Promise<MarketSnapshot | null> {
  const { data, error } = await db()
    .from("market_snapshots")
    .select("*")
    .eq("market_id", marketId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as MarketSnapshot) ?? null;
}

export async function insertExternalDataSnapshot(
  snapshot: Omit<ExternalDataSnapshot, "id">
): Promise<ExternalDataSnapshot> {
  const { data, error } = await db()
    .from("external_data_snapshots")
    .insert(snapshot)
    .select()
    .single();
  if (error) throw error;
  return data as ExternalDataSnapshot;
}

export async function getLatestExternalData(
  nicheKey: string,
  cityKey: string
): Promise<ExternalDataSnapshot | null> {
  const { data, error } = await db()
    .from("external_data_snapshots")
    .select("*")
    .eq("niche_key", nicheKey)
    .eq("city_key", cityKey)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as ExternalDataSnapshot) ?? null;
}

export async function getLatestModelOutput(marketId: string): Promise<ModelOutput | null> {
  const { data, error } = await db()
    .from("model_outputs")
    .select("*")
    .eq("market_id", marketId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as ModelOutput) ?? null;
}

export async function getModelOutputById(id: string): Promise<ModelOutput | null> {
  const { data, error } = await db().from("model_outputs").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as ModelOutput) ?? null;
}

export async function getExternalDataSnapshotById(id: string): Promise<ExternalDataSnapshot | null> {
  const { data, error } = await db()
    .from("external_data_snapshots")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as ExternalDataSnapshot) ?? null;
}

export async function insertModelOutput(output: Omit<ModelOutput, "id">): Promise<ModelOutput> {
  const { data, error } = await db()
    .from("model_outputs")
    .insert(output)
    .select()
    .single();
  if (error) throw error;
  return data as ModelOutput;
}

export async function insertSignal(signal: Omit<Signal, "id">): Promise<Signal> {
  const { data, error } = await db()
    .from("signals")
    .insert(signal)
    .select()
    .single();
  if (error) throw error;
  return data as Signal;
}

export async function getRecentSignals(limit = 50): Promise<Signal[]> {
  const { data, error } = await db()
    .from("signals")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Signal[];
}

export async function getSignalById(id: string): Promise<Signal | null> {
  const { data, error } = await db().from("signals").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as Signal) ?? null;
}

export async function getDefaultAccount(): Promise<SimulatedAccount> {
  const { data, error } = await db()
    .from("simulated_accounts")
    .select("*")
    .eq("name", "default")
    .single();
  if (error) throw error;
  return data as SimulatedAccount;
}

export async function insertSimulatedTrade(
  trade: Omit<SimulatedTrade, "id">
): Promise<SimulatedTrade> {
  const { data, error } = await db()
    .from("simulated_trades")
    .insert(trade)
    .select()
    .single();
  if (error) throw error;
  return data as SimulatedTrade;
}

export async function getOpenTrades(): Promise<SimulatedTrade[]> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select("*")
    .eq("status", "open");
  if (error) throw error;
  return (data ?? []) as SimulatedTrade[];
}

export async function getSettledTrades(limit = 500): Promise<SimulatedTrade[]> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select("*")
    .eq("status", "settled")
    .order("entry_time", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SimulatedTrade[];
}

export async function getAllTrades(limit = 100): Promise<SimulatedTrade[]> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select("*")
    .order("entry_time", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SimulatedTrade[];
}

/** Trade row with joined market schedule fields for dashboards. */
export type SimulatedTradeWithMarket = SimulatedTrade & {
  markets: Pick<
    Market,
    "ticker" | "title" | "market_date" | "close_time" | "settlement_time" | "raw_json"
  > | null;
};

export async function getAllTradesWithMarkets(limit = 100): Promise<SimulatedTradeWithMarket[]> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select(
      `
      *,
      markets (
        ticker,
        title,
        market_date,
        close_time,
        settlement_time,
        raw_json
      )
    `
    )
    .order("entry_time", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SimulatedTradeWithMarket[];
}

export async function getTradeById(id: string): Promise<SimulatedTrade | null> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as SimulatedTrade) ?? null;
}

export async function updateTrade(
  id: string,
  updates: Partial<SimulatedTrade>
): Promise<SimulatedTrade> {
  const { data, error } = await db()
    .from("simulated_trades")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SimulatedTrade;
}

export async function updateAccountBalance(
  accountId: string,
  newBalance: number
): Promise<void> {
  const { error } = await db()
    .from("simulated_accounts")
    .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) throw error;
}

export async function insertSettlement(
  settlement: Omit<Settlement, "id">
): Promise<Settlement> {
  const { data, error } = await db()
    .from("settlements")
    .insert(settlement)
    .select()
    .single();
  if (error) throw error;
  return data as Settlement;
}

export async function getSettlementByMarket(marketId: string): Promise<Settlement | null> {
  const { data, error } = await db()
    .from("settlements")
    .select("*")
    .eq("market_id", marketId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as Settlement) ?? null;
}

export async function insertPostmortem(
  postmortem: Omit<TradePostmortem, "id">
): Promise<TradePostmortem> {
  const { data, error } = await db()
    .from("trade_postmortems")
    .insert(postmortem)
    .select()
    .single();
  if (error) throw error;
  return data as TradePostmortem;
}

export async function getPostmortemByTrade(tradeId: string): Promise<TradePostmortem | null> {
  const { data, error } = await db()
    .from("trade_postmortems")
    .select("*")
    .eq("simulated_trade_id", tradeId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as TradePostmortem) ?? null;
}

export async function updatePostmortemByTradeId(
  tradeId: string,
  updates: Pick<TradePostmortem, "summary" | "reason_codes_json" | "structured_json" | "outcome_label">
): Promise<TradePostmortem | null> {
  const { data, error } = await db()
    .from("trade_postmortems")
    .update(updates)
    .eq("simulated_trade_id", tradeId)
    .select()
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as TradePostmortem) ?? null;
}

export async function getTradesForMarket(marketId: string): Promise<SimulatedTrade[]> {
  const { data, error } = await db()
    .from("simulated_trades")
    .select("*")
    .eq("market_id", marketId)
    .eq("status", "open");
  if (error) throw error;
  return (data ?? []) as SimulatedTrade[];
}

export async function updateMarketStatus(
  id: string,
  status: Market["status"]
): Promise<void> {
  const { error } = await db()
    .from("markets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
