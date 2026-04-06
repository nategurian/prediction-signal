import type { KalshiMarket } from "./types";

export interface DerivedMarketMetadata {
  market_structure: "binary_threshold" | "bucket_range";
  threshold_value: number | null;
  bucket_lower: number | null;
  bucket_upper: number | null;
}

/**
 * Derive DB market fields from Kalshi API fields first, then title/ticker heuristics.
 * Title-only parsing misses many real Kalshi weather contracts (e.g. "54-55°" without "between").
 */
export function deriveMarketMetadataFromKalshi(km: KalshiMarket): DerivedMarketMetadata {
  const raw = km as Record<string, unknown>;
  const strikeType = String(raw.strike_type ?? "").toLowerCase();
  const floor = typeof raw.floor_strike === "number" ? raw.floor_strike : null;
  const cap = typeof raw.cap_strike === "number" ? raw.cap_strike : null;

  if (strikeType === "between" && floor != null && cap != null) {
    return {
      market_structure: "bucket_range",
      threshold_value: null,
      bucket_lower: floor,
      bucket_upper: cap,
    };
  }

  const title = km.title ?? "";

  const rangeMatch = title.match(/(\d+)\s*-\s*(\d+)\s*°/i);
  if (rangeMatch) {
    const lower = parseInt(rangeMatch[1], 10);
    const upper = parseInt(rangeMatch[2], 10);
    return {
      market_structure: "bucket_range",
      threshold_value: null,
      bucket_lower: lower,
      bucket_upper: upper,
    };
  }

  const aboveMatch = title.match(/[>≥]\s*(\d+)\s*°/i);
  if (aboveMatch) {
    return {
      market_structure: "binary_threshold",
      threshold_value: parseInt(aboveMatch[1], 10),
      bucket_lower: null,
      bucket_upper: null,
    };
  }

  const fMatch = title.match(/(\d+)\s*°?\s*F/i);
  if (fMatch) {
    return {
      market_structure: "binary_threshold",
      threshold_value: parseInt(fMatch[1], 10),
      bucket_lower: null,
      bucket_upper: null,
    };
  }

  const tMatch = km.ticker?.match(/-T(\d+)(?:-|$)/i);
  if (tMatch) {
    return {
      market_structure: "binary_threshold",
      threshold_value: parseInt(tMatch[1], 10),
      bucket_lower: null,
      bucket_upper: null,
    };
  }

  return {
    market_structure: "binary_threshold",
    threshold_value: null,
    bucket_lower: null,
    bucket_upper: null,
  };
}
