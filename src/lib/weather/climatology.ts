const CLIMATOLOGY_MONTHLY_AVG_HIGH_F: Record<string, readonly number[]> = {
  nyc: [39, 42, 50, 61, 71, 80, 85, 84, 77, 66, 55, 45],
  miami: [76, 78, 80, 83, 87, 90, 91, 91, 89, 86, 81, 77],
};

const GENERIC_FALLBACK = 65;

/**
 * Approximate long-run average daily high (°F) by calendar day.
 * Linear interpolation between monthly anchor values (roughly mid-month behavior).
 */
export function climatologyNormalHighFahrenheit(
  cityKey: string,
  dateYmd: string
): number {
  const anchors = CLIMATOLOGY_MONTHLY_AVG_HIGH_F[cityKey];
  if (!anchors) return GENERIC_FALLBACK;

  const parts = dateYmd.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || month < 1 || month > 12 || day < 1) {
    return GENERIC_FALLBACK;
  }

  const dim = new Date(year, month, 0).getDate();
  const dayClamped = Math.min(day, dim);
  const pos = month + (dayClamped - 1) / dim;
  const i0 = Math.floor(pos) - 1;
  const frac = pos - Math.floor(pos);
  const v0 = anchors[((i0 % 12) + 12) % 12];
  const i1 = i0 >= 11 ? 0 : i0 + 1;
  const v1 = anchors[i1];
  return v0 + frac * (v1 - v0);
}
