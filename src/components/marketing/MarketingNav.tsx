"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const NAV_LINKS = [
  { href: "/products", label: "Products" },
  { href: "/opportunities", label: "Live Demo" },
  { href: "#developers", label: "Developers" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 ${
        scrolled
          ? "border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/opportunities"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="#cta"
            className="group relative inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-emerald-400 via-teal-300 to-violet-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(139,92,246,0.6)] transition-transform hover:-translate-y-[1px]"
          >
            Request API access
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <>
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </>
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/opportunities"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="#cta"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-gradient-to-r from-emerald-400 via-teal-300 to-violet-400 px-3.5 py-2 text-sm font-semibold text-zinc-950"
            >
              Request API access
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
