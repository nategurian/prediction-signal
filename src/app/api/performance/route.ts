import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAllTrades, getDefaultAccount } from "@/lib/supabase/db";
import { getModelTransitions } from "@/lib/models/changelog";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, must-revalidate" } as const;

export async function GET(request: Request) {
  noStore();
  void request.url;
  try {
    const trades = await getAllTrades(1000);
    const account = await getDefaultAccount();

    const settledTrades = trades.filter((t) => t.status === "settled");
    const openTrades = trades.filter((t) => t.status === "open");

    const wins = settledTrades.filter((t) => (t.realized_pnl ?? 0) > 0);
    const losses = settledTrades.filter((t) => (t.realized_pnl ?? 0) <= 0);

    const realizedPnl = settledTrades.reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0);
    const unrealizedPnl = openTrades.reduce((sum, t) => sum + (t.unrealized_pnl ?? 0), 0);
    const totalPnl = realizedPnl + unrealizedPnl;

    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0) / losses.length
      : 0;

    const sortedSettled = [...settledTrades].sort(
      (a, b) => new Date(a.exit_time!).getTime() - new Date(b.exit_time!).getTime()
    );
    let cumPnl = 0;
    const equityCurve = sortedSettled.map((t) => {
      cumPnl += t.realized_pnl ?? 0;
      return {
        date: t.exit_time,
        pnl: Math.round(cumPnl * 100) / 100,
      };
    });

    let peak = 0;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      if (point.pnl > peak) peak = point.pnl;
      const drawdown = peak - point.pnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const modelTransitions = getModelTransitions().map((m) => ({
      version: m.version,
      slug: m.slug,
      deployedAt: m.deployedAt,
      title: m.title,
      category: m.category,
    }));

    return NextResponse.json(
      {
        totalPnl: Math.round(totalPnl * 100) / 100,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        tradeCount: trades.length,
        winRate: settledTrades.length > 0 ? Math.round((wins.length / settledTrades.length) * 100) : 0,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        equityCurve,
        modelTransitions,
        account: {
          startingBalance: account.starting_balance,
          currentBalance: account.current_balance,
        },
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("GET /api/performance error:", err);
    return NextResponse.json(
      { error: "Failed to fetch performance" },
      { status: 500, headers: NO_STORE }
    );
  }
}
