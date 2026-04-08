-- Point pg_cron HTTP jobs at production Vercel (applied via Supabase MCP / dashboard).
-- Replace f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ before running in a new environment.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'refresh_markets',
  'refresh_external_data',
  'run_pipeline',
  'mark_trades',
  'settle_trades'
);

SELECT cron.schedule(
  'refresh_markets',
  '*/5 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/refresh-markets')
);

SELECT cron.schedule(
  'refresh_external_data',
  '*/10 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/refresh-external-data')
);

SELECT cron.schedule(
  'run_pipeline',
  '3-59/10 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/run-pipeline')
);

SELECT cron.schedule(
  'mark_trades',
  '*/5 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/mark-trades')
);

SELECT cron.schedule(
  'settle_trades',
  '*/30 * * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/settle-trades')
);
