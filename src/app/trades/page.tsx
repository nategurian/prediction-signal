"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function MarketScheduleTooltip({ market }: { market: NonNullable<Trade["market"]> }) {
  const tipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const apply = () => setTapMode(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const positionFromTrigger = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (tapMode) {
      setCoords({ x: r.left + r.width / 2, y: r.bottom });
    } else {
      setCoords({ x: r.left + r.width / 2, y: r.top });
    }
  }, [tapMode]);

  const show = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    positionFromTrigger();
    setOpen(true);
  };

  const hideSoon = () => {
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      setCoords(null);
    }, 120);
  };

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => positionFromTrigger();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, positionFromTrigger]);

  useEffect(() => {
    if (!open || !tapMode) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      const tip = document.getElementById(tipId);
      if (tip?.contains(t)) return;
      setOpen(false);
      setCoords(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open, tapMode, tipId]);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    []
  );

  const tooltipTransform = tapMode
    ? "translate(-50%, 8px)"
    : "translate(-50%, calc(-100% - 10px))";

  const tooltip =
    open &&
    coords &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id={tipId}
        role="tooltip"
        className={`fixed z-[200] w-[17.5rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2.5 text-left text-xs shadow-xl shadow-black/40 backdrop-blur-sm ${
          tapMode ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          left: coords.x,
          top: coords.y,
          transform: tooltipTransform,
        }}
      >
        <p className="text-zinc-200 font-medium leading-snug mb-2 line-clamp-3" title={market.title}>
          {market.title}
        </p>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1.5 text-zinc-500">
          <dt className="text-zinc-600">Obs. date</dt>
          <dd className="font-mono text-zinc-400">{market.market_date ?? "—"}</dd>
          <dt className="text-zinc-600">Trading opens</dt>
          <dd className="text-zinc-400 tabular-nums">{fmtSchedule(market.open_time)}</dd>
          <dt className="text-zinc-600">Trading closes</dt>
          <dd className="text-zinc-400 tabular-nums">{fmtSchedule(market.close_time)}</dd>
          <dt className="text-zinc-600">Settles (sched.)</dt>
          <dd className="text-zinc-400 tabular-nums leading-tight">{fmtSchedule(market.settlement_time)}</dd>
        </dl>
        <p className="mt-2 pt-2 border-t border-zinc-800 text-[10px] text-zinc-600">
          Kalshi schedule · times in your locale
        </p>
      </div>,
      document.body
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="font-mono text-left text-zinc-300 border-b border-dotted border-zinc-500/50 hover:text-white hover:border-zinc-400 cursor-help bg-transparent p-0 max-w-[min(11rem,55vw)] sm:max-w-[11rem] truncate"
        onMouseEnter={tapMode ? undefined : show}
        onMouseLeave={tapMode ? undefined : hideSoon}
        onFocus={tapMode ? undefined : show}
        onBlur={tapMode ? undefined : hideSoon}
        onClick={
          tapMode
            ? (e) => {
                e.stopPropagation();
                if (open) {
                  setOpen(false);
                  setCoords(null);
                } else {
                  positionFromTrigger();
                  setOpen(true);
                }
              }
            : undefined
        }
        aria-describedby={open ? tipId : undefined}
        aria-expanded={tapMode ? open : undefined}
      >
        {market.ticker}
      </button>
      {tooltip}
    </>
  );
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
        <h1 className="text-xl font-bold sm:text-2xl">Trades</h1>
        <div className="flex flex-wrap gap-2">
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
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 touch-manipulation">
          <table className="w-full min-w-[52rem] text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="pb-3 pr-4 font-medium">Entry</th>
                <th className="pb-3 pr-4 font-medium w-[8.5rem]">
                  <span title="Hover ticker for Kalshi trading window and settlement schedule">Contract</span>
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
                  <td className="py-3 pr-4 text-xs text-zinc-400 whitespace-nowrap align-top">
                    <Link href={`/trades/${trade.id}`} className="hover:text-white transition-colors">
                      {new Date(trade.entry_time).toLocaleString()}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    {trade.market ? (
                      <MarketScheduleTooltip market={trade.market} />
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
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
