-- Nationwide UK speed cameras, synced from OpenStreetMap by the `camera-sync`
-- Edge Function. This is an authoritative, read-only dataset for the app,
-- kept separate from the crowd-sourced `hazard_reports` table: cameras here
-- are not reported or cleared by users.

create table if not exists public.speed_cameras (
  osm_id bigint primary key,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  direction smallint check (direction between 0 and 359),
  maxspeed text,
  ref text,
  updated_at timestamptz not null default now()
);

-- Bounding-box lookups ("cameras near me") filter on latitude then longitude.
create index if not exists speed_cameras_lat_lng_idx on public.speed_cameras (latitude, longitude);

alter table public.speed_cameras enable row level security;

-- Public OSM data: any signed-in user may read it. There is no write policy,
-- so only the service role (the sync function) can change it.
drop policy if exists "speed_cameras: read for signed-in users" on public.speed_cameras;
create policy "speed_cameras: read for signed-in users" on public.speed_cameras
  for select to authenticated using (true);
