-- Phase 2a: introduce `variable` dimension on markets and city_calibrations.
-- Backwards-compatible: new column defaults to 'daily_high', existing rows
-- backfill cleanly. Phase 2b adds 'daily_low' series and starts producing
-- daily_low markets.

ALTER TABLE markets
  ADD COLUMN variable TEXT NOT NULL DEFAULT 'daily_high';

ALTER TABLE markets
  ADD CONSTRAINT markets_variable_check
    CHECK (variable IN ('daily_high', 'daily_low'));

CREATE INDEX idx_markets_city_variable ON markets(city_key, variable);

ALTER TABLE city_calibrations
  ADD COLUMN variable TEXT NOT NULL DEFAULT 'daily_high';

ALTER TABLE city_calibrations
  ADD CONSTRAINT city_calibrations_variable_check
    CHECK (variable IN ('daily_high', 'daily_low'));

ALTER TABLE city_calibrations
  DROP CONSTRAINT city_calibrations_city_key_key;

ALTER TABLE city_calibrations
  ADD CONSTRAINT city_calibrations_city_variable_unique
    UNIQUE (city_key, variable);

-- Existing rows backfill to 'daily_high' via the column default. The
-- city_calibrations index from migration 006 (idx_city_calibrations_city
-- on city_key) remains valid for queries that filter by city_key alone.
