import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";

async function callJob(baseUrl: string, path: string, secret: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const secret = process.env.ETL_CRON_SECRET!;

  const steps = [
    "/api/jobs/refresh-markets",
    "/api/jobs/refresh-external-data",
    "/api/jobs/run-model",
    "/api/jobs/run-signals",
    "/api/jobs/mark-trades",
    "/api/jobs/settle-trades",
  ];

  const results: Record<string, unknown> = {};

  for (const step of steps) {
    const result = await callJob(baseUrl, step, secret);
    results[step] = result;
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        failed_step: step,
        results,
      }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, results });
}
