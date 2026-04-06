import { z } from "zod";

export const marketStructureSchema = z.enum(["binary_threshold", "bucket_range"]);
export const marketStatusSchema = z.enum(["active", "closed", "settled"]);

export const marketSchema = z.object({
  id: z.string().uuid(),
  ticker: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  niche_key: z.string(),
  city_key: z.string(),
  market_structure: marketStructureSchema,
  market_date: z.string().nullable(),
  threshold_value: z.number().nullable(),
  bucket_lower: z.number().nullable(),
  bucket_upper: z.number().nullable(),
  close_time: z.string().nullable(),
  settlement_time: z.string().nullable(),
  status: marketStatusSchema,
  raw_json: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const marketSnapshotSchema = z.object({
  id: z.string().uuid(),
  market_id: z.string().uuid(),
  captured_at: z.string(),
  yes_bid: z.number().nullable(),
  yes_ask: z.number().nullable(),
  no_bid: z.number().nullable(),
  no_ask: z.number().nullable(),
  last_price: z.number().nullable(),
  implied_probability: z.number().nullable(),
  volume: z.number().nullable(),
  raw_json: z.record(z.string(), z.unknown()).nullable(),
});

export type MarketSchema = z.infer<typeof marketSchema>;
export type MarketSnapshotSchema = z.infer<typeof marketSnapshotSchema>;
