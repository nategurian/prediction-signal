import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";

/**
 * Base URL for internal pipeline HTTP calls. Must be the deployed origin, not localhost.
 * - Prefer NEXT_PUBLIC_SITE_URL in env (set in Vercel to https://your-app.vercel.app).
 * - On Vercel, VERCEL_URL is always set (e.g. proj.vercel.app) — use it if SITE_URL is missing.
 *   Without this, run-pipeline defaults to localhost and every sub-job silently fails to reach prod.
 */
function getPipelineBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

async function callJob(
  baseUrl: string,
  path: string,
  secret: string
): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> {
  const url = `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: (data as { error?: string })?.error };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  const baseUrl = getPipelineBaseUrl();
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
      return NextResponse.json(
        {
          ok: false,
          failed_step: step,
          pipeline_base_url: baseUrl,
          results,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, pipeline_base_url: baseUrl, results });
}
