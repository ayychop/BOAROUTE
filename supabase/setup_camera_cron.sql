-- Daily speed-camera sync via pg_cron + pg_net.
--
-- Run this ONCE in the Supabase SQL editor. It is NOT a migration (kept out of
-- supabase/migrations/ on purpose): it is environment-specific and pulls a
-- secret from Vault, so it must not run on every `db push`.
--
-- Prereqs: the camera-sync function is deployed and its CRON_SECRET is set.
-- Replace <project-ref> and <CRON_SECRET> below with your real values.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the values the job needs in Vault (run once). To change them later use
-- vault.update_secret(); re-running create_secret for an existing name errors.
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/camera-sync', 'camera_sync_url');
select vault.create_secret('<CRON_SECRET>', 'camera_sync_secret');

-- Schedule 03:00 every day. cron.schedule upserts by job name, so re-running
-- this just updates the existing job.
select cron.schedule(
  'camera-sync-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'camera_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'camera_sync_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);

-- Inspect:  select jobid, schedule, jobname, active from cron.job where jobname = 'camera-sync-daily';
-- Last runs: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'camera-sync-daily') order by start_time desc limit 5;
-- Stop it:   select cron.unschedule('camera-sync-daily');
