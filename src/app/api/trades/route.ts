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
  const { markets: _drop, ...trade } = row;
  return {
    ...trade,
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
