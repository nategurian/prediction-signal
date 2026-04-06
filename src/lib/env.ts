import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  KALSHI_API_KEY_ID: z.string().min(1),
  KALSHI_PRIVATE_KEY: z.string().min(1),
  KALSHI_DEMO: z.string().default("true"),
  OPENAI_API_KEY: z.string().min(1),
  ETL_CRON_SECRET: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env = getEnv();
