import { describe, it, expect } from "vitest";
import { validateForecastPayload } from "../validateForecast";

describe("validateForecastPayload", () => {
  it("accepts a plausible fresh forecast", () => {
    const r = validateForecastPayload({
      forecastedHigh: 72,
      forecastDate: "2026-07-15",
      currentTemp: 68,
      forecastTimestamp: new Date().toISOString(),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects absurd temperatures", () => {
    const r = validateForecastPayload({
      forecastedHigh: 200,
      forecastDate: "2026-07-15",
      currentTemp: null,
      forecastTimestamp: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects bad date format", () => {
    const r = validateForecastPayload({
      forecastedHigh: 72,
      forecastDate: "07-15-2026",
      currentTemp: null,
      forecastTimestamp: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
  });
});
