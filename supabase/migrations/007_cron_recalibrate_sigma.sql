-- Schedule the empirical forecast-error σ recalibration job.
-- Runs nightly at 03:15 UTC (after trade settlement at midnight local),
-- after which the run-model cron picks up the fresh σ.
--
-- Replace the bearer token before applying in a new environment.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'recalibrate_sigma';

SELECT cron.schedule(
  'recalibrate_sigma',
  '15 3 * * *',
  format($sql$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer f7K2mXqP9vRnT4wL8dYsC1bHjZeA3uNg6oE5iPcQ0yVtMkFwBxRsDlJ'
      ),
      body := '{}'::jsonb
    );
  $sql$, 'https://prediction-signal.vercel.app/api/jobs/recalibrate-sigma')
);
