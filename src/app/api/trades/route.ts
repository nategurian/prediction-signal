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
