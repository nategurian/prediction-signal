"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Trade {
  id: string;
  market_id: string;
  side: string;
  quantity: number;
  entry_time: string;
  entry_price: number;
  current_mark_price: number | null;
  exit_time: string | null;
  exit_price: number | null;
  status: string;
  unrealized_pnl: number;
  realized_pnl: number | null;
  market: {
    ticker: string;
    title: string;
    market_date: string | null;
    open_time: string | null;
    close_time: string | null;
    settlement_time: string | null;
  } | null;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-blue-900/50 text-blue-400 border-blue-700",
    settled: "bg-zinc-800 text-zinc-400 border-zinc-700",
    cancelled: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors[status] ?? colors.open}`}>
      {status}
    </span>
  );
}

function PnlDisplay({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  const color = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-zinc-500";
  return <span className={`font-mono ${color}`}>${value.toFixed(2)}</span>;
}

function fmtSchedule(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "settled">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trades", { cache: "no-store" });
        const data = await res.json();
        setTrades(data.trades ?? []);
      } catch (err) {
        console.error("Failed to load trades:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === "all" ? trades : trades.filter((t) => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading trades...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Trades</h1>
        <div className="flex gap-2">
          {(["all", "open", "settled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                filter === f
                  ? "bg-zinc-700 text-white border-zinc-600"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No trades found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="pb-3 pr-4 font-medium">Entry Time</th>
                <th className="pb-3 pr-4 font-medium text-xs">Obs. date</th>
                <th className="pb-3 pr-4 font-medium text-xs max-w-[7.5rem]" title="From Kalshi (contract open)">
                  Trading opens
                </th>
                <th className="pb-3 pr-4 font-medium text-xs max-w-[7.5rem]" title="Last time to trade this contract">
                  Trading closes
                </th>
                <th
                  className="pb-3 pr-4 font-medium text-xs max-w-[8rem]"
                  title="Kalshi scheduled expiration / latest resolution window"
                >
                  Settles (sched.)
                </th>
                <th className="pb-3 pr-4 font-medium">Side</th>
                <th className="pb-3 pr-4 font-medium text-right">Qty</th>
                <th className="pb-3 pr-4 font-medium text-right">Entry</th>
                <th className="pb-3 pr-4 font-medium text-right">Current/Exit</th>
                <th className="pb-3 pr-4 font-medium text-right">Unrealized</th>
                <th className="pb-3 pr-4 font-medium text-right">Realized</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trade) => (
                <tr key={trade.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-3 pr-4 text-xs text-zinc-400">
                    <Link href={`/trades/${trade.id}`} className="hover:text-white transition-colors block">
                      {new Date(trade.entry_time).toLocaleString()}
                      {trade.market?.ticker && (
                        <span className="block text-zinc-600 font-mono mt-0.5 truncate max-w-[10rem]">
                          {trade.market.ticker}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-400 font-mono whitespace-nowrap">
                    {trade.market?.market_date ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500 max-w-[7.5rem] whitespace-nowrap">
                    {fmtSchedule(trade.market?.open_time ?? null)}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500 max-w-[7.5rem] whitespace-nowrap">
                    {fmtSchedule(trade.market?.close_time ?? null)}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500 max-w-[8rem] whitespace-nowrap">
                    {fmtSchedule(trade.market?.settlement_time ?? null)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={trade.side === "YES" ? "text-emerald-400" : "text-red-400"}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono">{trade.quantity}</td>
                  <td className="py-3 pr-4 text-right font-mono">{(trade.entry_price * 100).toFixed(0)}¢</td>
                  <td className="py-3 pr-4 text-right font-mono">
                    {trade.exit_price != null
                      ? `${(trade.exit_price * 100).toFixed(0)}¢`
                      : trade.current_mark_price != null
                        ? `${(trade.current_mark_price * 100).toFixed(0)}¢`
                        : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <PnlDisplay value={trade.status === "open" ? trade.unrealized_pnl : null} />
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <PnlDisplay value={trade.realized_pnl} />
                  </td>
                  <td className="py-3">
                    <StatusBadge status={trade.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
