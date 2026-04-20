"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="block px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
    >
      {children}
    </Link>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
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
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const closeNav = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur-sm md:hidden">
        <Link href="/" className="min-w-0 truncate text-base font-bold text-white">
          Prediction Signals
        </Link>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="shrink-0 rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={() => setMobileOpen((o) => !o)}
        >
          <MenuIcon open={mobileOpen} />
        </button>
      </header>

      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-zinc-800 bg-zinc-900 p-4 md:flex">
        <Link href="/" className="mb-1 px-4 text-lg font-bold text-white">
          Prediction Signals
        </Link>
        <Link
          href="/"
          className="mb-5 px-4 text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to site
        </Link>
        <NavLink href="/opportunities">Opportunities</NavLink>
        <NavLink href="/trades">Trades</NavLink>
        <NavLink href="/performance">Performance</NavLink>
        <NavLink href="/models">Models</NavLink>
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            aria-label="Close menu"
            onClick={closeNav}
          />
          <aside
            id="mobile-nav"
            className="fixed inset-y-0 left-0 z-[51] flex w-[min(17rem,88vw)] flex-col gap-1 overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-4 shadow-2xl md:hidden"
          >
            <div className="mb-4 px-4 text-lg font-bold text-white">Menu</div>
            <NavLink href="/opportunities" onNavigate={closeNav}>
              Opportunities
            </NavLink>
            <NavLink href="/trades" onNavigate={closeNav}>
              Trades
            </NavLink>
            <NavLink href="/performance" onNavigate={closeNav}>
              Performance
            </NavLink>
            <NavLink href="/models" onNavigate={closeNav}>
              Models
            </NavLink>
          </aside>
        </>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
