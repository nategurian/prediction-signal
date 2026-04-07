"use client";

import { useEffect, useState } from "react";
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
      <div className={`text-xl font-mono font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/performance", { cache: "no-store" });
        setData(await res.json());
      } catch (err) {
        console.error("Failed to load performance:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
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
      <h1 className="text-2xl font-bold mb-6">Performance</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Equity Curve</h2>
        {data.equityCurve.length === 0 ? (
          <div className="text-zinc-600 text-center py-8">
            No settled trades yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString()}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
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
        )}
      </div>

      <div className="mt-6 bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Account Balance</span>
          <span className="font-mono">${data.account.currentBalance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-zinc-500">Starting Balance</span>
          <span className="font-mono text-zinc-500">${data.account.startingBalance.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
