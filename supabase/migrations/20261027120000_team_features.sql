-- ---------------------------------------------------------------------
-- Team features: voice memos and group lunch orders
-- ---------------------------------------------------------------------
-- Everything here is transparent to the person it concerns:
--   * voice_memos are shared team notes, readable by the whole team.
--   * team_orders is the lunch group order, readable by the whole team.
-- Reuses public.is_admin() and public.is_member() from the init migration.

-- ---------------------------------------------------------------------
-- 1. Voice memos: shared team notes. The audio sits in the private
--    voice-memos bucket under a folder named after the author's id; the row
--    here points at it and the whole team can read both.
-- ---------------------------------------------------------------------
create table if not exists public.voice_memos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  store_id         uuid references public.stores (id) on delete set null,
  storage_path     text not null,
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  note             text check (note is null or char_length(note) <= 500),
  created_at       timestamptz not null default now()
);
alter table public.voice_memos enable row level security;

create index if not exists voice_memos_recent_idx on public.voice_memos (created_at desc);
create index if not exists voice_memos_store_idx on public.voice_memos (store_id);

drop policy if exists "voice_memos: team read" on public.voice_memos;
create policy "voice_memos: team read" on public.voice_memos
  for select to authenticated
  using (public.is_member());

drop policy if exists "voice_memos: insert own" on public.voice_memos;
create policy "voice_memos: insert own" on public.voice_memos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member()
    and created_at between now() - interval '5 minutes' and now() + interval '1 minute'
  );

drop policy if exists "voice_memos: delete own or admin" on public.voice_memos;
create policy "voice_memos: delete own or admin" on public.voice_memos
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Private bucket, audio only, 25 MB a memo. Files live under <uid>/..., so a
-- person writes only their own folder; the whole team may read, matching the
-- team-readable voice_memos rows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-memos', 'voice-memos', false, 26214400, array['audio/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "voice-memos: team read" on storage.objects;
create policy "voice-memos: team read" on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-memos' and public.is_member());

drop policy if exists "voice-memos: owner upload" on storage.objects;
create policy "voice-memos: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice-memos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "voice-memos: owner delete" on storage.objects;
create policy "voice-memos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-memos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 2. Group lunch orders. One open order at a time is the norm; anyone on the
--    team can add their items, the person who started it (or the admin)
--    closes it. The car screen reads the open order's running list.
-- ---------------------------------------------------------------------
create table if not exists public.team_orders (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text not null default 'Lunch' check (char_length(title) <= 80),
  place      text check (place is null or char_length(place) <= 80),
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
alter table public.team_orders enable row level security;

create index if not exists team_orders_open_idx on public.team_orders (created_at desc) where status = 'open';

create table if not exists public.team_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.team_orders (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item       text not null check (char_length(item) between 1 and 120),
  note       text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now()
);
alter table public.team_order_items enable row level security;

create index if not exists team_order_items_order_idx on public.team_order_items (order_id, created_at);

drop policy if exists "team_orders: team read" on public.team_orders;
create policy "team_orders: team read" on public.team_orders
  for select to authenticated using (public.is_member());

drop policy if exists "team_orders: insert own" on public.team_orders;
create policy "team_orders: insert own" on public.team_orders
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member() and status = 'open');

drop policy if exists "team_orders: close own or admin" on public.team_orders;
create policy "team_orders: close own or admin" on public.team_orders
  for update to authenticated
  using (created_by = (select auth.uid()) or public.is_admin())
  with check (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists "team_order_items: team read" on public.team_order_items;
create policy "team_order_items: team read" on public.team_order_items
  for select to authenticated using (public.is_member());

-- Add your own items, only to an order that is still open.
drop policy if exists "team_order_items: insert own" on public.team_order_items;
create policy "team_order_items: insert own" on public.team_order_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member()
    and exists (select 1 from public.team_orders o where o.id = order_id and o.status = 'open')
  );

drop policy if exists "team_order_items: delete own or admin" on public.team_order_items;
create policy "team_order_items: delete own or admin" on public.team_order_items
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Realtime: the group order and hazards push live so the car screen
--    and the Lunch tab update without polling.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.team_orders;
    alter publication supabase_realtime add table public.team_order_items;
    alter publication supabase_realtime add table public.hazard_reports;
  end if;
exception
  when duplicate_object then null;
end;
$$;
