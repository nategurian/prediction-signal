import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { KalshiClient } from "@/lib/kalshi/client";
import { kalshiMarketToQuotePrices, kalshiVolume } from "@/lib/kalshi/quotes";
import { deriveMarketMetadataFromKalshi } from "@/lib/kalshi/marketMetadata";
import { upsertMarket, insertMarketSnapshot } from "@/lib/supabase/db";

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

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const client = new KalshiClient();
    const markets = await client.getAllWeatherMarkets();

    let upserted = 0;
    let snapshots = 0;

    for (const km of markets) {
      const derived = deriveMarketMetadataFromKalshi(km);
      const marketDate = parseDateFromTicker(km.ticker);

      const market = await upsertMarket({
        ticker: km.ticker,
        title: km.title,
        category: km.category ?? "weather",
        niche_key: "weather_daily_temp",
        city_key: "nyc",
        market_structure: derived.market_structure,
        market_date: marketDate,
        threshold_value: derived.threshold_value,
        bucket_lower: derived.bucket_lower,
        bucket_upper: derived.bucket_upper,
        close_time: km.close_time,
        settlement_time: km.expiration_time,
        status: isKalshiMarketOpen(km.status) ? "active" : "closed",
        raw_json: km as unknown as Record<string, unknown>,
      });
      upserted++;

      const q = kalshiMarketToQuotePrices(km);

      await insertMarketSnapshot({
        market_id: market.id,
        captured_at: new Date().toISOString(),
        yes_bid: q.yes_bid,
        yes_ask: q.yes_ask,
        no_bid: q.no_bid,
        no_ask: q.no_ask,
        last_price: q.last_price,
        implied_probability: q.yes_ask,
        volume: kalshiVolume(km),
        raw_json: km as unknown as Record<string, unknown>,
      });
      snapshots++;
    }

    return NextResponse.json({ ok: true, markets_upserted: upserted, snapshots_created: snapshots });
  } catch (err) {
    console.error("refresh-markets error:", err);
    return NextResponse.json({ error: "Failed to refresh markets" }, { status: 500 });
  }
}
