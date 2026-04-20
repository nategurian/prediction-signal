import Link from "next/link";

export const PRODUCT_NAME = "Prediction Signals";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white ${className}`}
    >
      <LogoMark />
      <span>{PRODUCT_NAME}</span>
    </Link>
  );
}

function LogoMark() {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-violet-500 shadow-[0_0_20px_-4px_rgba(52,211,153,0.55)]"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-zinc-950" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 11l3-4 3 2 5-6" />
        <path d="M11 3h2v2" />
      </svg>
    </span>
  );
}
