import { z } from "zod";

export const modelOutputSchema = z.object({
  id: z.string().uuid(),
  market_id: z.string().uuid(),
  captured_at: z.string(),
  modeled_probability: z.number().min(0).max(1),
  confidence_score: z.number().min(0).max(1),
  feature_json: z.record(z.string(), z.unknown()),
  model_version: z.string(),
});

export const featurePayloadSchema = z.object({
  forecasted_high: z.number(),
  current_temp: z.number().nullable(),
  forecast_timestamp: z.string(),
  previous_forecast_high: z.number().nullable(),
  forecast_revision: z.number().nullable(),
  sigma: z.number(),
  threshold: z.number().nullable(),
  bucket_lower: z.number().nullable(),
  bucket_upper: z.number().nullable(),
  market_structure: z.string(),
  yes_bid: z.number().nullable(),
  yes_ask: z.number().nullable(),
  no_bid: z.number().nullable(),
  no_ask: z.number().nullable(),
});

export type ModelOutputSchema = z.infer<typeof modelOutputSchema>;
export type FeaturePayloadSchema = z.infer<typeof featurePayloadSchema>;
