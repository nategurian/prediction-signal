import OpenAI from "openai";
import { SIGNAL_EXPLANATION_PROMPT, NO_TRADE_EXPLANATION_PROMPT } from "./prompts";

interface ExplanationResult {
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

export async function generateSignalExplanation(
  signalData: Record<string, unknown>
): Promise<ExplanationResult> {
  const client = getOpenAIClient();

  const prompt = fillTemplate(SIGNAL_EXPLANATION_PROMPT, {
    signalData: JSON.stringify(signalData, null, 2),
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { summary: "Unable to generate explanation.", reasonCodes: [] };

    const parsed = JSON.parse(content) as ExplanationResult;
    return {
      summary: parsed.summary || "No summary generated.",
      reasonCodes: parsed.reasonCodes || [],
    };
  } catch (err) {
    console.error("Failed to generate signal explanation:", err);
    return { summary: "Explanation generation failed.", reasonCodes: [] };
  }
}

export async function generateNoTradeExplanation(
  signalData: Record<string, unknown>
): Promise<ExplanationResult> {
  const client = getOpenAIClient();

  const prompt = fillTemplate(NO_TRADE_EXPLANATION_PROMPT, {
    signalData: JSON.stringify(signalData, null, 2),
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { summary: "Unable to generate explanation.", reasonCodes: [] };

    const parsed = JSON.parse(content) as ExplanationResult;
    return {
      summary: parsed.summary || "No summary generated.",
      reasonCodes: parsed.reasonCodes || [],
    };
  } catch (err) {
    console.error("Failed to generate no-trade explanation:", err);
    return { summary: "Explanation generation failed.", reasonCodes: [] };
  }
}
