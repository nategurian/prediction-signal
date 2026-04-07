import { z } from "zod";

export const modelOutputSchema = z.object({
  id: z.string().uuid(),
  market_id: z.string().uuid(),
  captured_at: z.string(),
  modeled_probability: z.number().min(0).max(1),
  confidence_score: z.number().min(0).max(1),
  feature_json: z.record(z.string(), z.unknown()),
  model_version: z.string(),
  external_data_id: z.string().uuid().nullable().optional(),
});

export const featurePayloadSchema = z.object({
  forecasted_high: z.number(),
  current_temp: z.number().nullable(),
  forecast_timestamp: z.string(),
  previous_forecast_high: z.number().nullable(),
  forecast_revision: z.number().nullable(),
  lead_time_hours_to_forecast_local_noon: z.number().nullable().optional(),
  climatology_normal_high_f: z.number().nullable().optional(),
  forecast_anomaly_vs_climatology_f: z.number().nullable().optional(),
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
