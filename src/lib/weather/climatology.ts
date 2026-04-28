const CLIMATOLOGY_MONTHLY_AVG_HIGH_F: Record<string, readonly number[]> = {
  nyc:   [39, 42, 50, 61, 71, 80, 85, 84, 77, 66, 55, 45],
  miami: [76, 78, 80, 83, 87, 90, 91, 91, 89, 86, 81, 77],
  chi:   [32, 36, 47, 59, 70, 80, 85, 83, 76, 62, 49, 36],
  la:    [68, 68, 70, 73, 74, 78, 82, 83, 82, 78, 73, 68],
  den:   [45, 47, 55, 61, 71, 83, 90, 88, 80, 65, 53, 44],
  phil:  [41, 44, 53, 64, 73, 82, 86, 84, 78, 67, 56, 46],
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
