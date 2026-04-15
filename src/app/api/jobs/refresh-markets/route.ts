import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { KalshiClient } from "@/lib/kalshi/client";
import type { KalshiMarket } from "@/lib/kalshi/types";
import { kalshiMarketToQuotePrices, kalshiVolume, needsFullMarketQuoteFetch } from "@/lib/kalshi/quotes";
import { deriveMarketMetadataFromKalshi } from "@/lib/kalshi/marketMetadata";
import { getActiveMarkets, upsertMarket, insertMarketSnapshot } from "@/lib/supabase/db";

/** Kalshi returns tradable markets as `active` (and sometimes `open`). */
function isKalshiMarketOpen(status: string | undefined): boolean {
  const s = status?.toLowerCase() ?? "";
  return s === "open" || s === "active";
}

function parseDateFromTicker(ticker: string): string | null {
  const match = ticker.match(/(\d{2})([A-Z]{3})(\d{2})/);
  if (!match) return null;
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const year = `20${match[1]}`;
  const month = months[match[2]] ?? "01";
  const day = match[3];
  return `${year}-${month}-${day}`;
}

async function upsertMarketAndSnapshotFromDetail(detail: KalshiMarket): Promise<void> {
  const derived = deriveMarketMetadataFromKalshi(detail);
  const marketDate = parseDateFromTicker(detail.ticker);

  const market = await upsertMarket({
    ticker: detail.ticker,
    title: detail.title,
    category: detail.category ?? "weather",
    niche_key: "weather_daily_temp",
    city_key: "nyc",
    market_structure: derived.market_structure,
    market_date: marketDate,
    threshold_value: derived.threshold_value,
    threshold_direction: derived.threshold_direction,
    bucket_lower: derived.bucket_lower,
    bucket_upper: derived.bucket_upper,
    close_time: detail.close_time,
    settlement_time: detail.expiration_time,
    status: isKalshiMarketOpen(detail.status) ? "active" : "closed",
    raw_json: detail as unknown as Record<string, unknown>,
  });

  const q = kalshiMarketToQuotePrices(detail);

  await insertMarketSnapshot({
    market_id: market.id,
    captured_at: new Date().toISOString(),
    yes_bid: q.yes_bid,
    yes_ask: q.yes_ask,
    no_bid: q.no_bid,
    no_ask: q.no_ask,
    last_price: q.last_price,
    implied_probability: q.yes_ask,
    volume: kalshiVolume(detail),
    raw_json: detail as unknown as Record<string, unknown>,
  });
}

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const client = new KalshiClient();
    const markets = await client.getAllWeatherMarkets();

    let upserted = 0;
    let snapshots = 0;

    for (const km of markets) {
      let detail: KalshiMarket = km;
      if (needsFullMarketQuoteFetch(km)) {
        const full = await client.getMarket(km.ticker);
        if (full) detail = full;
      }

      await upsertMarketAndSnapshotFromDetail(detail);
      upserted++;
      snapshots++;
    }

    /** Kalshi list uses `open` only; contracts we still track as active may already be closed — refresh via ticker detail. */
    const openTickers = new Set(markets.map((m) => m.ticker));
    const dbActive = await getActiveMarkets();
    for (const row of dbActive) {
      if (openTickers.has(row.ticker)) continue;
      let detail = await client.getMarket(row.ticker);
      if (!detail) continue;
      if (needsFullMarketQuoteFetch(detail)) {
        const full = await client.getMarket(detail.ticker);
        if (full) detail = full;
      }
      await upsertMarketAndSnapshotFromDetail(detail);
      upserted++;
      snapshots++;
    }

    return NextResponse.json({ ok: true, markets_upserted: upserted, snapshots_created: snapshots });
  } catch (err) {
    console.error("refresh-markets error:", err);
    return NextResponse.json({ error: "Failed to refresh markets" }, { status: 500 });
  }
}
