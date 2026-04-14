"use client";

import { useEffect, useState } from "react";

interface Opportunity {
  market: {
    id: string;
    ticker: string;
    title: string;
    market_date: string | null;
    threshold_value: number | null;
    market_structure: string;
    settlement_time: string | null;
  };
  yes_ask: number | null;
  no_ask: number | null;
  yes_bid: number | null;
  no_bid: number | null;
  modeled_yes_probability: number | null;
  modeled_no_probability: number | null;
  trade_edge_yes: number | null;
  trade_edge_no: number | null;
  confidence: number | null;
  signal_type: string | null;
  worth_trading: boolean;
  explanation: string | null;
}

function SignalBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-zinc-600 text-xs">—</span>;
  const colors: Record<string, string> = {
    BUY_YES: "bg-emerald-900/50 text-emerald-400 border-emerald-700",
    BUY_NO: "bg-red-900/50 text-red-400 border-red-700",
    NO_TRADE: "bg-zinc-800 text-zinc-500 border-zinc-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors[type] ?? colors.NO_TRADE}`}>
      {type}
    </span>
  );
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/opportunities");
        const data = await res.json();
        setOpportunities(data.opportunities ?? []);
      } catch (err) {
        console.error("Failed to load opportunities:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading opportunities...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold sm:text-2xl mb-4 sm:mb-6">Opportunities</h1>
      {opportunities.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">
          No active markets. Run the pipeline to fetch data.
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 touch-manipulation">
          <table className="w-full min-w-[56rem] text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="pb-3 pr-4 font-medium">Market</th>
                <th className="pb-3 pr-4 font-medium text-right">YES Ask</th>
                <th className="pb-3 pr-4 font-medium text-right">NO Ask</th>
                <th className="pb-3 pr-4 font-medium text-right">P(YES)</th>
                <th className="pb-3 pr-4 font-medium text-right">P(NO)</th>
                <th className="pb-3 pr-4 font-medium text-right">Edge YES</th>
                <th className="pb-3 pr-4 font-medium text-right">Edge NO</th>
                <th className="pb-3 pr-4 font-medium text-right">Confidence</th>
                <th className="pb-3 pr-4 font-medium">Signal</th>
                <th className="pb-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => (
                <tr key={opp.market.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{opp.market.title}</div>
                    <div className="text-xs text-zinc-600">{opp.market.ticker}</div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono">{pct(opp.yes_ask)}</td>
                  <td className="py-3 pr-4 text-right font-mono">{pct(opp.no_ask)}</td>
                  <td className="py-3 pr-4 text-right font-mono">{pct(opp.modeled_yes_probability)}</td>
                  <td className="py-3 pr-4 text-right font-mono">{pct(opp.modeled_no_probability)}</td>
                  <td className={`py-3 pr-4 text-right font-mono ${(opp.trade_edge_yes ?? 0) > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                    {pct(opp.trade_edge_yes)}
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono ${(opp.trade_edge_no ?? 0) > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                    {pct(opp.trade_edge_no)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono">{pct(opp.confidence)}</td>
                  <td className="py-3 pr-4">
                    <SignalBadge type={opp.signal_type} />
                  </td>
                  <td className="py-3 text-[11px] sm:text-xs text-zinc-500 max-w-[12rem] sm:max-w-xs truncate" title={opp.explanation ?? undefined}>
                    {opp.explanation ?? "—"}
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
