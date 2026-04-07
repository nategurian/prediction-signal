export interface ForecastValidationResult {
  ok: boolean;
  errors: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reject implausible values before persisting or modeling. */
export function validateForecastPayload(input: {
  forecastedHigh: number;
  forecastDate: string;
  currentTemp: number | null;
  forecastTimestamp: string;
}): ForecastValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(input.forecastedHigh)) {
    errors.push("forecasted_high is not a finite number");
  } else if (input.forecastedHigh < -25 || input.forecastedHigh > 130) {
    errors.push("forecasted_high outside plausible range (-25..130 °F)");
  }

  if (!DATE_RE.test(input.forecastDate)) {
    errors.push("forecast_date must be YYYY-MM-DD");
  } else {
    const t = Date.parse(`${input.forecastDate}T12:00:00Z`);
    if (Number.isNaN(t)) {
      errors.push("forecast_date is not a valid calendar date");
    }
  }

  if (input.currentTemp != null) {
    if (!Number.isFinite(input.currentTemp)) {
      errors.push("current_temp is not a finite number");
    } else if (input.currentTemp < -40 || input.currentTemp > 130) {
      errors.push("current_temp outside plausible range (-40..130 °F)");
    }
  }

  const ts = Date.parse(input.forecastTimestamp);
  if (Number.isNaN(ts)) {
    errors.push("forecast_timestamp is not a valid ISO datetime");
  } else {
    const ageMs = Date.now() - ts;
    const maxAgeMs = 3 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      errors.push("forecast_timestamp is older than 3 hours (stale snapshot)");
    }
    if (ageMs < -60_000) {
      errors.push("forecast_timestamp is more than 1 minute in the future");
    }
  }

  return { ok: errors.length === 0, errors };
}
