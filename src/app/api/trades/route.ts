import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAllTradesWithMarkets, type SimulatedTradeWithMarket } from "@/lib/supabase/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, must-revalidate" } as const;

function openTimeFromMarketRaw(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const v = raw.open_time;
  return typeof v === "string" ? v : null;
}

function serializeTrade(row: SimulatedTradeWithMarket) {
  const m = row.markets;
  const s = row.signals;
  const openTime = m ? openTimeFromMarketRaw(m.raw_json) : null;
  return {
    id: row.id,
    account_id: row.account_id,
    market_id: row.market_id,
    signal_id: row.signal_id,
    side: row.side,
    quantity: row.quantity,
    entry_time: row.entry_time,
    entry_price: row.entry_price,
    current_mark_price: row.current_mark_price,
    exit_time: row.exit_time,
    exit_price: row.exit_price,
    status: row.status,
    unrealized_pnl: row.unrealized_pnl,
    realized_pnl: row.realized_pnl,
    notes: row.notes,
    market: m
      ? {
          ticker: m.ticker,
          title: m.title,
          market_date: m.market_date,
          open_time: openTime,
          close_time: m.close_time,
          settlement_time: m.settlement_time,
          city_key: m.city_key,
          market_structure: m.market_structure,
          threshold_direction: m.threshold_direction,
        }
      : null,
    signal: s
      ? {
          model_version: s.model_version,
          signal_type: s.signal_type,
          modeled_yes_probability: s.modeled_yes_probability,
          confidence_score: s.confidence_score,
          trade_edge_yes: s.trade_edge_yes,
          trade_edge_no: s.trade_edge_no,
        }
      : null,
  };
}

export async function GET(request: Request) {
  noStore();
  void request.url;
  try {
    const rows = await getAllTradesWithMarkets();
    const trades = rows.map(serializeTrade);
    return NextResponse.json({ trades }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/trades error:", err);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500, headers: NO_STORE }
    );
  }
}
