import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Prediction Signals",
  description: "Prediction market signal platform",
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        <div className="flex min-h-screen">
          <aside className="w-56 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col gap-1">
            <Link href="/" className="text-lg font-bold text-white mb-6 px-4">
              Prediction Signals
            </Link>
            <NavLink href="/opportunities">Opportunities</NavLink>
            <NavLink href="/trades">Trades</NavLink>
            <NavLink href="/performance">Performance</NavLink>
          </aside>
          <main className="flex-1 p-8 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
