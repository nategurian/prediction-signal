/**
 * Approximate long-run average daily **high** (°F) by calendar day for NYC-area climate.
 * Linear interpolation between monthly anchor values (roughly mid-month behavior).
 */
const NYC_MONTHLY_AVG_HIGH_F = [
  39, 42, 50, 61, 71, 80, 85, 84, 77, 66, 55, 45,
] as const;

/**
 * @param dateYmd - Forecast valid date `YYYY-MM-DD`.
 */
export function climatologyNormalHighFahrenheit(
  cityKey: string,
  dateYmd: string
): number {
  if (cityKey !== "nyc") {
    return 65;
  }
  const parts = dateYmd.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || month < 1 || month > 12 || day < 1) {
    return 65;
  }

  const dim = new Date(year, month, 0).getDate();
  const dayClamped = Math.min(day, dim);
  const pos = month + (dayClamped - 1) / dim;
  const i0 = Math.floor(pos) - 1;
  const frac = pos - Math.floor(pos);
  const v0 = NYC_MONTHLY_AVG_HIGH_F[((i0 % 12) + 12) % 12];
  const i1 = i0 >= 11 ? 0 : i0 + 1;
  const v1 = NYC_MONTHLY_AVG_HIGH_F[i1];
  return v0 + frac * (v1 - v0);
}
