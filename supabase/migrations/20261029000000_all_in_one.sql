-- =====================================================================
-- BOAROUTE: All-In-One upgrade
-- =====================================================================
-- Run after 20261025000000_boaroute_init.sql. Safe to run more than once.
--
-- 1. OMs can no longer change a store's grade. Moving a store to D grade
--    doubled their weekly visit limit, so only an admin (or an OTM) may
--    regrade. Frequency changes stay open to the whole patch.
-- 2. visit_photos: photos taken during a visit, kept permanently in the
--    private task-media bucket under <user id>/visits/ and linked to the
--    visit once it is completed. The monthly export embeds them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Grade lock for OMs
-- ---------------------------------------------------------------------
create or replace function public.update_store_settings(
  p_store_id  uuid,
  p_grade     text,
  p_frequency integer default null
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.stores;
  v_role text;
  v_grade text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_grade is null or p_grade not in ('A', 'B', 'C', 'D') then
    raise exception 'Grade must be A, B, C or D';
  end if;
  if p_frequency is not null and (p_frequency < 0 or p_frequency > 12) then
    raise exception 'Frequency must be between 0 and 12 visits a month';
  end if;

  select s.grade into v_grade from public.stores s
   where s.id = p_store_id
     and (public.is_admin() or s.assigned_manager = any (public.my_route_managers()) or s.id = any (public.my_assigned_store_ids()));
  if not found then
    raise exception 'Store not found';
  end if;

  select p.user_role into v_role from public.profiles p where p.id = auth.uid();
  if v_role = 'OM' and not public.is_admin() and p_grade is distinct from v_grade then
    raise exception 'Only your admin can change a store''s grade'
      using errcode = '42501', hint = 'om_grade_locked';
  end if;

  update public.stores
     set grade              = p_grade,
         frequency_custom   = p_frequency is not null,
         required_frequency = coalesce(p_frequency, required_frequency)
   where id = p_store_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.update_store_settings(uuid, text, integer) from public, anon;
grant execute on function public.update_store_settings(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Visit photos
-- ---------------------------------------------------------------------
create table if not exists public.visit_photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  store_id   uuid not null references public.stores (id) on delete cascade,
  visit_id   uuid references public.visits (id) on delete set null,
  path       text not null unique,
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint visit_photos_path_check check (path ~ '^[0-9a-f-]{36}/visits/[^/]+$')
);
alter table public.visit_photos enable row level security;
create index if not exists visit_photos_user_time_idx on public.visit_photos (user_id, taken_at desc);
create index if not exists visit_photos_visit_idx on public.visit_photos (visit_id);

drop policy if exists "visit_photos: read own or admin" on public.visit_photos;
create policy "visit_photos: read own or admin" on public.visit_photos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Only into your own folder, and only for stores you can see.
drop policy if exists "visit_photos: insert own" on public.visit_photos;
create policy "visit_photos: insert own" on public.visit_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and split_part(path, '/', 1) = (select auth.uid())::text
    and split_part(path, '/', 2) = 'visits'
    and taken_at <= now() + interval '5 minutes'
    and exists (
      select 1 from public.stores s
       where s.id = store_id
         and (public.is_admin() or s.assigned_manager = any (public.my_route_managers()) or s.id = any (public.my_assigned_store_ids()))
    )
  );

drop policy if exists "visit_photos: delete own" on public.visit_photos;
create policy "visit_photos: delete own" on public.visit_photos
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Photos are taken while the visit is still running (before its row exists),
-- so link them when the visit is saved: same person, same store, taken
-- between clock-in and clock-out (5 minutes either side).
create or replace function public.visits_link_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visit_start_time is null then
    return null;
  end if;
  update public.visit_photos p
     set visit_id = new.id
   where p.user_id = new.user_id
     and p.store_id = new.store_id
     and p.visit_id is null
     and p.taken_at between new.visit_start_time - interval '5 minutes'
                        and coalesce(new.visit_end_time, new.visited_at) + interval '5 minutes';
  return null;
end;
$$;

drop trigger if exists visits_link_photos on public.visits;
create trigger visits_link_photos
  after insert on public.visits
  for each row execute function public.visits_link_photos();

notify pgrst, 'reload schema';
