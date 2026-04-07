-- Prediction Market Signal Platform - Cron Job Schedules
-- Requires pg_cron and pg_net extensions (enabled by default on Supabase)
--
-- These jobs call the Next.js API route handlers via HTTP POST.
-- Replace YOUR_APP_URL and YOUR_ETL_CRON_SECRET before deploying.

-- Clear any existing jobs from this migration
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'refresh_markets',
  'refresh_external_data',
  'run_pipeline',
  'mark_trades',
  'settle_trades'
);

-- Refresh markets every 5 minutes
SELECT cron.schedule(
  'refresh_markets',
  '*/5 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ETL_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'YOUR_APP_URL/api/jobs/refresh-markets')
);

-- Refresh external weather data every 10 minutes
SELECT cron.schedule(
  'refresh_external_data',
  '*/10 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ETL_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'YOUR_APP_URL/api/jobs/refresh-external-data')
);

-- Run full pipeline every 10 minutes (offset by 3 min to let external data land)
SELECT cron.schedule(
  'run_pipeline',
  '3-59/10 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ETL_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'YOUR_APP_URL/api/jobs/run-pipeline')
);

-- Mark open trades every 5 minutes
SELECT cron.schedule(
  'mark_trades',
  '*/5 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ETL_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'YOUR_APP_URL/api/jobs/mark-trades')
);

-- Settle trades every 30 minutes
SELECT cron.schedule(
  'settle_trades',
  '*/30 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ETL_CRON_SECRET'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'YOUR_APP_URL/api/jobs/settle-trades')
);
