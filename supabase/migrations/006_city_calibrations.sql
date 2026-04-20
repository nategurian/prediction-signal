-- Empirical forecast-error calibration per city.
--
-- Stores the trailing-N-day realized stdev of (actual_high_temp - forecasted_high).
-- This is the TRUE per-city forecast uncertainty, which differs from:
--   - static config sigma (handcrafted, doesn't adapt)
--   - ECMWF ensemble member stdev (measures model agreement, not forecast accuracy)
--
-- Populated by the `recalibrate-sigma` cron job, which reads postmortems'
-- actual vs. forecasted_high and computes robust per-city statistics.

CREATE TABLE city_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_key TEXT NOT NULL UNIQUE,
  niche_key TEXT NOT NULL DEFAULT 'weather_daily_temp',
  forecast_error_stdev DOUBLE PRECISION NOT NULL,
  forecast_error_rmse DOUBLE PRECISION NOT NULL,
  forecast_error_mae DOUBLE PRECISION NOT NULL,
  forecast_error_mean DOUBLE PRECISION NOT NULL,
  sample_count INTEGER NOT NULL,
  window_days INTEGER NOT NULL,
  last_sample_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_city_calibrations_city ON city_calibrations(city_key);
