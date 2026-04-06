import { z } from "zod";

export const tradeSideSchema = z.enum(["YES", "NO"]);
export const tradeStatusSchema = z.enum(["open", "settled", "cancelled"]);

export const simulatedTradeSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  market_id: z.string().uuid(),
  signal_id: z.string().uuid(),
  side: tradeSideSchema,
  quantity: z.number().int().positive(),
  entry_time: z.string(),
  entry_price: z.number(),
  current_mark_price: z.number().nullable(),
  exit_time: z.string().nullable(),
  exit_price: z.number().nullable(),
  status: tradeStatusSchema,
  unrealized_pnl: z.number(),
  realized_pnl: z.number().nullable(),
  notes: z.string().nullable(),
});

export const settlementSchema = z.object({
  id: z.string().uuid(),
  market_id: z.string().uuid(),
  settled_at: z.string(),
  outcome: z.string(),
  settlement_value: z.number(),
  raw_json: z.record(z.string(), z.unknown()).nullable(),
});

export type SimulatedTradeSchema = z.infer<typeof simulatedTradeSchema>;
export type SettlementSchema = z.infer<typeof settlementSchema>;
