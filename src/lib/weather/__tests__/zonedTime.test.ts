import { describe, it, expect } from "vitest";
import { utcInstantForLocalNoon, leadTimeHoursToForecastLocalNoon } from "../zonedTime";

describe("utcInstantForLocalNoon", () => {
  it("produces 12:00 local wall time on the given date in America/New_York", () => {
    const d = utcInstantForLocalNoon("2026-07-15", "America/New_York");
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(d);
    expect(parseInt(hour, 10)).toBe(12);
  });
});

describe("leadTimeHoursToForecastLocalNoon", () => {
  it("returns a finite difference for a fixed snapshot and date", () => {
    const h = leadTimeHoursToForecastLocalNoon(
      "2026-07-15T10:00:00.000Z",
      "2026-07-15",
      "America/New_York"
    );
    expect(Number.isFinite(h)).toBe(true);
  });
});
