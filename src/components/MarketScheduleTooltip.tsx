"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MarketForTooltip {
  ticker: string;
  title: string;
  market_date: string | null;
  open_time: string | null;
  close_time: string | null;
  settlement_time: string | null;
}

function fmtSchedule(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/** Ticker pill that pops a tooltip with Kalshi trading window & settlement schedule. */
export function MarketScheduleTooltip({ market }: { market: MarketForTooltip }) {
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
