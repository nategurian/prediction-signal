import { NextResponse } from "next/server";

export function validateCronSecret(req: Request): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const expected = process.env.ETL_CRON_SECRET;

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
