"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { findActiveModelAt, type ModelCategory } from "@/lib/models/changelog";

interface ModelTransition {
  version: string;
  slug: string;
  deployedAt: string;
  title: string;
  category: ModelCategory;
}

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
  modelTransitions?: ModelTransition[];
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

const CATEGORY_DOT: Record<ModelCategory, string> = {
  "initial": "bg-sky-400",
  "signal-logic": "bg-amber-400",
  "calibration": "bg-violet-400",
  "polarity": "bg-rose-400",
  "config": "bg-emerald-400",
  "infra": "bg-zinc-400",
};

interface RechartsTooltipProps {
  active?: boolean;
  label?: number | string;
  payload?: Array<{ value: number | string }>;
}

function EquityTooltip({ active, label, payload }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const ts = typeof label === "number" ? label : new Date(label ?? 0).getTime();
  if (!Number.isFinite(ts)) return null;
  const pnl = Number(payload[0]?.value ?? 0);
  const activeModel = findActiveModelAt(ts);
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      <div className="font-mono tabular-nums text-zinc-300">
        {new Date(ts).toLocaleString()}
      </div>
      <div className="mt-0.5 font-mono tabular-nums">
        <span className="text-zinc-500">P&amp;L </span>
        <span className={pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
          ${pnl.toFixed(2)}
        </span>
      </div>
      {activeModel && (
        <div className="mt-2 pt-2 border-t border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Active model
          </div>
          <Link
            href={`/models#${activeModel.slug}`}
            className="mt-0.5 inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 hover:underline"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[activeModel.category]}`} />
            <span className="font-mono font-bold">{activeModel.slug}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-300">{activeModel.title}</span>
            <span className="text-zinc-500">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function ModelTimelineStrip({
  transitions,
  rangeStart,
  rangeEnd,
}: {
  transitions: ModelTransition[];
  rangeStart: number;
  rangeEnd: number;
}) {
  if (transitions.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
        Model timeline
      </div>
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => {
          const ts = new Date(t.deployedAt).getTime();
          const inRange = ts >= rangeStart && ts <= rangeEnd;
          return (
            <Link
              key={t.version}
              href={`/models#${t.slug}`}
              className={`group inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                inRange
                  ? "border-zinc-700 bg-zinc-900 hover:border-amber-500/60 hover:bg-zinc-800"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
              }`}
              title={`Deployed ${new Date(t.deployedAt).toLocaleString()}`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[t.category]}`} />
              <span className="font-mono font-bold text-amber-300 group-hover:text-amber-200">
                {t.slug}
              </span>
              <span className="text-zinc-400 group-hover:text-zinc-200">
                {t.title}
              </span>
              <span className="text-zinc-500 font-mono tabular-nums text-[10px]">
                {new Date(t.deployedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          );
        })}
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

  const timedCurve = useMemo(
    () =>
      (data?.equityCurve ?? []).map((p) => ({
        ts: new Date(p.date).getTime(),
        pnl: p.pnl,
      })),
    [data?.equityCurve]
  );

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
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-sm font-medium text-zinc-400">Equity Curve</h2>
          <Link
            href="/models"
            className="text-xs text-zinc-500 hover:text-amber-300 hover:underline"
          >
            Models changelog →
          </Link>
        </div>
        {timedCurve.length === 0 ? (
          <div className="text-zinc-600 text-center py-8">
            No settled trades yet.
          </div>
        ) : (
          (() => {
            const GREEN = "#34d399";
            const RED = "#f87171";
            const values = timedCurve.map((p) => p.pnl);
            const baseline = values[0];
            const minVal = Math.min(...values);
            const maxVal = Math.max(...values);
            const minTs = timedCurve[0].ts;
            const maxTs = timedCurve[timedCurve.length - 1].ts;
            // splitRatio: fraction (0..1) down the line's vertical bounding box
            // where the baseline sits. Above baseline → green; below → red.
            let splitRatio: number;
            if (maxVal === minVal) {
              splitRatio = 1;
            } else if (baseline >= maxVal) {
              splitRatio = 0;
            } else if (baseline <= minVal) {
              splitRatio = 1;
            } else {
              splitRatio = (maxVal - baseline) / (maxVal - minVal);
            }

            // Only annotate the chart with transitions that fall inside the
            // visible equity-curve window. Out-of-range transitions still
            // render in the timeline strip below but won't pollute the chart.
            const visibleTransitions = (data.modelTransitions ?? []).filter((t) => {
              const ts = new Date(t.deployedAt).getTime();
              return ts >= minTs && ts <= maxTs;
            });

            return (
              <>
                <div className="min-w-0 w-full" style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={timedCurve} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={0} stopColor={GREEN} />
                          <stop offset={splitRatio} stopColor={GREEN} />
                          <stop offset={splitRatio} stopColor={RED} />
                          <stop offset={1} stopColor={RED} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={[minTs, maxTs]}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        }
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        width={44}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip content={<EquityTooltip />} />
                      <ReferenceLine
                        y={baseline}
                        stroke="#52525b"
                        strokeDasharray="2 4"
                        ifOverflow="extendDomain"
                      />
                      {visibleTransitions.map((t, i) => (
                        <ReferenceLine
                          key={t.version}
                          x={new Date(t.deployedAt).getTime()}
                          stroke="#f59e0b"
                          strokeOpacity={0.55}
                          strokeDasharray="3 3"
                          ifOverflow="extendDomain"
                          label={{
                            value: t.slug,
                            position: i % 2 === 0 ? "insideTopRight" : "insideBottomRight",
                            fill: "#fbbf24",
                            fontSize: 10,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        />
                      ))}
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="url(#equityGradient)"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <ModelTimelineStrip
                  transitions={data.modelTransitions ?? []}
                  rangeStart={minTs}
                  rangeEnd={maxTs}
                />
              </>
            );
          })()
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
