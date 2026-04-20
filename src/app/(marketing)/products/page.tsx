import Link from "next/link";
import type { Metadata } from "next";
import { GradientBackground } from "@/components/marketing/GradientBackground";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export const metadata: Metadata = {
  title: "Products — Prediction Signals",
  description:
    "The Prediction Signals product line: Signal API, Strategy Vault, and Terminal. Coming soon.",
};

type Product = {
  name: string;
  tagline: string;
  body: string;
  status: "Coming soon" | "Live Demo";
  accent: "emerald" | "violet" | "mixed";
  href?: string;
  features: string[];
};

const PRODUCTS: Product[] = [
  {
    name: "Signal API",
    tagline: "REST + webhooks",
    body: "Programmatic access to every signal we generate. Pull on demand, or receive signed webhook pushes the moment a signal crosses threshold.",
    status: "Coming soon",
    accent: "violet",
    features: ["Signed webhook delivery", "Stable versioned schema", "Per-model edge metadata", "Replay + backfill"],
  },
  {
    name: "Strategy Vault",
    tagline: "Curated strategies",
    body: "Pre-built strategy bundles on top of the raw signal feed — sized, hedged, and performance-tracked. For teams who want edge without the plumbing.",
    status: "Coming soon",
    accent: "mixed",
    features: ["Sizing + risk built-in", "Live performance attribution", "Per-strategy webhooks", "Paper-trade mode"],
  },
  {
    name: "Terminal",
    tagline: "The browser UI",
    body: "Our internal terminal for exploring opportunities, drilling into trades, and monitoring model performance — available today as a live demo.",
    status: "Live Demo",
    accent: "emerald",
    href: "/opportunities",
    features: ["Live opportunities board", "Per-trade deep dives", "Model performance tracking", "Read-only for now"],
  },
];

export default function ProductsPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-20">
        <GradientBackground variant="muted" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400">
            Products
          </span>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Three products.{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-violet-300 bg-clip-text text-transparent">
              One signal layer.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            We&apos;re building the full stack for prediction-market alpha — from the raw signal
            feed to curated strategies to the terminal you monitor it all in.
          </p>
        </div>
      </section>

      <section className="relative pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.name} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-zinc-800/70 py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Want to know when these ship?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Drop your email. We&apos;ll only reach out with product updates.
          </p>
          <div className="mt-8 flex justify-center">
            <WaitlistForm source="products" />
          </div>
        </div>
      </section>
    </>
  );
}

function ProductCard({ product }: { product: Product }) {
  const isLive = product.status === "Live Demo";
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-700">
      <div
        aria-hidden
        className={`absolute -top-28 -right-20 h-60 w-60 rounded-full blur-3xl transition-opacity ${
          product.accent === "violet"
            ? "bg-violet-600/20"
            : product.accent === "emerald"
            ? "bg-emerald-500/20"
            : "bg-gradient-to-br from-emerald-500/20 to-violet-600/20"
        }`}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">{product.tagline}</div>
          <h3 className="mt-1 text-xl font-semibold text-white">{product.name}</h3>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            isLive
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-zinc-700 bg-zinc-800/70 text-zinc-400"
          }`}
        >
          {product.status}
        </span>
      </div>
      <p className="relative mt-4 text-sm leading-relaxed text-zinc-400">{product.body}</p>
      <ul className="relative mt-5 space-y-2 text-sm text-zinc-300">
        {product.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                product.accent === "violet"
                  ? "bg-violet-400"
                  : product.accent === "emerald"
                  ? "bg-emerald-400"
                  : "bg-gradient-to-br from-emerald-400 to-violet-400"
              }`}
            />
            <span className="text-zinc-400">{f}</span>
          </li>
        ))}
      </ul>
      <div className="relative mt-6">
        {isLive && product.href ? (
          <Link
            href={product.href}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            Open demo <span aria-hidden>→</span>
          </Link>
        ) : (
          <span className="text-sm text-zinc-500">Join the waitlist below</span>
        )}
      </div>
    </div>
  );
}
