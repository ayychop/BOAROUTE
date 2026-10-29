# camera-sync

Refreshes `public.speed_cameras` from OpenStreetMap (Overpass API) for the
whole UK. It writes with the service-role key, so it is **not** a user
endpoint; it only runs when called with the shared `CRON_SECRET`.

## Deploy

```bash
# Set the shared secret the scheduler will send.
bunx supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
# (optional) a faster Overpass mirror, e.g. https://overpass.kumi.systems/api/interpreter
# bunx supabase secrets set OVERPASS_ENDPOINT="..."

bunx supabase functions deploy camera-sync
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

Run it once by hand to seed the table:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/camera-sync" \
  -H "x-cron-secret: <the CRON_SECRET you set>"
```

## Schedule the weekly refresh (pg_cron)

Cameras change slowly, so weekly is plenty. Run this **once** in the Supabase
SQL editor. Secrets go in Vault, never in the repo.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the values the job needs (run once; update if they change).
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/camera-sync', 'camera_sync_url');
select vault.create_secret('<the CRON_SECRET you set>', 'camera_sync_secret');

select cron.schedule(
  'camera-sync-weekly',
  '0 3 * * 1', -- 03:00 every Monday
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'camera_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'camera_sync_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To stop it: `select cron.unschedule('camera-sync-weekly');`
