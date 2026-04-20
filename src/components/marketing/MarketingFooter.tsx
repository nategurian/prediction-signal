import Link from "next/link";
import { Logo, PRODUCT_NAME } from "./Logo";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/products", label: "Products" },
      { href: "/opportunities", label: "Live Demo" },
      { href: "#developers", label: "Developers" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/opportunities", label: "Opportunities" },
      { href: "/trades", label: "Trades" },
      { href: "/performance", label: "Performance" },
      { href: "/models", label: "Models" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#cta", label: "Contact" },
      { href: "#cta", label: "Request access" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="space-y-4">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
              Institutional-grade prediction market signals, delivered as an API.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-500 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-zinc-800/80 pt-6 text-xs text-zinc-500 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.</p>
          <p className="max-w-xl text-right text-zinc-600">
            Not investment advice. Signals are probabilistic and carry risk. Past performance does
            not indicate future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
