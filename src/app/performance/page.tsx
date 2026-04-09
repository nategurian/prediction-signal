"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PerformanceData {
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  equityCurve: { date: string; pnl: number }[];
  account: {
    startingBalance: number;
    currentBalance: number;
  };
}

function isPerformancePayload(
  x: unknown
): x is PerformanceData {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.totalPnl === "number" && typeof o.tradeCount === "number";
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-lg sm:text-xl font-mono font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(300);

  const load = useCallback(async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch(`/api/performance?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const json: unknown = await res.json();
      if (!res.ok || !isPerformancePayload(json)) {
        if (!res.ok) console.error("GET /api/performance failed:", res.status);
        return;
      }
      setData(json);
    } catch (err) {
      console.error("Failed to load performance:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [load]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setChartHeight(mq.matches ? 220 : 300);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading performance...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-zinc-500 text-center py-12">
        No performance data available.
      </div>
    );
  }

  const pnlColor =
    data.totalPnl > 0
      ? "text-emerald-400"
      : data.totalPnl < 0
        ? "text-red-400"
        : "text-zinc-400";

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl mb-4 sm:mb-6">Performance</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard label="Total P&L" value={`$${data.totalPnl.toFixed(2)}`} color={pnlColor} />
        <StatCard
          label="Realized P&L"
          value={`$${data.realizedPnl.toFixed(2)}`}
          color={data.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard
          label="Unrealized P&L"
          value={`$${data.unrealizedPnl.toFixed(2)}`}
          color={data.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard label="Trade Count" value={data.tradeCount.toString()} />
        <StatCard label="Win Rate" value={`${data.winRate}%`} />
        <StatCard label="Avg Win" value={`$${data.avgWin.toFixed(2)}`} color="text-emerald-400" />
        <StatCard label="Avg Loss" value={`$${data.avgLoss.toFixed(2)}`} color="text-red-400" />
        <StatCard label="Max Drawdown" value={`$${data.maxDrawdown.toFixed(2)}`} color="text-red-400" />
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 sm:p-6 overflow-x-auto">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Equity Curve</h2>
        {data.equityCurve.length === 0 ? (
          <div className="text-zinc-600 text-center py-8">
            No settled trades yet.
          </div>
        ) : (
          <div className="min-w-0 w-full" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={data.equityCurve} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 10 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                width={44}
                tick={{ fill: "#71717a", fontSize: 10 }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelFormatter={(v) => new Date(v).toLocaleString()}
                formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "P&L"]}
              />
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-6 bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline text-sm">
          <span className="text-zinc-500">Account Balance</span>
          <span className="font-mono tabular-nums break-all text-right">${data.account.currentBalance.toFixed(2)}</span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-baseline text-sm mt-3 sm:mt-1">
          <span className="text-zinc-500">Starting Balance</span>
          <span className="font-mono tabular-nums break-all text-right text-zinc-500">${data.account.startingBalance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
