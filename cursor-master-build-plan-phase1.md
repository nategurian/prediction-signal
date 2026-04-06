# Cursor Master Build Plan — Prediction Market Signal Platform (Phase 1)

## Purpose

This document is the **single source of truth** for building Phase 1 of the prediction market signal platform.

It merges:

- product vision
- scope boundaries
- Phase 1 architecture
- first signal model
- trade-worthiness logic
- dashboard requirements
- backend modules
- database design
- API endpoints
- implementation task order
- testing requirements

This is the document to hand to Cursor.

---

# 1. Product Vision

## Long-term goal

Build a prediction market signal platform that helps identify mispriced markets by combining:

- live Kalshi market pricing
- real-world external data
- explicit probability logic
- trade-worthiness filters
- paper trading and performance tracking
- AI-assisted explanations and postmortems

The final product should become a **signal generator that I and other users can use**, with the ability to later expose signals via dashboard and API.

Eventually, other bots or users may consume the signals.

But Phase 1 must start small and honest.

---

## Product positioning

Best positioning:

> A prediction market signal engine that uses real-world data and explicit probability logic to generate explainable signals and paper-traded performance.

Avoid calling it:
- an AI trader
- a Kalshi clone
- an autonomous betting bot

That attracts the wrong expectations and weakens the product.

---

# 2. Phase 1 Goal

Build a narrow internal tool that:

1. pulls Kalshi market data
2. pulls real-world external data
3. computes modeled probabilities
4. determines whether YES or NO is worth buying
5. creates paper trades only when the economics justify it
6. tracks wins, losses, unrealized PnL, and realized PnL
7. explains both signals and trade outcomes
8. reveals whether the signal logic has real edge

Phase 1 is **not** about live trading.

Phase 1 is about proving whether the signal engine is real or fake.

---

# 3. Hard Scope Boundaries

## In scope
- one niche only
- one city only
- one simulated account
- deterministic first model
- paper trading only
- internal dashboard
- internal API
- AI explanations and postmortems

## Out of scope
- real money
- user billing
- multi-tenant architecture
- support for many Kalshi categories
- external customer onboarding
- bot execution integrations
- autonomous agents
- copy trading

If scope expands before signal quality is proven, the project gets weaker.

---

# 4. Initial Niche

## Best first niche
**Daily high temperature markets in one city**

### Why
- structured external data
- objective settlement
- frequent opportunities
- simpler than politics/news/macroeconomic markets
- fast feedback loop

### Recommended city
Pick one:
- NYC
- Miami

Use **one city only** for V1.

---

# 5. Product Philosophy

The engine should answer two different questions:

## Direction question
- Is YES more likely or is NO more likely?

## Worth-it question
- Even if direction is correct, is the market offering a price worth buying after costs and uncertainty?

This is critical.

The system should not trade merely because an event looks likely.

The system should trade only if a side is **attractively priced**.

So the valid outputs are:

- BUY_YES
- BUY_NO
- NO_TRADE

And **NO_TRADE should happen often**.

---

# 6. AI’s Role

## AI should do
- explanation generation
- confidence wording
- structured reason summaries
- anomaly descriptions
- winner/loser postmortems
- feature brainstorming
- formula critique after results exist

## AI should not do
- raw freeform probability generation
- direct trade decision-making from raw inputs
- autonomous “read data and invent trades” behavior

## Correct AI role
AI is:
- a research assistant
- an explanation engine
- a reviewer
- a postmortem analyst

AI is not:
- the core probability model
- the primary signal generator

---

# 7. Phase 1 System Overview

The Phase 1 system does the following:

1. ingest active supported Kalshi markets
2. ingest external weather data
3. compute deterministic modeled probability
4. compute whether YES is worth buying
5. compute whether NO is worth buying
6. choose BUY_YES / BUY_NO / NO_TRADE
7. open simulated trade if warranted
8. mark trades to market over time
9. settle trades when markets resolve
10. explain signals and outcomes

---

# 8. Technical Stack

## Frontend
- Next.js
- TypeScript
- Tailwind CSS
- Recharts

## Backend
- Next.js Route Handlers
- TypeScript
- Zod

## Database
- Postgres
- Supabase is acceptable for speed

## Scheduling / jobs
- Vercel cron or simple Node worker
- manual trigger endpoints for jobs

## AI
- OpenAI API
- structured JSON outputs only
- narrow prompt templates only

## Why this stack
- fast to build
- familiar
- enough for V1
- easy to evolve later

Do not overengineer.

---

# 9. Core Modules

Build these modules:

1. Market Ingestion
2. External Data Ingestion
3. Probability Engine
4. Trade-Worthiness Signal Engine
5. Simulation Engine
6. Explanation Engine
7. Dashboard API
8. Frontend Dashboard

---

# 10. Core Product Flow

## Step 1 — Pull Kalshi market data
Fetch current active markets in the supported niche.

## Step 2 — Pull external data
Fetch structured weather data for the chosen city.

## Step 3 — Compute modeled probability
Estimate the probability of the event from explicit logic.

## Step 4 — Evaluate trade worthiness
Determine if buying YES or buying NO has enough expected value after costs and uncertainty.

## Step 5 — Select action
Choose:
- BUY_YES
- BUY_NO
- NO_TRADE

## Step 6 — Simulate trade
If warranted, open a paper trade with conservative assumptions.

## Step 7 — Track PnL
Update unrealized PnL over time.

## Step 8 — Settle trade
On resolution, compute realized PnL.

## Step 9 — Explain
Use AI to explain:
- why the signal existed
- why the trade was worth or not worth taking
- why a settled trade won or lost

---

# 11. First Signal Model (Phase 1.1)

## Purpose
Create a simple deterministic model for one market family:
**daily high temperature**

## Model philosophy
Keep the first model:
- simple
- transparent
- testable
- easy to improve later

It does not need to be smart.
It needs to be honest.

---

## Market structures supported

### A. Binary threshold market
Example:
- “Will NYC high temperature be above 75°F today?”

Need:
- probability of YES

### B. Bucket / range market
Example:
- “What will the high temperature be today?”

Need:
- probability of each bucket

The first model should support both.

---

## Inputs

### Market inputs
- ticker
- title
- status
- close time
- settlement time
- YES bid
- YES ask
- NO bid
- NO ask
- last price
- implied market probability

### External inputs
- latest forecasted daily high
- latest observed temperature
- hourly forecast if available
- forecast timestamp
- prior forecasted high if available
- current time / hour
- city key

### Config inputs
- sigma
- min trade edge
- min confidence
- slippage penalty
- fee penalty
- uncertainty buffer
- max spread
- max minutes before settlement to enter
- fixed trade quantity

---

## Baseline probability model

### Step 1 — Center estimate
```text
mu = forecasted_daily_high
```

### Step 2 — Uncertainty
```text
sigma = configured_standard_deviation
```

Suggested starting values:
- NYC: 2.5
- Miami: 2.0 to 2.5

### Step 3 — Distribution assumption
```text
actual_daily_high ~ Normal(mu, sigma)
```

This is an acceptable first approximation.

---

## Binary threshold probability
For:
> actual high > threshold

Compute:
```text
P(YES) = 1 - CDF(threshold, mu, sigma)
```

Use a consistent boundary convention everywhere.

---

## Bucket probability
For a bucket:
```text
P(lower <= actual_high <= upper)
```

Compute using the normal CDF difference between upper and lower bounds.

Use one boundary convention and keep it fixed.

---

## Optional early feature — forecast revision
Compute:
```text
forecast_revision = latest_forecast_high - previous_forecast_high
```

Use this conservatively:
- as a logged feature
- as an explanation feature
- optionally as a confidence modifier

Do not let it dominate the formula in V1.

---

## Optional early feature — current observed temperature
Use current temperature as:
- a logged feature
- explanation context
- optional confidence context

Do not make it dominate the formula yet.

---

# 12. Trade-Worthiness Logic

This is the critical refinement.

The system must not ask only:
- “Is YES likely?”
- “Is NO likely?”

It must ask:
- “Is YES worth buying?”
- “Is NO worth buying?”
- “Or is neither side worth touching?”

---

## YES expected value logic

If:
- `p = modeled YES probability`
- `entry_yes = yes_ask + slippage_penalty + fee_penalty + uncertainty_buffer`

Then:
```text
trade_edge_yes = p - entry_yes
```

Only YES trades with enough positive edge should be considered.

---

## NO expected value logic

If:
- `q = 1 - modeled YES probability`
- `entry_no = no_ask + slippage_penalty + fee_penalty + uncertainty_buffer`

Then:
```text
trade_edge_no = q - entry_no
```

Only NO trades with enough positive edge should be considered.

---

## Why this matters
Examples:
- modeled YES = 0.99, YES ask = 0.98 → maybe still not worth it
- modeled NO = 0.99, NO ask = 0.98 → same issue

High probability alone is not enough.

The trade must have enough expected value after costs and uncertainty.

---

## Action selection rules

### BUY_YES
Only if all are true:
- `trade_edge_yes >= min_trade_edge`
- `confidence_score >= min_confidence`
- `trade_edge_yes > trade_edge_no`
- market is tradable
- spread acceptable
- time-to-settlement passes cutoff
- no duplicate open trade exists

### BUY_NO
Only if all are true:
- `trade_edge_no >= min_trade_edge`
- `confidence_score >= min_confidence`
- `trade_edge_no > trade_edge_yes`
- market is tradable
- spread acceptable
- time-to-settlement passes cutoff
- no duplicate open trade exists

### NO_TRADE
Otherwise:
- no trade

---

## Suggested starting config

```ts
export const appConfig = {
  nicheKey: "weather_daily_temp",
  cityKey: "nyc",
  sigma: 2.5,
  minTradeEdge: 0.05,
  minConfidenceScore: 0.60,
  maxSpread: 0.06,
  slippagePenalty: 0.01,
  feePenalty: 0.00,
  uncertaintyBuffer: 0.02,
  maxMinutesBeforeSettlementToEnter: 180,
  fixedTradeQuantity: 10,
};
```

Keep configurable.

---

# 13. Confidence Score

Confidence is not the event probability.

Confidence answers:
> how much should we trust this setup and its tradeability?

Use a 0 to 1 scale.

### Suggested components

#### Forecast freshness
Newer forecast = better

#### Distance from threshold
Bigger margin between forecast and threshold = more confidence

#### Revision stability
Recent sharp forecast swings reduce confidence

#### Spread quality
Wide spread reduces practical confidence

---

## Example formula

```text
confidence_score =
  0.35 * freshness_component +
  0.35 * threshold_distance_component +
  0.20 * revision_stability_component +
  0.10 * spread_quality_component
```

Clamp to [0, 1].

This is enough for V1.

---

# 14. Simulation Engine Rules

## Account model
- one simulated account
- one open trade per market max
- fixed quantity per trade

## Entry pricing
For BUY_YES:
```text
entry_price = yes_ask + slippage_penalty
```

For BUY_NO:
```text
entry_price = no_ask + slippage_penalty
```

Use conservative fills.

## Exit logic
For V1:
- hold to settlement

No stop-loss or profit-taking logic yet.

---

## Mark-to-market PnL

### YES trade
```text
unrealized_pnl = (current_yes_mark - entry_price) * quantity
```

### NO trade
Use the analogous NO contract mark convention.

Pick one mark convention and keep it consistent.

---

## Settled PnL

### YES trade
```text
realized_pnl = (settlement_value - entry_price) * quantity
```
Where settlement_value is 1 if YES wins, else 0.

### NO trade
Use the inverse payout logic.

---

# 15. Logging Requirements

This is mandatory.

At signal time, log:
- market ticker
- market title
- market structure
- threshold / bucket bounds
- YES/NO bid and ask
- displayed market probability
- effective YES entry price
- effective NO entry price
- modeled YES probability
- modeled NO probability
- trade edge YES
- trade edge NO
- forecasted high
- current observed temp
- forecast timestamp
- forecast revision
- sigma
- confidence score
- signal type
- model version

If this is not logged, you cannot do real postmortems.

---

# 16. Model Versioning

Every model output and signal should include a version string.

Example:
```text
weather_temp_v1
```

Any meaningful formula change should bump version.

Do not silently mutate logic.

---

# 17. Database Schema

## markets
- id
- ticker
- title
- category
- niche_key
- city_key
- market_date
- threshold_value
- close_time
- settlement_time
- status
- raw_json
- created_at
- updated_at

## market_snapshots
- id
- market_id
- captured_at
- yes_bid
- yes_ask
- no_bid
- no_ask
- last_price
- implied_probability
- volume
- raw_json

## external_data_snapshots
- id
- niche_key
- city_key
- source_name
- captured_at
- normalized_json
- raw_json

## model_outputs
- id
- market_id
- captured_at
- modeled_probability
- confidence_score
- feature_json
- model_version

## signals
- id
- market_id
- model_output_id
- captured_at
- signal_type
- confidence_score
- explanation
- reason_codes_json
- status
- modeled_yes_probability
- modeled_no_probability
- effective_yes_entry_price
- effective_no_entry_price
- trade_edge_yes
- trade_edge_no
- worth_trading
- model_version

## simulated_accounts
- id
- name
- starting_balance
- current_balance
- created_at
- updated_at

## simulated_trades
- id
- account_id
- market_id
- signal_id
- side
- quantity
- entry_time
- entry_price
- current_mark_price
- exit_time
- exit_price
- status
- unrealized_pnl
- realized_pnl
- notes

## settlements
- id
- market_id
- settled_at
- outcome
- settlement_value
- raw_json

## trade_postmortems
- id
- simulated_trade_id
- created_at
- outcome_label
- reason_codes_json
- summary
- structured_json

---

# 18. API Endpoints

## GET /api/markets
Return active supported markets.

## GET /api/opportunities
Return current ranked opportunities with:
- market
- YES ask / NO ask
- modeled YES probability
- modeled NO probability
- trade edge YES
- trade edge NO
- confidence
- signal type
- worth trading
- summary

## GET /api/signals
Return recent signals.

## GET /api/trades
Return simulated trades.

## GET /api/trades/:id
Return full trade detail.

## GET /api/performance
Return:
- total PnL
- realized PnL
- unrealized PnL
- trade count
- win rate
- average win
- average loss
- max drawdown
- equity curve

## POST /api/jobs/refresh-markets
## POST /api/jobs/refresh-external-data
## POST /api/jobs/run-model
## POST /api/jobs/run-signals
## POST /api/jobs/mark-trades
## POST /api/jobs/settle-trades

---

# 19. Dashboard Requirements

## Opportunities page
Show:
- market
- YES ask
- NO ask
- modeled YES probability
- modeled NO probability
- trade edge YES
- trade edge NO
- confidence
- signal
- worth trading
- summary

## Trades page
Show:
- entry time
- market
- side
- entry price
- current/exit price
- unrealized PnL
- realized PnL
- status

## Trade detail page
Show:
- market snapshot at entry
- external data snapshot at entry
- model output
- trade-worthiness breakdown
- why chosen side was attractive
- why opposite side was rejected
- final result
- postmortem if settled

## Performance page
Show:
- total PnL
- realized PnL
- unrealized PnL
- win rate
- trade count
- average win/loss
- max drawdown
- equity curve

---

# 20. AI Explanation Requirements

AI explanations must describe:
1. directional view
2. economic worthiness

### Example signal explanation
```json
{
  "summary": "The model favors YES and the YES side remains underpriced after applying slippage and uncertainty buffers.",
  "reasonCodes": [
    "modeled_yes_above_market_price",
    "trade_edge_yes_positive_after_buffers",
    "confidence_above_minimum"
  ]
}
```

### Example no-trade explanation
```json
{
  "summary": "The event is likely, but the market price already reflects too much of that probability to justify entering the trade.",
  "reasonCodes": [
    "high_probability_low_payout",
    "insufficient_trade_edge"
  ]
}
```

### Example loser postmortem
```json
{
  "summary": "The model overstated the probability relative to the uncertainty around the threshold.",
  "reasonCodes": [
    "small_margin_vs_sigma",
    "model_overconfidence"
  ]
}
```

AI should not alter the core probability or signal logic in V1.

---

# 21. Job Scheduling

Suggested V1 cadence:
- refresh markets: every 2 to 5 minutes
- refresh external data: every 15 minutes
- run model: after external refresh
- run signals: after model run
- mark open trades: every 5 minutes
- settle trades: every 30 minutes and after market close

All jobs should also be manually triggerable.

---

# 22. Cursor Build Order

## Task 1 — Project setup
- initialize Next.js app
- add Tailwind
- add TypeScript
- add ESLint
- add env validation

## Task 2 — Database setup
- configure Postgres / Supabase
- create schema migrations
- create typed DB access layer

## Task 3 — Shared schemas and types
- add Zod schemas
- add TypeScript domain types
- add app config module

## Task 4 — Kalshi client
- build client
- fetch relevant markets
- fetch prices
- normalize and store markets
- normalize and store snapshots

## Task 5 — Weather client
- fetch forecast data
- normalize snapshots
- store external data

## Task 6 — Probability engine
- implement normal-distribution model
- parse threshold / bucket bounds
- compute modeled YES probability
- compute modeled NO probability
- compute confidence score
- persist model outputs

## Task 7 — Trade-worthiness signal engine
- compute effective YES entry
- compute effective NO entry
- compute trade edge YES
- compute trade edge NO
- apply filters
- choose BUY_YES / BUY_NO / NO_TRADE
- persist signals

## Task 8 — Simulation engine
- open simulated trades
- mark open trades
- settle trades
- update balances
- compute PnL

## Task 9 — Dashboard pages
- opportunities
- trades
- trade detail
- performance

## Task 10 — AI explanations
- signal explanations
- no-trade explanations
- winner/loser postmortems
- strict JSON schema validation

## Task 11 — Job orchestration
- scheduled jobs
- manual endpoints
- retry/failure handling

## Task 12 — Testing and polish
- loading states
- error handling
- filters
- charts
- QA

---

# 23. Testing Requirements

## Unit tests
- threshold parser
- bucket parser
- probability calculations
- confidence score calculations
- trade edge YES
- trade edge NO
- action selection logic
- PnL calculations
- settlement logic

## Must-have economic test cases

### Case A
- modeled YES = 0.99
- YES ask = 0.98
- result = NO_TRADE if edge is too thin after buffers

### Case B
- modeled YES = 0.70
- YES ask = 0.58
- result = BUY_YES if positive enough after buffers

### Case C
- modeled YES = 0.10
- NO ask = 0.82
- result = BUY_NO only if trade edge survives

### Case D
- both sides negative after costs
- result = NO_TRADE

## Integration tests
- ingest markets
- ingest weather
- compute model
- generate signal
- create simulated trade
- mark open trade
- settle trade

## Manual QA
- opportunities page loads
- signals appear
- no-trade states appear
- trade opens
- trade updates
- trade settles
- explanations render
- postmortems render

---

# 24. Acceptance Criteria

Phase 1 is successful only if:

1. market ingestion works reliably
2. external data ingestion works reliably
3. modeled probabilities are computed deterministically
4. trade-worthiness logic is enforced
5. paper trades open only when economically justified
6. unrealized PnL updates correctly
7. realized PnL settles correctly
8. all trade-time inputs are logged
9. dashboard makes results inspectable
10. AI explanations help debugging without replacing core logic

A pretty dashboard with fake economics is failure.

---

# 25. Biggest Risks

## Fake edge
Caused by:
- future data leakage
- optimistic fills
- post-hoc rule changes

## Scope creep
Caused by:
- too many cities
- too many markets
- live trading too soon
- trying to sell before proving edge

## AI theater
Caused by:
- smart-sounding explanations masking weak logic

The project must resist all three.

---

# 26. Final Summary

Build a narrow internal app for one city’s Kalshi daily temperature markets.

Use:
- real Kalshi pricing
- real weather data
- explicit probability logic
- explicit trade-worthiness logic
- conservative paper trading
- full logging
- AI explanations and postmortems

The system must decide not just:
- what is likely

but:
- what is **actually worth trading**

That is the correct Phase 1.

Truth first.
