"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MarketScheduleTooltip,
  type MarketForTooltip,
} from "@/components/MarketScheduleTooltip";

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
  market: (MarketForTooltip & {
    city_key: string | null;
    market_structure: "binary_threshold" | "bucket_range" | null;
    threshold_direction: "greater" | "less" | null;
  }) | null;
  signal: {
    model_version: string | null;
    signal_type: string | null;
    modeled_yes_probability: number | null;
    confidence_score: number | null;
    trade_edge_yes: number | null;
    trade_edge_no: number | null;
  } | null;
}

type SortField =
  | "entry_time"
  | "entry_price"
  | "unrealized_pnl"
  | "realized_pnl"
  | "quantity"
  | "modeled_yes"
  | "confidence";

type SortDir = "asc" | "desc";

interface Filters {
  status: "all" | "open" | "settled" | "cancelled";
  side: "all" | "YES" | "NO";
  city: string;
  structure: "all" | "binary_threshold" | "bucket_range";
  model: string;
  q: string;
  sortField: SortField;
  sortDir: SortDir;
}

const DEFAULT_FILTERS: Filters = {
  status: "all",
  side: "all",
  city: "all",
  structure: "all",
  model: "all",
  q: "",
  sortField: "entry_time",
  sortDir: "desc",
};

function parseFilters(sp: URLSearchParams): Filters {
  const status = sp.get("status");
  const side = sp.get("side");
  const structure = sp.get("structure");
  const sort = sp.get("sort");
  const [sortFieldRaw, sortDirRaw] = (sort ?? "").split(":");
  const validFields: SortField[] = [
    "entry_time",
    "entry_price",
    "unrealized_pnl",
    "realized_pnl",
    "quantity",
    "modeled_yes",
    "confidence",
  ];
  const sortField = (validFields as string[]).includes(sortFieldRaw)
    ? (sortFieldRaw as SortField)
    : DEFAULT_FILTERS.sortField;
  const sortDir: SortDir = sortDirRaw === "asc" ? "asc" : "desc";
  return {
    status:
      status === "open" || status === "settled" || status === "cancelled"
        ? status
        : "all",
    side: side === "YES" || side === "NO" ? side : "all",
    city: sp.get("city") ?? "all",
    structure:
      structure === "binary_threshold" || structure === "bucket_range"
        ? structure
        : "all",
    model: sp.get("model") ?? "all",
    q: sp.get("q") ?? "",
    sortField,
    sortDir,
  };
}

function buildSearchString(f: Filters): string {
  const params = new URLSearchParams();
  if (f.status !== "all") params.set("status", f.status);
  if (f.side !== "all") params.set("side", f.side);
  if (f.city !== "all") params.set("city", f.city);
  if (f.structure !== "all") params.set("structure", f.structure);
  if (f.model !== "all") params.set("model", f.model);
  if (f.q.trim()) params.set("q", f.q.trim());
  const sortKey = `${f.sortField}:${f.sortDir}`;
  const defaultSort = `${DEFAULT_FILTERS.sortField}:${DEFAULT_FILTERS.sortDir}`;
  if (sortKey !== defaultSort) params.set("sort", sortKey);
  const s = params.toString();
  return s ? `?${s}` : "";
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

function shortModel(v: string | null): string {
  if (!v) return "—";
  const m = v.match(/_v(\d+)/);
  return m ? `v${m[1]}` : v;
}

function CityBadge({ city }: { city: string | null }) {
  if (!city) return <span className="text-zinc-600">—</span>;
  const label = city === "nyc" ? "NYC" : city === "miami" ? "MIA" : city.toUpperCase();
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
      {label}
    </span>
  );
}

function StructureBadge({ structure }: { structure: string | null }) {
  if (!structure) return null;
  const label = structure === "binary_threshold" ? "bin" : "bkt";
  return (
    <span
      className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700"
      title={structure}
    >
      {label}
    </span>
  );
}

interface FilterPillProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}

function FilterPillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterPillProps<T>) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              value === o.value
                ? "bg-zinc-700 text-white border-zinc-600"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  field,
  currentField,
  currentDir,
  align = "left",
  onToggle,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  align?: "left" | "right";
  onToggle: (field: SortField) => void;
}) {
  const active = field === currentField;
  const arrow = active ? (currentDir === "desc" ? "▼" : "▲") : "";
  return (
    <th
      className={`pb-3 pr-4 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onToggle(field)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? "text-zinc-200" : "hover:text-zinc-300"
        }`}
      >
        {label}
        <span className="text-[9px] w-2 inline-block">{arrow}</span>
      </button>
    </th>
  );
}

function SummaryBar({ trades }: { trades: Trade[] }) {
  const openTrades = trades.filter((t) => t.status === "open");
  const settledTrades = trades.filter((t) => t.status === "settled");
  const unrealizedTotal = openTrades.reduce((a, t) => a + (t.unrealized_pnl ?? 0), 0);
  const realizedTotal = settledTrades.reduce((a, t) => a + (t.realized_pnl ?? 0), 0);
  const wins = settledTrades.filter((t) => (t.realized_pnl ?? 0) > 0).length;
  const winRate = settledTrades.length > 0 ? wins / settledTrades.length : null;

  const stats: Array<{ label: string; value: React.ReactNode; tone?: "pnl" }> = [
    { label: "Showing", value: <span className="font-mono">{trades.length}</span> },
    { label: "Open", value: <span className="font-mono">{openTrades.length}</span> },
    {
      label: "Settled",
      value: <span className="font-mono">{settledTrades.length}</span>,
    },
    {
      label: "Unrealized",
      value: <PnlDisplay value={openTrades.length > 0 ? unrealizedTotal : null} />,
      tone: "pnl",
    },
    {
      label: "Realized",
      value: <PnlDisplay value={settledTrades.length > 0 ? realizedTotal : null} />,
      tone: "pnl",
    },
    {
      label: "Win rate",
      value:
        winRate != null ? (
          <span className="font-mono">
            {(winRate * 100).toFixed(0)}%
            <span className="text-zinc-600 ml-1 text-xs">
              ({wins}/{settledTrades.length})
            </span>
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {s.label}
          </span>
          <div className="text-sm">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function TradesPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const setFilters = useCallback(
    (update: Partial<Filters>) => {
      const next = { ...filters, ...update };
      router.replace(`${pathname}${buildSearchString(next)}`, { scroll: false });
    },
    [filters, pathname, router]
  );

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

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) if (t.market?.city_key) set.add(t.market.city_key);
    return Array.from(set).sort();
  }, [trades]);

  const availableModels = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) if (t.signal?.model_version) set.add(t.signal.model_version);
    return Array.from(set).sort().reverse();
  }, [trades]);

  const filteredSorted = useMemo(() => {
    const q = filters.q.toLowerCase();
    let rows = trades;
    if (filters.status !== "all") rows = rows.filter((t) => t.status === filters.status);
    if (filters.side !== "all") rows = rows.filter((t) => t.side === filters.side);
    if (filters.city !== "all") rows = rows.filter((t) => t.market?.city_key === filters.city);
    if (filters.structure !== "all") {
      rows = rows.filter((t) => t.market?.market_structure === filters.structure);
    }
    if (filters.model !== "all") {
      rows = rows.filter((t) => t.signal?.model_version === filters.model);
    }
    if (q) {
      rows = rows.filter(
        (t) =>
          t.market?.ticker.toLowerCase().includes(q) ||
          t.market?.title.toLowerCase().includes(q)
      );
    }

    const cmp = (a: Trade, b: Trade): number => {
      const dir = filters.sortDir === "asc" ? 1 : -1;
      const getVal = (t: Trade): number | string | null => {
        switch (filters.sortField) {
          case "entry_time":
            return t.entry_time;
          case "entry_price":
            return t.entry_price;
          case "unrealized_pnl":
            return t.status === "open" ? t.unrealized_pnl : null;
          case "realized_pnl":
            return t.realized_pnl;
          case "quantity":
            return t.quantity;
          case "modeled_yes":
            return t.signal?.modeled_yes_probability ?? null;
          case "confidence":
            return t.signal?.confidence_score ?? null;
          default:
            return null;
        }
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      return ((av as number) - (bv as number)) * dir;
    };

    return [...rows].sort(cmp);
  }, [trades, filters]);

  const toggleSort = (field: SortField) => {
    if (filters.sortField === field) {
      setFilters({ sortDir: filters.sortDir === "desc" ? "asc" : "desc" });
    } else {
      setFilters({ sortField: field, sortDir: "desc" });
    }
  };

  const hasActiveFilters =
    filters.status !== "all" ||
    filters.side !== "all" ||
    filters.city !== "all" ||
    filters.structure !== "all" ||
    filters.model !== "all" ||
    filters.q !== "";

  const clearAll = () => {
    router.replace(pathname, { scroll: false });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading trades...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 className="text-xl font-bold sm:text-2xl">Trades</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value })}
            placeholder="Search ticker or title…"
            className="flex-1 sm:w-64 text-xs px-3 py-1.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="shrink-0 text-xs px-2.5 py-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <SummaryBar trades={filteredSorted} />

      <div className="flex flex-col gap-2.5 mb-4">
        <FilterPillGroup
          label="Status"
          value={filters.status}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "settled", label: "Settled" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          onChange={(v) => setFilters({ status: v })}
        />
        <FilterPillGroup
          label="Side"
          value={filters.side}
          options={[
            { value: "all", label: "All" },
            { value: "YES", label: "YES" },
            { value: "NO", label: "NO" },
          ]}
          onChange={(v) => setFilters({ side: v })}
        />
        {availableCities.length > 1 && (
          <FilterPillGroup
            label="City"
            value={filters.city}
            options={[
              { value: "all", label: "All" },
              ...availableCities.map((c) => ({
                value: c,
                label: c === "nyc" ? "NYC" : c === "miami" ? "Miami" : c,
              })),
            ]}
            onChange={(v) => setFilters({ city: v })}
          />
        )}
        <FilterPillGroup
          label="Type"
          value={filters.structure}
          options={[
            { value: "all", label: "All" },
            { value: "binary_threshold", label: "Binary" },
            { value: "bucket_range", label: "Bucket" },
          ]}
          onChange={(v) => setFilters({ structure: v })}
        />
        {availableModels.length > 1 && (
          <FilterPillGroup
            label="Model"
            value={filters.model}
            options={[
              { value: "all", label: "All" },
              ...availableModels.map((m) => ({ value: m, label: shortModel(m) })),
            ]}
            onChange={(v) => setFilters({ model: v })}
          />
        )}
      </div>

      {filteredSorted.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">
          {trades.length === 0 ? "No trades found." : "No trades match these filters."}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 touch-manipulation">
          <table className="w-full min-w-[64rem] text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <SortableTh
                  label="Entry"
                  field="entry_time"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  onToggle={toggleSort}
                />
                <th className="pb-3 pr-4 font-medium w-[11rem]">
                  <span title="Hover ticker for Kalshi trading window and settlement schedule">
                    Contract
                  </span>
                </th>
                <th className="pb-3 pr-4 font-medium">Side</th>
                <SortableTh
                  label="Qty"
                  field="quantity"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <SortableTh
                  label="Entry"
                  field="entry_price"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <th className="pb-3 pr-4 font-medium text-right">Current/Exit</th>
                <SortableTh
                  label="Model pYes"
                  field="modeled_yes"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <SortableTh
                  label="Conf"
                  field="confidence"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <SortableTh
                  label="Unrealized"
                  field="unrealized_pnl"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <SortableTh
                  label="Realized"
                  field="realized_pnl"
                  currentField={filters.sortField}
                  currentDir={filters.sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
                <th className="pb-3 pr-4 font-medium">Model</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((trade) => (
                <tr key={trade.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-3 pr-4 text-xs text-zinc-400 whitespace-nowrap align-top">
                    <Link
                      href={`/trades/${trade.id}`}
                      className="hover:text-white transition-colors"
                    >
                      {new Date(trade.entry_time).toLocaleString()}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    {trade.market ? (
                      <div className="flex flex-col gap-1 items-start">
                        <MarketScheduleTooltip market={trade.market} />
                        <div className="flex items-center">
                          <CityBadge city={trade.market.city_key} />
                          <StructureBadge structure={trade.market.market_structure} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={trade.side === "YES" ? "text-emerald-400" : "text-red-400"}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono">{trade.quantity}</td>
                  <td className="py-3 pr-4 text-right font-mono">
                    {(trade.entry_price * 100).toFixed(0)}¢
                  </td>
                  <td className="py-3 pr-4 text-right font-mono">
                    {trade.exit_price != null
                      ? `${(trade.exit_price * 100).toFixed(0)}¢`
                      : trade.current_mark_price != null
                        ? `${(trade.current_mark_price * 100).toFixed(0)}¢`
                        : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-zinc-400">
                    {trade.signal?.modeled_yes_probability != null
                      ? `${(trade.signal.modeled_yes_probability * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-zinc-400">
                    {trade.signal?.confidence_score != null
                      ? trade.signal.confidence_score.toFixed(2)
                      : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <PnlDisplay
                      value={trade.status === "open" ? trade.unrealized_pnl : null}
                    />
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <PnlDisplay value={trade.realized_pnl} />
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="font-mono text-[11px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800"
                      title={trade.signal?.model_version ?? undefined}
                    >
                      {shortModel(trade.signal?.model_version ?? null)}
                    </span>
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

export default function TradesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="text-zinc-500">Loading trades...</div>
        </div>
      }
    >
      <TradesPageInner />
    </Suspense>
  );
}
