import OpenAI from "openai";
import { POSTMORTEM_PROMPT } from "./prompts";
import { insertPostmortem, type SimulatedTrade, type Settlement } from "@/lib/supabase/db";

interface PostmortemResult {
  summary: string;
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
  const pYes = num(data.modeled_yes_probability);
  const conf = num(data.confidence_score);
  const title = typeof data.market_title === "string" ? data.market_title : "market";

  const codes: string[] = [];
  if (won) {
    codes.push("model_correct_direction");
    if (edgeOnSide !== null && edgeOnSide < 0.12) codes.push("edge_too_thin");
  } else {
    codes.push("model_wrong_direction");
    if (trade.side === "NO" && entry >= 0.8) codes.push("expensive_no_leg_tail_loss");
    if (trade.side === "YES" && entry <= 0.1) codes.push("cheap_yes_leg_longshot_miss");
    if (edgeOnSide !== null && edgeOnSide < 0.12) codes.push("edge_too_thin");
    if (conf !== null && conf >= 0.8) codes.push("model_overconfidence");
  }

  const outcomeWord = settlement.settlement_value === 1 ? "YES" : "NO";
  const pnlBit = pnl !== null ? ` PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}.` : "";
  const summary = won
    ? `Won ${trade.side} on ${title} (settled ${outcomeWord}).${pnlBit}`
    : `Lost ${trade.side} on ${title} (settled ${outcomeWord}).${pnlBit}`;

  return { summary, reasonCodes: codes };
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function fillTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(`{{${key}}}`, value);
  }
  return result;
}

export async function generateAndSavePostmortem(
  trade: SimulatedTrade,
  settlement: Settlement,
  tradeData: PostmortemTradeData
): Promise<PostmortemResult> {
  const won =
    (trade.side === "YES" && settlement.settlement_value === 1) ||
    (trade.side === "NO" && settlement.settlement_value === 0);

  const prompt = fillTemplate(POSTMORTEM_PROMPT, {
    tradeData: JSON.stringify(tradeData, null, 2),
    outcome: settlement.outcome,
    correctness: won ? "correct" : "incorrect",
    predictedSide: trade.side,
    actualOutcome: settlement.settlement_value === 1 ? "YES" : "NO",
  });

  let result: PostmortemResult;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    result = buildFallbackPostmortem(trade, settlement, tradeData);
  } else {
    const client = getOpenAIClient();
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 300,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        result = buildFallbackPostmortem(trade, settlement, tradeData);
      } else {
        const parsed = JSON.parse(content) as PostmortemResult;
        const summary = parsed.summary?.trim() || "";
        const reasonCodes = Array.isArray(parsed.reasonCodes) ? parsed.reasonCodes : [];
        const llmFailed = summary === "Postmortem generation failed." || summary === "";
        if (llmFailed) {
          result = buildFallbackPostmortem(trade, settlement, tradeData);
        } else {
          const fb = buildFallbackPostmortem(trade, settlement, tradeData);
          result = {
            summary: summary || "No summary generated.",
            reasonCodes: reasonCodes.length > 0 ? reasonCodes : fb.reasonCodes,
          };
        }
      }
    } catch (err) {
      console.error("Failed to generate postmortem:", err);
      result = buildFallbackPostmortem(trade, settlement, tradeData);
    }
  }

  await insertPostmortem({
    simulated_trade_id: trade.id,
    created_at: new Date().toISOString(),
    outcome_label: won ? "winner" : "loser",
    reason_codes_json: result.reasonCodes,
    summary: result.summary,
    structured_json: tradeData,
  });

  return result;
}
