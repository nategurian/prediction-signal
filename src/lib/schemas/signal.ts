import { z } from "zod";

export const signalTypeSchema = z.enum(["BUY_YES", "BUY_NO", "NO_TRADE"]);

export const signalSchema = z.object({
  id: z.string().uuid(),
  market_id: z.string().uuid(),
  model_output_id: z.string().uuid(),
  captured_at: z.string(),
  signal_type: signalTypeSchema,
  confidence_score: z.number().min(0).max(1),
  explanation: z.string().nullable(),
  reason_codes_json: z.array(z.string()).nullable(),
  status: z.string(),
  modeled_yes_probability: z.number().min(0).max(1),
  modeled_no_probability: z.number().min(0).max(1),
  effective_yes_entry_price: z.number().nullable(),
  effective_no_entry_price: z.number().nullable(),
  trade_edge_yes: z.number().nullable(),
  trade_edge_no: z.number().nullable(),
  worth_trading: z.boolean(),
  model_version: z.string(),
});

export type SignalSchema = z.infer<typeof signalSchema>;
