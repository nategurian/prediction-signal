/**
 * Find the UTC instant when the clock reads 12:00 in `timeZone` on `dateYmd` (YYYY-MM-DD).
 */
export function utcInstantForLocalNoon(dateYmd: string, timeZone: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) {
    return new Date(NaN);
  }

  let t = Date.UTC(y, m - 1, d, 17, 0, 0);
  for (let i = 0; i < 48; i++) {
    const date = new Date(t);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    ) as Record<string, string>;
    const py = +parts.year;
    const pm = +parts.month;
    const pd = +parts.day;
    const ph = +parts.hour;
    const pmin = +parts.minute;
    if (py === y && pm === m && pd === d && ph === 12 && pmin < 1) {
      return date;
    }
    const diffHours = 12 - ph + (0 - pmin) / 60;
    t += diffHours * 3600000;
  }
  return new Date(t);
}

/** Hours from `forecastTimestampIso` to local noon on `forecastDateYmd` in `timeZone`. */
export function leadTimeHoursToForecastLocalNoon(
  forecastTimestampIso: string,
  forecastDateYmd: string,
  timeZone: string
): number {
  const now = new Date(forecastTimestampIso).getTime();
  const noon = utcInstantForLocalNoon(forecastDateYmd, timeZone).getTime();
  if (Number.isNaN(noon)) return NaN;
  return (noon - now) / (1000 * 60 * 60);
}
