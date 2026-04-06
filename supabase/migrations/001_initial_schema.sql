-- Prediction Market Signal Platform - Initial Schema

-- Enums
CREATE TYPE market_structure AS ENUM ('binary_threshold', 'bucket_range');
CREATE TYPE signal_type AS ENUM ('BUY_YES', 'BUY_NO', 'NO_TRADE');
CREATE TYPE trade_status AS ENUM ('open', 'settled', 'cancelled');
CREATE TYPE market_status AS ENUM ('active', 'closed', 'settled');

-- Markets
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  niche_key TEXT NOT NULL DEFAULT 'weather_daily_temp',
  city_key TEXT NOT NULL DEFAULT 'nyc',
  market_structure market_structure NOT NULL DEFAULT 'binary_threshold',
  market_date DATE,
  threshold_value DOUBLE PRECISION,
  bucket_lower DOUBLE PRECISION,
  bucket_upper DOUBLE PRECISION,
  close_time TIMESTAMPTZ,
  settlement_time TIMESTAMPTZ,
  status market_status NOT NULL DEFAULT 'active',
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_markets_niche_city ON markets(niche_key, city_key);
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_date ON markets(market_date);

-- Market Snapshots
CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  yes_bid DOUBLE PRECISION,
  yes_ask DOUBLE PRECISION,
  no_bid DOUBLE PRECISION,
  no_ask DOUBLE PRECISION,
  last_price DOUBLE PRECISION,
  implied_probability DOUBLE PRECISION,
  volume INTEGER,
  raw_json JSONB
);

CREATE INDEX idx_snapshots_market_time ON market_snapshots(market_id, captured_at DESC);

-- External Data Snapshots
CREATE TABLE external_data_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_key TEXT NOT NULL,
  city_key TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT 'open_meteo',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  normalized_json JSONB NOT NULL,
  raw_json JSONB
);

CREATE INDEX idx_external_niche_city_time ON external_data_snapshots(niche_key, city_key, captured_at DESC);

-- Model Outputs
CREATE TABLE model_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  modeled_probability DOUBLE PRECISION NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  feature_json JSONB NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'weather_temp_v1'
);

CREATE INDEX idx_model_market_time ON model_outputs(market_id, captured_at DESC);

-- Signals
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  model_output_id UUID NOT NULL REFERENCES model_outputs(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_type signal_type NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  explanation TEXT,
  reason_codes_json JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  modeled_yes_probability DOUBLE PRECISION NOT NULL,
  modeled_no_probability DOUBLE PRECISION NOT NULL,
  effective_yes_entry_price DOUBLE PRECISION,
  effective_no_entry_price DOUBLE PRECISION,
  trade_edge_yes DOUBLE PRECISION,
  trade_edge_no DOUBLE PRECISION,
  worth_trading BOOLEAN NOT NULL DEFAULT false,
  model_version TEXT NOT NULL DEFAULT 'weather_temp_v1'
);

CREATE INDEX idx_signals_market_time ON signals(market_id, captured_at DESC);
CREATE INDEX idx_signals_type ON signals(signal_type);

-- Simulated Accounts
CREATE TABLE simulated_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  starting_balance DOUBLE PRECISION NOT NULL DEFAULT 10000,
  current_balance DOUBLE PRECISION NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simulated Trades
CREATE TABLE simulated_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES simulated_accounts(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  quantity INTEGER NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_price DOUBLE PRECISION NOT NULL,
  current_mark_price DOUBLE PRECISION,
  exit_time TIMESTAMPTZ,
  exit_price DOUBLE PRECISION,
  status trade_status NOT NULL DEFAULT 'open',
  unrealized_pnl DOUBLE PRECISION DEFAULT 0,
  realized_pnl DOUBLE PRECISION,
  notes TEXT
);

CREATE INDEX idx_trades_account ON simulated_trades(account_id);
CREATE INDEX idx_trades_market ON simulated_trades(market_id);
CREATE INDEX idx_trades_status ON simulated_trades(status);

-- Settlements
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL,
  settlement_value DOUBLE PRECISION NOT NULL,
  raw_json JSONB
);

CREATE UNIQUE INDEX idx_settlements_market ON settlements(market_id);

-- Trade Postmortems
CREATE TABLE trade_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulated_trade_id UUID NOT NULL REFERENCES simulated_trades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome_label TEXT NOT NULL,
  reason_codes_json JSONB,
  summary TEXT NOT NULL,
  structured_json JSONB
);

CREATE INDEX idx_postmortems_trade ON trade_postmortems(simulated_trade_id);

-- Seed default simulated account
INSERT INTO simulated_accounts (name, starting_balance, current_balance)
VALUES ('default', 10000, 10000);
