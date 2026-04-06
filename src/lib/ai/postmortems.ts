import OpenAI from "openai";
import { POSTMORTEM_PROMPT } from "./prompts";
import { insertPostmortem, type SimulatedTrade, type Settlement } from "@/lib/supabase/db";

interface PostmortemResult {
  summary: string;
  reasonCodes: string[];
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
  tradeData: Record<string, unknown>
): Promise<PostmortemResult> {
  const client = getOpenAIClient();

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
      result = { summary: "Postmortem generation failed.", reasonCodes: [] };
    } else {
      const parsed = JSON.parse(content) as PostmortemResult;
      result = {
        summary: parsed.summary || "No summary generated.",
        reasonCodes: parsed.reasonCodes || [],
      };
    }
  } catch (err) {
    console.error("Failed to generate postmortem:", err);
    result = { summary: "Postmortem generation failed.", reasonCodes: [] };
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
