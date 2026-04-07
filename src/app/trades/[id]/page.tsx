"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface TradeDetail {
  trade: {
    id: string;
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
    notes: string | null;
  };
  postmortem: {
    outcome_label: string;
    summary: string;
    reason_codes_json: string[] | null;
  } | null;
  settlement: {
    outcome: string;
    settlement_value: number;
    settled_at: string;
  } | null;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-zinc-800">
      <span className="text-zinc-500 text-sm">{label}</span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}

export default function TradeDetailPage() {
  const params = useParams();
  const [data, setData] = useState<TradeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/trades/${params.id}`, { cache: "no-store" });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to load trade:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading trade...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-zinc-500 text-center py-12">Trade not found.</div>
    );
  }

  const { trade, postmortem, settlement } = data;
  const pnl = trade.realized_pnl ?? trade.unrealized_pnl;
  const pnlColor = pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-zinc-400";

  return (
    <div className="max-w-2xl">
      <Link href="/trades" className="text-zinc-500 hover:text-white text-sm mb-4 inline-block">
        ← Back to Trades
      </Link>

      <h1 className="text-2xl font-bold mb-6">Trade Detail</h1>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Trade Info</h2>
        <InfoRow label="Side" value={<span className={trade.side === "YES" ? "text-emerald-400" : "text-red-400"}>{trade.side}</span>} />
        <InfoRow label="Quantity" value={trade.quantity} />
        <InfoRow label="Entry Price" value={`${(trade.entry_price * 100).toFixed(0)}¢`} />
        <InfoRow label="Entry Time" value={new Date(trade.entry_time).toLocaleString()} />
        <InfoRow label="Status" value={trade.status} />
        {trade.exit_price != null && (
          <InfoRow label="Exit Price" value={`${(trade.exit_price * 100).toFixed(0)}¢`} />
        )}
        {trade.exit_time && (
          <InfoRow label="Exit Time" value={new Date(trade.exit_time).toLocaleString()} />
        )}
        <InfoRow
          label="P&L"
          value={<span className={pnlColor}>${pnl.toFixed(2)}</span>}
        />
      </div>

      {settlement && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Settlement</h2>
          <InfoRow label="Outcome" value={settlement.outcome} />
          <InfoRow label="Settlement Value" value={settlement.settlement_value} />
          <InfoRow label="Settled At" value={new Date(settlement.settled_at).toLocaleString()} />
        </div>
      )}

      {postmortem && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Postmortem</h2>
          <div className="mb-3">
            <span className={`text-xs px-2 py-0.5 rounded border ${
              postmortem.outcome_label === "winner"
                ? "bg-emerald-900/50 text-emerald-400 border-emerald-700"
                : "bg-red-900/50 text-red-400 border-red-700"
            }`}>
              {postmortem.outcome_label}
            </span>
          </div>
          <p className="text-sm text-zinc-300 mb-3">{postmortem.summary}</p>
          {postmortem.reason_codes_json && postmortem.reason_codes_json.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {postmortem.reason_codes_json.map((code) => (
                <span key={code} className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-500">
                  {code}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
