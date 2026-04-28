import OpenAI from "openai";
import { POSTMORTEM_PROMPT } from "./prompts";
import {
  getPostmortemByTrade,
  insertPostmortem,
  updatePostmortemByTradeId,
  type SimulatedTrade,
  type Settlement,
} from "@/lib/supabase/db";

interface PostmortemResult {
  summary: string;
  reasonCodes: string[];
}

interface StructuredPostmortem {
  narrative: string;
  forecast_accuracy: "accurate" | "inaccurate" | "unknown";
  model_calibration: "well_calibrated" | "overconfident" | "underconfident" | "polarity_error";
  primary_failure_mode: "forecast_error" | "model_error" | "edge_too_thin" | "tail_risk" | "none";
  suggested_tuning: string;
  reasonCodes: string[];
}

/** Context stored in `trade_postmortems.structured_json` for dashboards and fallbacks. */
export type PostmortemTradeData = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildFallbackPostmortem(
  trade: SimulatedTrade,
  settlement: Pick<Settlement, "settlement_value">,
  data: PostmortemTradeData
): PostmortemResult {
  const won =
    (trade.side === "YES" && settlement.settlement_value === 1) ||
    (trade.side === "NO" && settlement.settlement_value === 0);

  const entry = trade.entry_price;
  const pnl = num(data.realized_pnl) ?? num(trade.realized_pnl);
  const edgeYes = num(data.trade_edge_yes);
  const edgeNo = num(data.trade_edge_no);
  const edgeOnSide = trade.side === "YES" ? edgeYes : edgeNo;
  const conf = num(data.confidence_score);
  const modeledYes = num(data.modeled_yes_probability);
  const actualTemp = num(data.actual_high_temp);
  const forecastHigh = num(
    (data.model_at_signal as Record<string, unknown> | null)?.feature_json != null
      ? ((data.model_at_signal as Record<string, unknown>).feature_json as Record<string, unknown>)
          ?.forecasted_high
      : null
  );
  const title = typeof data.market_title === "string" ? data.market_title : "market";

  const codes: string[] = [];
  const flags = data.sanity_flags as Record<string, unknown> | null;

  if (flags?.polarity_mismatch) codes.push("polarity_error");

  if (won) {
    codes.push("model_correct_direction");
    if (edgeOnSide !== null && edgeOnSide < 0.12) codes.push("edge_too_thin");
  } else {
    codes.push("model_wrong_direction");
    if (trade.side === "NO" && entry >= 0.8) codes.push("expensive_no_leg_tail_loss");
    if (trade.side === "YES" && entry <= 0.2) codes.push("cheap_yes_leg_longshot_miss");
    if (edgeOnSide !== null && edgeOnSide < 0.12) codes.push("edge_too_thin");
    if (conf !== null && conf >= 0.8) codes.push("model_overconfidence");
  }

  if (flags?.forecast_accurate) codes.push("forecast_was_accurate");
  if (flags?.forecast_inaccurate) codes.push("forecast_was_inaccurate");
  if (flags?.sigma_tail_event) codes.push("sigma_tail_event");

  const outcomeWord = settlement.settlement_value === 1 ? "YES" : "NO";
  const pnlBit = pnl !== null ? ` PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}.` : "";
  const modelBit =
    modeledYes != null ? ` Model P(YES) ~${(modeledYes * 100).toFixed(0)}%.` : "";
  const actualBit =
    actualTemp != null && forecastHigh != null
      ? ` Actual high ${actualTemp}°F vs forecast ${forecastHigh}°F.`
      : "";
  const summary = won
    ? `Won ${trade.side} on ${title} (settled ${outcomeWord}).${pnlBit}${modelBit}${actualBit}`
    : `Lost ${trade.side} on ${title} (settled ${outcomeWord}).${pnlBit}${modelBit}${actualBit}`;

  return { summary, reasonCodes: codes };
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function fillTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

function parseStructuredResponse(content: string): StructuredPostmortem | null {
  try {
    const parsed = JSON.parse(content) as Partial<StructuredPostmortem>;
    const narrative = parsed.narrative?.trim() || "";
    if (!narrative || narrative === "Postmortem generation failed.") return null;

    return {
      narrative,
      forecast_accuracy: parsed.forecast_accuracy ?? "unknown",
      model_calibration: parsed.model_calibration ?? "well_calibrated",
      primary_failure_mode: parsed.primary_failure_mode ?? "none",
      suggested_tuning: parsed.suggested_tuning ?? "",
      reasonCodes: Array.isArray(parsed.reasonCodes) ? parsed.reasonCodes : [],
    };
  } catch {
    return null;
  }
}

export async function generateAndSavePostmortem(
  trade: SimulatedTrade,
  settlement: Settlement,
  tradeData: PostmortemTradeData
): Promise<PostmortemResult> {
  const won =
    (trade.side === "YES" && settlement.settlement_value === 1) ||
    (trade.side === "NO" && settlement.settlement_value === 0);

  const variableLabel = tradeData.variable === "daily_low" ? "low" : "high";

  const prompt = fillTemplate(POSTMORTEM_PROMPT, {
    tradeData: JSON.stringify(tradeData, null, 2),
    outcome: settlement.outcome,
    correctness: won ? "correct" : "incorrect",
    predictedSide: trade.side,
    actualOutcome: settlement.settlement_value === 1 ? "YES" : "NO",
    variableLabel,
  });

  let result: PostmortemResult;
  let structuredResult: StructuredPostmortem | null = null;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    result = buildFallbackPostmortem(trade, settlement, tradeData);
  } else {
    const client = getOpenAIClient();
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 800,
      });

      const content = completion.choices[0]?.message?.content;
      structuredResult = content ? parseStructuredResponse(content) : null;

      if (structuredResult) {
        const fb = buildFallbackPostmortem(trade, settlement, tradeData);
        result = {
          summary: structuredResult.narrative,
          reasonCodes:
            structuredResult.reasonCodes.length > 0
              ? structuredResult.reasonCodes
              : fb.reasonCodes,
        };
      } else {
        result = buildFallbackPostmortem(trade, settlement, tradeData);
      }
    } catch (err) {
      console.error("Failed to generate postmortem:", err);
      result = buildFallbackPostmortem(trade, settlement, tradeData);
    }
  }

  const structuredJson: Record<string, unknown> = { ...tradeData };
  if (structuredResult) {
    structuredJson.llm_analysis = {
      forecast_accuracy: structuredResult.forecast_accuracy,
      model_calibration: structuredResult.model_calibration,
      primary_failure_mode: structuredResult.primary_failure_mode,
      suggested_tuning: structuredResult.suggested_tuning,
    };
  }

  const outcome_label = won ? "winner" : "loser";
  const existing = await getPostmortemByTrade(trade.id);
  if (existing) {
    await updatePostmortemByTradeId(trade.id, {
      summary: result.summary,
      reason_codes_json: result.reasonCodes,
      structured_json: structuredJson,
      outcome_label,
    });
  } else {
    await insertPostmortem({
      simulated_trade_id: trade.id,
      created_at: new Date().toISOString(),
      outcome_label,
      reason_codes_json: result.reasonCodes,
      summary: result.summary,
      structured_json: structuredJson,
    });
  }

  return result;
}
