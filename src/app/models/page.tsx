"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MODEL_CHANGELOG, type ModelCategory, type ModelChange } from "@/lib/models/changelog";

const CATEGORY_LABEL: Record<ModelCategory, string> = {
  "initial": "Launch",
  "signal-logic": "Signal logic",
  "calibration": "Calibration",
  "polarity": "Polarity",
  "config": "Config",
  "infra": "Infra",
};

const CATEGORY_STYLES: Record<ModelCategory, string> = {
  "initial": "bg-sky-500/10 text-sky-300 border-sky-500/30",
  "signal-logic": "bg-amber-500/10 text-amber-300 border-amber-500/30",
  "calibration": "bg-violet-500/10 text-violet-300 border-violet-500/30",
  "polarity": "bg-rose-500/10 text-rose-300 border-rose-500/30",
  "config": "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  "infra": "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
};

function formatDeployedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function VersionCard({ model, isLatest }: { model: ModelChange; isLatest: boolean }) {
  return (
    <article
      id={model.slug}
      className="scroll-mt-24 rounded-lg border border-zinc-800 bg-zinc-900 p-5 target:ring-2 target:ring-amber-500/40"
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`#${model.slug}`}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-300"
            aria-label={`Link to ${model.slug}`}
          >
            #
          </Link>
          <h2 className="text-lg font-bold tracking-tight">
            <span className="font-mono text-amber-300">{model.slug}</span>
            <span className="ml-2 text-zinc-500 font-normal text-sm font-mono">
              {model.version}
            </span>
          </h2>
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CATEGORY_STYLES[model.category]}`}
          >
            {CATEGORY_LABEL[model.category]}
          </span>
          {isLatest && (
            <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              Current
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono tabular-nums">
          {formatDeployedAt(model.deployedAt)}
        </div>
      </header>

      <h3 className="mt-2 text-base font-semibold text-white">{model.title}</h3>
      <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{model.summary}</p>

      <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
        {model.changes.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-zinc-600 select-none">•</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function ModelsPage() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash?.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const latestVersion = MODEL_CHANGELOG[0]?.version;

  return (
    <div className="max-w-3xl">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold sm:text-2xl">Models</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Release notes for every model version. The performance chart on{" "}
          <Link href="/performance" className="text-amber-300 hover:underline">
            /performance
          </Link>{" "}
          marks each deploy — hover any date on the equity curve to see which
          model was active and jump to its changes here.
        </p>
      </header>

      <nav
        aria-label="Version jump"
        className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
      >
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 px-1">
          Jump to
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODEL_CHANGELOG.map((m) => (
            <Link
              key={m.slug}
              href={`#${m.slug}`}
              className="font-mono text-xs rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
            >
              {m.slug}
            </Link>
          ))}
        </div>
      </nav>

      <div className="space-y-4">
        {MODEL_CHANGELOG.map((m) => (
          <VersionCard key={m.version} model={m} isLatest={m.version === latestVersion} />
        ))}
      </div>
    </div>
  );
}
