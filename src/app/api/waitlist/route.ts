import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  email: z.string().email(),
  source: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const { email, source } = parsed.data;
  // Stub: log to server. Future: persist to Supabase `waitlist` table.
  console.log(`[waitlist] ${email}${source ? ` (source=${source})` : ""}`);

  return NextResponse.json({ ok: true });
}
