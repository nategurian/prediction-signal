#!/usr/bin/env node
/**
 * Applies pg_cron jobs from supabase/migrations/002_cron_jobs.sql with env substitution.
 *
 * Set one of:
 *   DATABASE_URL or POSTGRES_URL (Supabase → Database → URI)
 *   or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD
 *
 * Optional: NEXT_PUBLIC_SITE_URL (no trailing slash). Requires ETL_CRON_SECRET.
 *
 * If direct `db.*.supabase.co` is IPv6-only and your network cannot reach IPv6 (EHOSTUNREACH),
 * set SUPABASE_POOLER_REGION (e.g. us-east-1) or DATABASE_SESSION_POOLER_URL from the dashboard
 * (Connect → Session pooler, IPv4).
 */

import { readFileSync } from "node:fs";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

dotenv.config({ path: resolve(root, ".env") });

function sqlEscapeLiteral(s) {
  return s.replace(/'/g, "''");
}

function firstNonEmpty(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** Supabase Dashboard → Database connection string, or password + project URL. */
function buildDatabaseUrl() {
  const fromEnv = firstNonEmpty("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DIRECT_URL");
  if (fromEnv) return fromEnv;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!supabaseUrl || !password) return null;
  const host = new URL(supabaseUrl).hostname;
  const ref = host.split(".")[0];
  const enc = encodeURIComponent(password);
  return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
}

const templatePath = join(root, "supabase/migrations/002_cron_jobs.sql");
const template = readFileSync(templatePath, "utf8");

const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prediction-signal.vercel.app").replace(/\/$/, "");
const cronSecret = process.env.ETL_CRON_SECRET;

if (!cronSecret) {
  console.error("Missing ETL_CRON_SECRET.");
  process.exit(1);
}

const sql = template
  .replace(/YOUR_APP_URL/g, base)
  .replace(/YOUR_ETL_CRON_SECRET/g, sqlEscapeLiteral(cronSecret));

const databaseUrl = buildDatabaseUrl();
const { default: pg } = await import("pg");
const { default: parseConnectionString } = await import("pg-connection-string");

function getExplicitPoolerUrl() {
  return firstNonEmpty("DATABASE_SESSION_POOLER_URL", "DATABASE_POOLER_URL");
}

/** Session pooler (IPv4) — user postgres.[ref]; see Supabase Connect → Session pooler. */
function buildSessionPoolerUrlForRegion(region) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !databaseUrl) return null;
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const cfg = parseConnectionString.parse(databaseUrl);
  if (!cfg.password) return null;
  return `postgresql://postgres.${ref}:${encodeURIComponent(cfg.password)}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
}

function poolerRegionCandidates() {
  const fromEnv = process.env.SUPABASE_POOLER_REGIONS || process.env.SUPABASE_POOLER_REGION;
  if (fromEnv && !fromEnv.includes(",")) return [fromEnv.trim()];
  if (fromEnv) return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return ["us-east-1", "us-west-1", "eu-west-1", "ap-southeast-1", "eu-central-1"];
}

function shouldRetryWithPooler(err) {
  const c = err?.code;
  return c === "EHOSTUNREACH" || c === "ENETUNREACH" || c === "ENOTFOUND" || c === "EAI_AGAIN";
}

/**
 * Supabase `db.*.supabase.co` is often IPv6-only; Node's dns.lookup() returns ENOTFOUND.
 * Resolve with resolve6/resolve4, set `host` on the parsed config (URL() cannot swap in IPv6 reliably).
 */
async function buildClientConfig(connectionString) {
  const cfg = parseConnectionString.parseIntoClientConfig(connectionString);
  const hostname = cfg.host;
  if (!hostname || /^\[?[0-9a-f:]+]$/i.test(hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return {
      ...cfg,
      ssl: { rejectUnauthorized: false, ...(cfg.ssl && typeof cfg.ssl === "object" ? cfg.ssl : {}) },
    };
  }

  let ip = null;
  try {
    const v6 = await dns.resolve6(hostname);
    if (v6?.length) ip = v6[0];
  } catch {
    /* try v4 */
  }
  if (!ip) {
    try {
      const v4 = await dns.resolve4(hostname);
      if (v4?.length) ip = v4[0];
    } catch {
      return {
        ...cfg,
        ssl: { rejectUnauthorized: false, ...(cfg.ssl && typeof cfg.ssl === "object" ? cfg.ssl : {}) },
      };
    }
  }

  return {
    ...cfg,
    host: ip,
    ssl: {
      rejectUnauthorized: false,
      servername: hostname,
      ...(cfg.ssl && typeof cfg.ssl === "object" ? cfg.ssl : {}),
    },
  };
}

async function runSql(connectionString) {
  const clientConfig = await buildClientConfig(connectionString);
  const client = new pg.Client(clientConfig);
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

if (!databaseUrl) {
  console.error(
    "Missing DB credentials. Add to .env and save:\n" +
      "  DATABASE_URL=postgresql://...   (from Supabase → Database)\n" +
      "  or SUPABASE_DB_PASSWORD=... with NEXT_PUBLIC_SUPABASE_URL already set.\n" +
      "Then: npm run deploy:cron\n"
  );
  console.error(
    "Or run the SQL from supabase/migrations/002_cron_jobs.sql manually (replace YOUR_APP_URL / YOUR_ETL_CRON_SECRET)."
  );
  process.exit(1);
}

try {
  await runSql(databaseUrl);
  console.log("pg_cron jobs applied for app URL:", base);
} catch (e) {
  const explicitPooler = getExplicitPoolerUrl();
  if (explicitPooler && shouldRetryWithPooler(e)) {
    console.error("Direct DB host failed (" + e.code + "), using DATABASE_SESSION_POOLER_URL…");
    try {
      await runSql(explicitPooler);
      console.log("pg_cron jobs applied for app URL:", base);
      process.exit(0);
    } catch (e2) {
      console.error("Failed to apply cron SQL:", e2.message);
      process.exit(1);
    }
  } else if (shouldRetryWithPooler(e)) {
    console.error("Direct DB host failed (" + e.code + "), trying session pooler (IPv4)…");
    let lastErr = e;
    for (const region of poolerRegionCandidates()) {
      const pooler = buildSessionPoolerUrlForRegion(region);
      if (!pooler) break;
      try {
        await runSql(pooler);
        console.log("pg_cron jobs applied for app URL:", base, "(session pooler:", region + ")");
        process.exit(0);
      } catch (e2) {
        lastErr = e2;
        if (!String(e2.message).match(/Tenant or user not found|Project not found/i)) {
          console.error("Failed to apply cron SQL:", e2.message);
          process.exit(1);
        }
      }
    }
    console.error("Failed to apply cron SQL:", lastErr?.message || lastErr);
    console.error(
      "Paste Session pooler URI from Supabase → Connect → Session pooler into DATABASE_SESSION_POOLER_URL in .env (IPv4; includes correct region)."
    );
    process.exit(1);
  } else {
    console.error("Failed to apply cron SQL:", e.message);
    process.exit(1);
  }
}
