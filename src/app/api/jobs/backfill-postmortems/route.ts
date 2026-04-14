import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { buildPostmortemTradePayload } from "@/lib/ai/postmortemTradePayload";
import { generateAndSavePostmortem } from "@/lib/ai/postmortems";
import {
  getMarketById,
  getPostmortemByTrade,
  getSettlementByMarket,
  getSettledTrades,
  getSignalById,
  type TradePostmortem,
} from "@/lib/supabase/db";

const FAILED_SUMMARY = "Postmortem generation failed.";

function shouldProcess(
  postmortem: TradePostmortem | null,
  onlyFailed: boolean,
  includeMissing: boolean
): boolean {
  if (!postmortem) return includeMissing;
  if (!onlyFailed) return true;
  if (postmortem.summary === FAILED_SUMMARY) return true;
  const codes = postmortem.reason_codes_json;
  return !Array.isArray(codes) || codes.length === 0;
}

/**
 * Regenerates postmortems for settled trades (LLM + enriched structured_json).
 * Auth: Bearer ETL_CRON_SECRET (same as other jobs).
 *
 * Body JSON (optional):
 * - onlyFailed: default true — only rows with failed/empty LLM output
 * - includeMissing: default false — also create postmortems for settled trades with no row
 * - limit: default 100 — max trades scanned (most recent settled first)
 */
export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  let onlyFailed = true;
  let includeMissing = false;
  let limit = 100;

  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as {
        onlyFailed?: boolean;
        includeMissing?: boolean;
        limit?: number;
      };
      if (typeof body.onlyFailed === "boolean") onlyFailed = body.onlyFailed;
      if (typeof body.includeMissing === "boolean") includeMissing = body.includeMissing;
      if (typeof body.limit === "number" && body.limit > 0 && body.limit <= 2000) limit = body.limit;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const trades = await getSettledTrades(limit);
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const trade of trades) {
      const postmortem = await getPostmortemByTrade(trade.id);
      if (!shouldProcess(postmortem, onlyFailed, includeMissing)) {
        skipped++;
        continue;
      }

      const settlement = await getSettlementByMarket(trade.market_id);
      if (!settlement) {
        skipped++;
        errors.push(`no settlement for trade ${trade.id}`);
        continue;
      }

      const market = await getMarketById(trade.market_id);
      if (!market) {
        skipped++;
        errors.push(`no market for trade ${trade.id}`);
        continue;
      }

      try {
        const signal = await getSignalById(trade.signal_id);
        const tradeData = await buildPostmortemTradePayload({
          trade,
          settledTrade: trade,
          market,
          signal,
        });

        await generateAndSavePostmortem(trade, settlement, tradeData);
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`trade ${trade.id}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      skipped,
      scanned: trades.length,
      onlyFailed,
      includeMissing,
      errors: errors.slice(0, 20),
      error_truncated: errors.length > 20,
    });
  } catch (err) {
    console.error("backfill-postmortems error:", err);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
