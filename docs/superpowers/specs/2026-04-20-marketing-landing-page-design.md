# Marketing Landing Page & Product Framing

## Problem

The app currently redirects `/` straight to `/opportunities`. There is no public face, no product framing, and no surface area for describing what Prediction Signals *is* to a non-user. We need a marketing site that positions the project as a product — a hybrid dev-tool / institutional signals API — while keeping the existing dashboard pages available as a live demo of the underlying tech.

## Solution

Split the Next.js App Router into two route groups:

- `(marketing)` — public-facing site with its own chrome (top nav + footer, no sidebar). Homepage and a "Products (coming soon)" page.
- `(app)` — the existing dashboard pages, wrapped in the current `AppShell`, reframed as a **Live Demo** via a slim banner.

The marketing pages follow a modern dev-tool aesthetic (Linear / Vercel / Stripe-adjacent) on the existing dark zinc-950 base, using a dual-accent palette — **emerald** to signify "real data" and **violet** to signify "AI" — so the core pitch ("powered by AI, driven by real data") is expressed visually, not just in copy.

No new dependencies. No auth. No real pricing. Email capture is a stub endpoint that logs for now (TODO marker for Supabase wiring later).

## Scope

1. Restructure routes into `(marketing)` and `(app)` groups; move existing dashboard pages.
2. Replace the single `AppShell`-wrapped root layout with a minimal root and two route-group layouts.
3. Build reusable marketing primitives (Wordmark, GradientText, GridBackdrop, MarketingNav, MarketingFooter, CTAButton, StatCounter, BentoCard, CodeTabs).
4. Build landing page (`/`) with 8 sections (see §4).
5. Build "coming soon" products page (`/products`).
6. Add "Live Demo" banner to `(app)` layout; make `AppShell` wordmark link to `/`.
7. Stub `/api/waitlist` endpoint (logs email; returns 200).
8. Update root `metadata` for SEO.

Explicitly **out of scope**: auth, real pricing page, blog, changelog, analytics, framer-motion, custom fonts beyond existing Inter, real Supabase wiring for email capture.

---

## 1. Routing & Layout Architecture

```
src/app/
├── layout.tsx                   # Root: html/body/fonts only. No AppShell.
├── globals.css                  # Add gradient + grid utilities.
├── api/
│   └── waitlist/route.ts        # NEW. POST { email } -> 200, logs to console (TODO: Supabase).
├── (marketing)/
│   ├── layout.tsx               # MarketingNav + children + MarketingFooter
│   ├── page.tsx                 # Landing
│   └── products/page.tsx        # Coming soon
└── (app)/
    ├── layout.tsx               # Wraps AppShell, renders LiveDemoBanner above it
    ├── opportunities/…          # moved from src/app/opportunities
    ├── trades/…
    ├── performance/…
    └── models/…
```

**Why route groups:** parentheses in folder names give us distinct layouts without polluting URLs. Marketing pages get no sidebar; dashboard pages keep the existing sidebar plus a banner.

**Renaming safety:** the brand name "Prediction Signals" lives in exactly one place — `components/marketing/Wordmark.tsx`. Nav, footer, `AppShell` sidebar header, and page `<title>` all import it.

## 2. Reusable Primitives

All new files under `src/components/marketing/`.

- **`Wordmark.tsx`** — Single source of truth for the product name. Props: `size?: "sm" | "md" | "lg"`, `as?: "link" | "text"`. Used in nav, footer, AppShell, dashboard banner.
- **`GradientText.tsx`** — `<span>` with `bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent`. Props: `children`.
- **`GridBackdrop.tsx`** — Fixed, pointer-events-none, z-0. Contains: a CSS grid pattern (radial mask fading out at edges) + two large blurred radial gradients (emerald bottom-left, violet top-right). Used on hero and products page.
- **`MarketingNav.tsx`** — Sticky top. Transparent until scrolled > 12px, then `bg-zinc-950/80 backdrop-blur` with a faint bottom border. Left: Wordmark. Center (md+): links to `#product`, `#api`, `/opportunities` (labeled "Live Demo"), `/products`. Right: primary CTA button "Get API access" (scrolls to waitlist on landing, otherwise anchors home). Mobile: wordmark + hamburger → full-screen overlay.
- **`MarketingFooter.tsx`** — 4 columns (Product, Developers, Company, Legal) + bottom row with Wordmark, copyright, and a faint emerald→violet hairline on top. Links are mostly `#` placeholders for v1.
- **`CTAButton.tsx`** — Primary variant: emerald→violet gradient bg, subtle glow on hover. Ghost variant: zinc-800 border, text hover emerald. Props: `variant`, `href`, `children`, `size`.
- **`StatCounter.tsx`** — Client component. Takes `end: number`, `label: string`, `suffix?: string`, `format?: "int" | "pct" | "money"`. Animates from 0 → end over 900ms when the element intersects viewport (IntersectionObserver). Uses `requestAnimationFrame`, eases out.
- **`BentoCard.tsx`** — Rounded-xl zinc-900 card with 1px zinc-800 border, subtle inner highlight. Props: `icon`, `title`, `description`, `accent?: "emerald" | "violet"`, `className?` for grid sizing, `children?` for optional visual (sparkline/code/gauge).
- **`CodeTabs.tsx`** — Tabbed syntax-highlighted code sample. Tabs: `curl`, `Node`, `Python`. No external highlighter dep — hand-styled spans using Tailwind classes (keeps bundle small and matches "we built this carefully" vibe). Tab state client-side.
- **`LiveDemoBanner.tsx`** — Thin emerald-tinted banner: "Live demo — real signals from production." + link "Request API access →". Dismiss button writes `prediction-signals:demo-banner-dismissed=1` to localStorage. Client component; reads localStorage in effect to avoid hydration mismatch.
- **`WaitlistForm.tsx`** — Client component. Email input + submit CTA. Handles validation, loading state, success/error inline states. POSTs to `/api/waitlist`. Reused on landing (§4.7) and products page (§5). Props: `variant?: "inline" | "stacked"` for layout density.

## 3. Visual System

- **Base:** `bg-zinc-950`, `text-zinc-100`, Inter (existing).
- **Accents:** emerald-400/500 (data, proof, stats), violet-400/500 (AI, models), cyan-400 as bridge in gradients.
- **Gradient:** `from-emerald-400 via-cyan-400 to-violet-400` — used for H1 words, CTA button, hairlines.
- **Grid backdrop:** CSS `background-image: linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 56px 56px;` with a radial mask.
- **Radial glows:** Two `absolute` blurred ovals — emerald bottom-left (`-left-40 bottom-0 w-[40rem] h-[40rem] bg-emerald-500/20 blur-[120px]`), violet top-right (`-right-40 -top-20 w-[40rem] h-[40rem] bg-violet-500/20 blur-[120px]`).
- **Type scale:** H1 `text-5xl md:text-7xl font-semibold tracking-tight`, H2 `text-3xl md:text-5xl font-semibold tracking-tight`, eyebrow `text-xs uppercase tracking-[0.18em] text-zinc-400`.
- **Motion:** only (a) stat counter count-up, (b) scroll-triggered subtle fade-up on section headers via `IntersectionObserver` + CSS transition. No framer-motion.

## 4. Landing Page Sections

Each is a named server component in `src/app/(marketing)/_sections/`, composed in `page.tsx`.

### 4.1 Hero
- GridBackdrop behind everything in this section.
- Eyebrow: `PREDICTION MARKET INTELLIGENCE`.
- H1: *"Powered by AI."* (GradientText on "AI") + line break + *"Driven by real data."* (GradientText on "real data"). Tight tracking.
- Sub: "Institutional-grade signals for prediction markets, delivered as an API." `text-zinc-400 text-lg md:text-xl max-w-2xl`.
- CTAs: primary `Get API access` (scrolls to `#waitlist`), ghost `View live demo` (→ `/opportunities`).
- Trust row below CTAs: 4 muted labels (e.g., "Kalshi coverage", "Sub-second webhooks", "Sigma auto-calibration", "Transparent track record") separated by vertical dividers.

### 4.2 Live stat strip
- Full-width band, zinc-900/50 bg, thin borders top/bottom.
- 4 StatCounters: `Signals issued / day` (ex: 1240), `Median edge on fills` (ex: 4.8%), `Markets covered` (ex: 180), `Uptime` (ex: 99.9%).
- Numbers are **hardcoded placeholders for v1** — TODO comment notes where to wire real data later.

### 4.3 How it works
- H2: "From raw signal to executable edge."
- 3-column triptych. Each column: small icon tile, step number, title, 1-line body, tiny visual strip.
  - **Ingest** (emerald accent): markets + catalysts. Visual: stylized data stream.
  - **Reason** (violet accent): AI models + calibration. Visual: stylized model output.
  - **Deliver** (emerald+violet gradient accent): webhook/API. Visual: tiny `POST /webhook` line.
- Connector: faint gradient line linking the three columns on md+ screens.

### 4.4 Feature bento grid
- H2: "Built for teams that take edge seriously."
- 6 BentoCards in an asymmetric grid (md: 3 columns, 2 rows; one card spans 2 cols):
  1. **Real-time webhooks** (2-col, emerald) — mini code snippet of a webhook payload.
  2. **Backtested & calibrated** (emerald) — tiny sparkline chart.
  3. **Sub-second latency** (violet) — stylized latency bar (e.g., "p95: 240ms").
  4. **Multi-model ensemble** (violet) — 3 stacked mini "model" pills.
  5. **Sigma auto-recalibration** (emerald) — nod to actual infra; tiny gauge.
  6. **Transparent track record** (violet, 2-col) — links to `/opportunities`; mini screenshot-style chart.

### 4.5 API preview
- H2: "A developer experience worth shipping on."
- Two columns on md+:
  - Left: 3–4 short paragraphs — "First-class webhooks", "Typed SDKs (coming soon)", "Idempotent by default".
  - Right: `CodeTabs` component showing the same conceptual request in `curl`, `Node`, `Python`, plus a sample payload pane below.

Sample payload (illustrative — not a real endpoint yet):
```json
{
  "signal_id": "sig_01JX…",
  "market": "KXHIGHNY-26APR21-T62.5",
  "side": "YES",
  "fair_value": 0.634,
  "edge_bps": 820,
  "confidence": 0.78,
  "model": "ensemble-v3",
  "issued_at": "2026-04-21T12:03:11Z"
}
```

### 4.6 Proof — "See it live"
- Full-width card, zinc-900 bg, gradient border (emerald→violet via a wrapper div technique).
- Left: H2 "See it working right now." + paragraph + CTA "Open live demo" → `/opportunities`.
- Right: stylized "browser frame" (rounded zinc-950 card with fake traffic-light dots at top) containing a small teaser visual (placeholder chart + a couple of fake opportunity rows). Does **not** pull live data — purely static teaser for performance.

### 4.7 Waitlist / CTA
- Anchor `#waitlist`.
- Centered. Eyebrow `EARLY ACCESS`. H2 "Limited API keys available." Sub text about phased rollout.
- Form: single email input + primary CTA button "Request access". On submit: POST `/api/waitlist`, show inline success state ("You're on the list. We'll be in touch.") or error. Client component.
- Below form: small "We'll never spam you" note in zinc-500.

### 4.8 Footer
- `MarketingFooter`, described in §2.

## 5. Products Page (`/products`)

- Same `(marketing)` layout chrome.
- GridBackdrop.
- Centered content, ~60vh min-height:
  - Eyebrow: `PRODUCTS`.
  - H1 with GradientText: "Something bigger is coming."
  - Short paragraph: vague but exciting — hints at additional asset classes, a signal marketplace, and programmable strategies built on top of the core API.
  - Inline waitlist form (same component as landing §4.7, reused).
- 3 muted "teaser cards" below, grayscale/blurred with a "Coming soon" pill. Titles only, no body text needed — enough to imply roadmap without committing.

## 6. Dashboard Reframe

- `(app)/layout.tsx` renders `<LiveDemoBanner />` above `<AppShell>{children}</AppShell>`.
- Update `AppShell` so the wordmark (both desktop sidebar + mobile header) is a `Link` to `/` and uses the shared `Wordmark` component.
- No other dashboard changes.

## 7. API — `/api/waitlist`

`src/app/api/waitlist/route.ts`:

- `POST` only; validates `{ email: string }` with zod (already a dep).
- Logs `waitlist:signup` with email + timestamp to console.
- Returns `{ ok: true }` on success, `{ ok: false, error }` on bad input.
- `// TODO(supabase): persist to waitlist table.`

Rate limiting, captcha, double-opt-in: explicitly out of scope for v1.

## 8. SEO / Metadata

- Update root `metadata` in `src/app/layout.tsx`:
  - `title`: "Prediction Signals — Institutional-grade alpha for prediction markets"
  - `description`: "AI-powered signals for prediction markets, delivered as an API. Real-time webhooks, transparent track record, built for serious traders."
  - Add `openGraph` and `twitter` card metadata (text only; no OG image for v1).
- Per-route `metadata` export for `/products` ("Products — coming soon").

## 9. Error & Edge Handling

- Waitlist form: inline validation (HTML5 `type="email" required`), server-side zod check, user-visible error if fetch fails.
- Live demo banner: SSR-safe (defaults to visible; dismiss state hydrates in effect).
- StatCounter: if user prefers reduced motion (`prefers-reduced-motion`), skip animation and render final value immediately.
- GridBackdrop: `pointer-events-none` so it never intercepts clicks; `aria-hidden`.

## 10. Testing

Marketing pages are primarily visual; heavy unit tests aren't warranted. Minimum:

- One Vitest test for the `/api/waitlist` route: rejects missing/invalid email (400), accepts valid email (200).
- `npm run build` must succeed (catches routing/SSR issues).
- Manual check: `/`, `/products`, `/opportunities` all render; dashboard banner dismiss persists across reloads.

## 11. Non-Goals (YAGNI)

- No auth, signup, or real API key issuance.
- No Supabase persistence for waitlist (stubbed, TODO marker).
- No real pricing page.
- No blog or changelog.
- No framer-motion / GSAP / lottie.
- No custom fonts beyond existing Inter.
- No analytics (PostHog/GA) wiring.
- No OG image generation.
- No i18n.

## 12. Migration & Risk Notes

- Moving pages into `(app)/` does **not** change URLs (route groups are URL-transparent), so no redirects are needed and existing bookmarks keep working.
- The current `src/app/page.tsx` that `redirect("/opportunities")` is deleted; the new `(marketing)/page.tsx` takes its place at `/`.
- The current root `layout.tsx` wraps everything in `AppShell`. This is changed: root layout becomes minimal, and `AppShell` moves into `(app)/layout.tsx`. This is the only behavior-changing refactor and is isolated to layout files.
