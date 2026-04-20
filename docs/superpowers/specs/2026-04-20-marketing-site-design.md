# Marketing Site — Design Spec

**Date:** 2026-04-20
**Status:** Approved for implementation
**Scope:** Replace the current `/` redirect with a marketing landing page, add a `/products` "coming soon" page, and separate marketing chrome from the existing dashboard chrome.

## 1. Product framing

- **Audience:** Hybrid — dev-tool aesthetic (Stripe / Linear / Vercel) layered with institutional credibility (numbers, track-record). The page should feel equally comfortable to a quant evaluating a data vendor and a developer looking for a webhook.
- **Name:** Keep "Prediction Signals" for now. Design must isolate the wordmark so a future rename is a single-file change.
- **Existing dashboard pages** (`/opportunities`, `/trades`, `/performance`, `/models`) are reframed as the **Live Demo** of the product. No auth, no URL changes — only branding/nav context shifts.
- **Palette story:** Dual-accent — **emerald** signals *real data*, **violet** signals *AI*. Using both together visually encodes the tagline "Powered by AI, driven by real data."
- **Primary CTA:** "Request API Access" (aspirational, captures email only in this pass — no key issuance).
- **Secondary CTA:** "See Live Demo" → `/opportunities`.

## 2. Routing architecture

Uses Next.js App Router route groups to separate chrome without changing URLs.

```
src/app/
  layout.tsx                       # slim: <html>/<body>/fonts/metadata only
  globals.css
  (marketing)/
    layout.tsx                     # MarketingNav + MarketingFooter wrapper
    page.tsx                       # landing page
    products/page.tsx              # coming-soon page
  (app)/
    layout.tsx                     # wraps children in <AppShell>
    opportunities/…                # moved from src/app/opportunities
    trades/…
    performance/…
    models/…
  api/                             # unchanged
    waitlist/route.ts              # NEW: stub POST for email capture
```

- Route groups `()` do not affect URLs: `/opportunities` still resolves.
- The current `src/app/page.tsx` (which redirects to `/opportunities`) is deleted.
- `AppShell` moves from the root layout into `(app)/layout.tsx` — marketing pages never render the sidebar.

## 3. Components

All new marketing components live under `src/components/marketing/`:

| Component              | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `Logo.tsx`             | Single source of truth for the wordmark. Rename = edit one file.        |
| `MarketingNav.tsx`     | Sticky top nav, transparent-over-hero, blur-on-scroll.                  |
| `MarketingFooter.tsx`  | Product / Company / Legal columns + small legal note.                   |
| `GradientBackground.tsx` | Reusable decorative bg: dotted grid + emerald + violet blurred orbs.  |
| `WaitlistForm.tsx`     | Email input + submit, POSTs to `/api/waitlist`, client component.       |

Dashboard components (`AppShell`, `MarketScheduleTooltip`) are untouched.

## 4. Landing page (`/`) — section order

1. **Hero** — H1 with gradient-stroked phrase `powered by AI, driven by real data`. Two CTAs (gradient primary, ghost secondary). `GradientBackground` behind.
2. **Proof band** — 4 stats (markets tracked, signals/day, avg edge bps, models running). Numbers are hard-coded constants for this pass; a follow-up can wire them to a real endpoint.
3. **Three pillars** — Grid of 3 cards: AI-native models (violet glow), Real market data (emerald glow), Institutional-grade (neutral/mixed).
4. **Live Demo preview** — Styled framed card with headline + `See it live →` link to `/opportunities`. First pass uses a CSS mock of the table, not a real screenshot, so it stays in sync without asset management.
5. **Developer section** — Dark terminal-styled card showing a webhook JSON payload and a `curl` snippet. Chip row: `REST`, `Webhooks`, `JSON`, `Signed requests`.
6. **How it works** — 3 numbered steps: Models → Signals → Your system.
7. **CTA band** — "Get early API access." with `WaitlistForm`.
8. **Footer.**

## 5. Products page (`/products`)

- Reuses `GradientBackground` and marketing layout.
- Hero: "Products — Coming soon."
- 3-item grid with "Coming Soon" badges:
  - **Signal API** — REST + webhook signal delivery.
  - **Strategy Vault** — curated strategies on top of signals.
  - **Terminal** — the dashboard UI. Links to `/opportunities` as "Available as Live Demo."
- Secondary `WaitlistForm` at the bottom ("Notify me when these launch").

## 6. Visual system

- Base bg `zinc-950`, text `zinc-100` (existing).
- Accent A (data): `emerald-400` / `emerald-500`.
- Accent B (AI): `violet-500` / `fuchsia-500`.
- Primary gradient: `from-emerald-400 via-teal-300 to-violet-400` — used on headline fragments and primary CTAs.
- Typography: Inter (already imported). `tracking-tight` + `font-semibold` for H1/H2. Hero H1 ramps to `text-7xl` on desktop.
- Motion: CSS-only fade/translate-up via `@keyframes` + `motion-safe:` variants. No animation library added.
- Borders: `border-zinc-800` for subtle divisions; glow effects via `shadow-[0_0_...]` utilities.

## 7. `/api/waitlist` endpoint

- Accepts `POST { email: string }`.
- Validates with `zod` (already a dependency).
- For this pass: logs the email server-side and returns `{ ok: true }`. Wiring into Supabase is deferred — this keeps the form functional without schema work now.
- Rate-limit concerns deferred; the endpoint is low-value for abuse until we issue real keys.

## 8. Error handling

- `WaitlistForm` shows inline success/error states, disables submit while pending, resets on success.
- Invalid emails rejected client-side (HTML `type=email` + zod on server).
- No other user-facing error surfaces in this pass (marketing is mostly static).

## 9. Testing

- No new unit tests in this pass — content is largely static JSX.
- Verification: `npm run lint` clean, `npm run build` compiles, manual smoke test of `/`, `/products`, `/opportunities` in the dev server.

## 10. Out of scope (explicit)

- Auth, API key issuance, billing.
- Real screenshot/video assets for the demo preview.
- Writing real product copy for the products page beyond placeholder descriptions.
- SEO metadata tuning beyond basic `<title>` / `<meta description>`.
- Analytics/telemetry.
- Light-mode support (site is dark-mode-only, matching the dashboard).
