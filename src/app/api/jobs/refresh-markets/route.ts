import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { KalshiClient } from "@/lib/kalshi/client";
import { upsertMarket, insertMarketSnapshot } from "@/lib/supabase/db";

function parseThresholdFromTitle(title: string): number | null {
  const match = title.match(/(\d+)\s*°?\s*F/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseMarketStructure(title: string): "binary_threshold" | "bucket_range" {
  if (title.toLowerCase().includes("between") || title.toLowerCase().includes("range")) {
    return "bucket_range";
  }
  return "binary_threshold";
}

function parseBucketBounds(title: string): { lower: number | null; upper: number | null } {
  const match = title.match(/(\d+)\s*°?\s*F?\s*(?:and|to|-)\s*(\d+)\s*°?\s*F/i);
  if (match) return { lower: parseInt(match[1], 10), upper: parseInt(match[2], 10) };
  return { lower: null, upper: null };
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
      const structure = parseMarketStructure(km.title);
      const threshold = parseThresholdFromTitle(km.title);
      const buckets = parseBucketBounds(km.title);
      const marketDate = parseDateFromTicker(km.ticker);

      const market = await upsertMarket({
        ticker: km.ticker,
        title: km.title,
        category: km.category ?? "weather",
        niche_key: "weather_daily_temp",
        city_key: "nyc",
        market_structure: structure,
        market_date: marketDate,
        threshold_value: threshold,
        bucket_lower: buckets.lower,
        bucket_upper: buckets.upper,
        close_time: km.close_time,
        settlement_time: km.expiration_time,
        status: km.status === "open" ? "active" : "closed",
        raw_json: km as unknown as Record<string, unknown>,
      });
      upserted++;

      const yesBid = km.yes_bid / 100;
      const yesAsk = km.yes_ask / 100;
      const noBid = km.no_bid / 100;
      const noAsk = km.no_ask / 100;

      await insertMarketSnapshot({
        market_id: market.id,
        captured_at: new Date().toISOString(),
        yes_bid: yesBid,
        yes_ask: yesAsk,
        no_bid: noBid,
        no_ask: noAsk,
        last_price: km.last_price / 100,
        implied_probability: yesAsk,
        volume: km.volume,
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
