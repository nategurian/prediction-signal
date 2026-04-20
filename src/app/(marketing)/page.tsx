import Link from "next/link";
import { GradientBackground } from "@/components/marketing/GradientBackground";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProofBand />
      <Pillars />
      <DemoPreview />
      <Developers />
      <HowItWorks />
      <CtaBand />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-24 sm:pt-32 sm:pb-32">
      <GradientBackground variant="hero" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Now ingesting live Kalshi markets
          </span>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Prediction market alpha,{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-violet-300 bg-clip-text text-transparent">
              powered by AI,
            </span>{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-emerald-300 bg-clip-text text-transparent">
              driven by real data.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-zinc-400 sm:text-xl">
            Institutional-grade signals across prediction markets — delivered as a REST API and
            webhooks. Built on live order-book data, continuously recalibrated by our model stack.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="#cta"
              className="group inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-400 via-teal-300 to-violet-400 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_32px_-6px_rgba(139,92,246,0.65)] transition-transform hover:-translate-y-[1px]"
            >
              Request API access
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              See live demo
              <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATS: { value: string; label: string; accent: "emerald" | "violet" | "neutral" }[] = [
  { value: "1,200+", label: "Markets tracked daily", accent: "emerald" },
  { value: "8,400", label: "Signals / day peak", accent: "violet" },
  { value: "47 bps", label: "Avg edge on trades taken", accent: "emerald" },
  { value: "9", label: "Production models", accent: "violet" },
];

function ProofBand() {
  return (
    <section className="relative border-y border-zinc-800/70 bg-zinc-950/60">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid grid-cols-2 gap-6 sm:gap-10 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <div
                className={`text-3xl font-semibold tracking-tight sm:text-4xl ${
                  s.accent === "emerald"
                    ? "text-emerald-300"
                    : s.accent === "violet"
                    ? "text-violet-300"
                    : "text-white"
                }`}
              >
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PILLARS: {
  title: string;
  body: string;
  accent: "violet" | "emerald" | "mixed";
  icon: React.ReactNode;
}[] = [
  {
    title: "AI-native models",
    accent: "violet",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    body: "Frontier LLMs and custom forecasting models generate probabilistic views across events — then calibrate themselves as the market moves.",
  },
  {
    title: "Real market data",
    accent: "emerald",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-7" />
      </svg>
    ),
    body: "Live Kalshi order books, trade prints, and historical archives. No synthetic data, no backtest theatre — signals are generated on the book you'd actually trade.",
  },
  {
    title: "Institutional-grade",
    accent: "mixed",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
      </svg>
    ),
    body: "Sigma recalibration on cron. Full audit trail per signal. Performance and edge tracked per model — nothing hidden, nothing smoothed.",
  },
];

function Pillars() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Built like a quant shop. Priced like a dev tool.
          </h2>
          <p className="mt-4 text-zinc-400">
            Every layer of the stack is designed to be auditable, reproducible, and fast.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-700"
            >
              <div
                aria-hidden
                className={`absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl transition-opacity ${
                  p.accent === "violet"
                    ? "bg-violet-600/20 group-hover:bg-violet-600/30"
                    : p.accent === "emerald"
                    ? "bg-emerald-500/20 group-hover:bg-emerald-500/30"
                    : "bg-gradient-to-br from-emerald-500/20 to-violet-600/20 group-hover:opacity-100"
                }`}
              />
              <div
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border ${
                  p.accent === "violet"
                    ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                    : p.accent === "emerald"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-zinc-700 bg-gradient-to-br from-emerald-400/10 to-violet-500/10 text-white"
                }`}
              >
                {p.icon}
              </div>
              <h3 className="relative mt-5 text-lg font-semibold text-white">{p.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-zinc-400">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoPreview() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Live Demo
            </span>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              The same signals your API receives, visualized in real time.
            </h2>
            <p className="mt-4 text-zinc-400">
              Explore current opportunities, drill into individual trades, and audit model
              performance. The demo runs on live data — no mock, no replay.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/opportunities"
                className="group inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:border-emerald-400/50"
              >
                Opportunities
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/performance"
                className="group inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:border-violet-400/50"
              >
                Performance
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/models"
                className="group inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:border-zinc-500"
              >
                Models
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>

          <DemoMock />
        </div>
      </div>
    </section>
  );
}

function DemoMock() {
  const rows = [
    { m: "Fed rate hike — Q2", p: 0.31, f: 0.44, e: "+13.0", side: "YES" },
    { m: "BTC > $120k by Jun", p: 0.22, f: 0.29, e: "+7.2", side: "YES" },
    { m: "CPI > 3.2% (May)", p: 0.58, f: 0.49, e: "−9.1", side: "NO" },
    { m: "NVDA Q2 beat", p: 0.67, f: 0.74, e: "+6.8", side: "YES" },
    { m: "Tropical storm July", p: 0.41, f: 0.52, e: "+11.2", side: "YES" },
  ];
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-transparent to-violet-500/20 blur-2xl"
      />
      <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="ml-3 text-xs text-zinc-500">opportunities · live</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            streaming
          </span>
        </div>
        <div className="divide-y divide-zinc-800/70">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <div className="col-span-5">Market</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">Forecast</div>
            <div className="col-span-2 text-right">Edge</div>
            <div className="col-span-1 text-right">Side</div>
          </div>
          {rows.map((r) => {
            const positive = r.e.startsWith("+");
            return (
              <div key={r.m} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
                <div className="col-span-5 truncate text-zinc-200">{r.m}</div>
                <div className="col-span-2 text-right font-mono text-zinc-400">{r.p.toFixed(2)}</div>
                <div className="col-span-2 text-right font-mono text-white">{r.f.toFixed(2)}</div>
                <div
                  className={`col-span-2 text-right font-mono ${
                    positive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {r.e}
                </div>
                <div className="col-span-1 text-right">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.side === "YES"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-rose-400/15 text-rose-300"
                    }`}
                  >
                    {r.side}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Developers() {
  const payload = `{
  "event": "signal.created",
  "signal_id": "sig_9f2x7k1",
  "market": "KALSHI:FED-Q2-HIKE",
  "side": "YES",
  "price": 0.31,
  "forecast": 0.44,
  "edge_bps": 1300,
  "sigma": 0.08,
  "model": "ps-forecast-v3",
  "created_at": "2026-04-20T14:03:22Z"
}`;
  const curl = `curl https://api.predictionsignals.ai/v1/signals \\
  -H "Authorization: Bearer $PS_API_KEY" \\
  -H "Content-Type: application/json"`;

  return (
    <section id="developers" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
              Developers
            </span>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Drop signals into your stack in minutes.
            </h2>
            <p className="mt-4 text-zinc-400">
              Clean JSON. Stable schema. Signed webhooks. Whether you&apos;re running a Python
              backtester or a production execution engine, we fit.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["REST API", "Webhooks", "Signed requests", "JSON", "Stable schema", "SDKs (soon)"].map((chip) => (
                <span
                  key={chip}
                  className="inline-flex rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <CodeCard title="webhook → POST /your/endpoint" body={payload} accent="violet" />
            <CodeCard title="GET /v1/signals" body={curl} accent="emerald" />
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: "emerald" | "violet";
}) {
  const dot = accent === "emerald" ? "bg-emerald-400" : "bg-violet-400";
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-xs text-zinc-400">{title}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-zinc-200">
        <code>{body}</code>
      </pre>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Models generate forecasts",
    body: "Our model stack produces probabilistic views across every live market on the platform.",
    accent: "violet" as const,
  },
  {
    n: "02",
    title: "Signals get calibrated",
    body: "Sigma recalibration and edge checks run continuously against the live order book — no stale forecasts.",
    accent: "emerald" as const,
  },
  {
    n: "03",
    title: "Your system receives",
    body: "Pull via REST or push via webhook. Every signal is versioned, signed, and auditable end-to-end.",
    accent: "violet" as const,
  },
];

function HowItWorks() {
  return (
    <section className="relative border-t border-zinc-800/70 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-zinc-400">Three layers. One contract.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-xl border border-zinc-800 bg-zinc-900/40 p-6"
            >
              <div
                className={`text-xs font-mono tracking-widest ${
                  s.accent === "emerald" ? "text-emerald-400" : "text-violet-400"
                }`}
              >
                {s.n}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section id="cta" className="relative overflow-hidden py-24 sm:py-28">
      <GradientBackground variant="muted" />
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Get early API access.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-zinc-400">
          We&apos;re onboarding select teams ahead of the public launch. Tell us where to send your
          API key.
        </p>
        <div className="mt-10 flex justify-center">
          <WaitlistForm source="landing" />
        </div>
      </div>
    </section>
  );
}
