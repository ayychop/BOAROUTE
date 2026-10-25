-- =====================================================================
-- BOAROUTE initial schema
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to re-run (including over an earlier version of this file): tables
-- use IF NOT EXISTS, new columns use ADD COLUMN IF NOT EXISTS, policies are
-- dropped and recreated, and the store seed skips rows that already exist.
--
-- Contents: profiles, stores (Jo / Sarah / David seeds), visits, events,
-- tasks + task-media storage, mileage_logs, expenses, onboarding fields
-- (current mileage, working days, chosen stores), personal budgets,
-- RLS on everything.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Admin allowlist
-- Anyone who signs up with an email in this table becomes an admin and
-- gets the HP13 6BU starting location. Everyone else is a regular user.
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (
  email text primary key
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (email)
values ('ayychop@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  role              text not null default 'user' check (role in ('admin', 'user')),
  name              text,
  vehicle_model     text,
  starting_location text,
  -- Personal monthly visit targets per grade (anyone, admin included).
  -- NULL means "use the default" (A 4, B 3, C 2, D 1).
  freq_a            smallint check (freq_a between 0 and 31),
  freq_b            smallint check (freq_b between 0 and 31),
  freq_c            smallint check (freq_c between 0 and 31),
  freq_d            smallint check (freq_d between 0 and 31),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Whose stores this person routes. Admin-controlled.
-- Defaults: admin {Joseph}; users {Joseph, Pete}; users named David {David};
-- users named Marcia {Marcia}.
alter table public.profiles add column if not exists route_managers text[];

-- Role check used by every policy below. SECURITY DEFINER so it can read
-- profiles without recursing through the profiles RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Users may edit their own profile but never promote themselves.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is NULL for the SQL editor and the service role.
  if auth.uid() is not null then
    if new.role is distinct from old.role and not public.is_admin() then
      raise exception 'Only an admin can change roles';
    end if;
    if new.route_managers is distinct from old.route_managers and not public.is_admin() then
      raise exception 'Only an admin can change route assignments';
    end if;
    new.email := old.email;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles: insert own as user" on public.profiles;
create policy "profiles: insert own as user" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'user');

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles: admin update any" on public.profiles;
create policy "profiles: admin update any" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Stores
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.profiles (id) on delete set null,
  name               text not null unique,
  address            text not null,
  grade              text not null check (grade in ('A', 'B', 'C', 'D')),
  required_frequency integer not null default 1 check (required_frequency between 0 and 31),
  visits_completed   integer not null default 0,
  last_visit_date    timestamptz,
  assigned_manager   text not null default 'Joseph' check (assigned_manager in ('Joseph', 'Pete', 'David', 'Marcia')),
  vibe               text,
  latitude           double precision,
  longitude          double precision,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.stores enable row level security;
create index if not exists stores_manager_idx on public.stores (assigned_manager);

-- Older versions of this file allowed fewer managers.
alter table public.stores drop constraint if exists stores_assigned_manager_check;
alter table public.stores
  add constraint stores_assigned_manager_check check (assigned_manager in ('Joseph', 'Pete', 'David', 'Marcia'));

-- Default monthly frequency by grade: A 4, B 3, C 2, D 1.
create or replace function public.stores_set_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.grade is distinct from old.grade then
    new.required_frequency := case new.grade
      when 'A' then 4 when 'B' then 3 when 'C' then 2 else 1 end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stores_defaults on public.stores;
create trigger stores_defaults
  before insert or update on public.stores
  for each row execute function public.stores_set_defaults();

drop policy if exists "stores: read for signed-in users" on public.stores;
create policy "stores: read for signed-in users" on public.stores
  for select to authenticated
  using (true);

drop policy if exists "stores: admin insert" on public.stores;
create policy "stores: admin insert" on public.stores
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "stores: admin update" on public.stores;
create policy "stores: admin update" on public.stores
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "stores: admin delete" on public.stores;
create policy "stores: admin delete" on public.stores
  for delete to authenticated
  using (public.is_admin());

-- Any signed-in user may correct a store address (and its map pin).
-- This is the only store column non-admins can change, so it goes through
-- a narrow function instead of a broad UPDATE policy.
create or replace function public.update_store_address(
  p_store_id  uuid,
  p_address   text,
  p_latitude  double precision default null,
  p_longitude double precision default null
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address text := btrim(coalesce(p_address, ''));
  v_row public.stores;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if char_length(v_address) < 5 or char_length(v_address) > 300 then
    raise exception 'Address must be between 5 and 300 characters';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180)) then
    raise exception 'Invalid coordinates';
  end if;

  update public.stores
     set address   = v_address,
         latitude  = coalesce(p_latitude, latitude),
         longitude = coalesce(p_longitude, longitude)
   where id = p_store_id
  returning * into v_row;

  if not found then
    raise exception 'Store not found';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.update_store_address(uuid, text, double precision, double precision) from public, anon;
grant execute on function public.update_store_address(uuid, text, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Visits
-- ---------------------------------------------------------------------
create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  visited_at timestamptz not null default now()
);
alter table public.visits enable row level security;
create index if not exists visits_user_time_idx on public.visits (user_id, visited_at desc);
create index if not exists visits_store_idx on public.visits (store_id);

-- Keep stores.visits_completed (all-time total) and last_visit_date in sync.
create or replace function public.refresh_store_visit_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store uuid := coalesce(new.store_id, old.store_id);
begin
  update public.stores s
     set visits_completed = (select count(*) from public.visits v where v.store_id = v_store),
         last_visit_date  = (select max(visited_at) from public.visits v where v.store_id = v_store)
   where s.id = v_store;
  return null;
end;
$$;

drop trigger if exists visits_refresh_stats on public.visits;
create trigger visits_refresh_stats
  after insert or delete on public.visits
  for each row execute function public.refresh_store_visit_stats();

drop policy if exists "visits: read own or admin" on public.visits;
create policy "visits: read own or admin" on public.visits
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "visits: insert own" on public.visits;
create policy "visits: insert own" on public.visits
  for insert to authenticated
  with check (user_id = (select auth.uid()) and visited_at <= now() + interval '1 day');

drop policy if exists "visits: delete own" on public.visits;
create policy "visits: delete own" on public.visits
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Events
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  description     text,
  event_date      timestamptz not null,
  reminder_before boolean not null default true,
  reminder_on_day boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.events enable row level security;
create index if not exists events_user_date_idx on public.events (user_id, event_date);

-- Event types: General, Sales Day, OOH (special work days).
alter table public.events add column if not exists event_type text not null default 'General';
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events
  add constraint events_event_type_check check (event_type in ('General', 'Sales Day', 'OOH'));

drop policy if exists "events: owner all" on public.events;
create policy "events: owner all" on public.events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Tasks & notes (Smart Tasks)
-- media_urls holds object paths inside the private task-media bucket,
-- e.g. '<user id>/<task folder>/photo-1.jpg'. The app signs them on read.
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references public.stores (id) on delete set null,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  content    text not null default '',
  media_urls text[] not null default '{}',
  task_type  text not null default 'note' check (task_type in ('note', 'email')),
  created_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
create index if not exists tasks_user_store_idx on public.tasks (user_id, store_id, created_at desc);

drop policy if exists "tasks: owner all" on public.tasks;
create policy "tasks: owner all" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 6. Storage: private task-media bucket (images and videos, 50 MB each)
-- Each user can only touch files under a folder named after their id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-media', 'task-media', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task-media: owner read" on storage.objects;
create policy "task-media: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "task-media: owner upload" on storage.objects;
create policy "task-media: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "task-media: owner update" on storage.objects;
create policy "task-media: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'task-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "task-media: owner delete" on storage.objects;
create policy "task-media: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 7. New user hook: create the profile, apply admin role + start location
-- ---------------------------------------------------------------------
create or replace function public.default_route_managers(p_is_admin boolean, p_name text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_is_admin then array['Joseph']
    when p_name ilike 'david%' then array['David']
    when p_name ilike 'marcia%' then array['Marcia']
    else array['Joseph', 'Pete']
  end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_name text;
begin
  v_is_admin := exists (
    select 1 from public.app_admins a where lower(a.email) = lower(new.email)
  );
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1));

  insert into public.profiles (id, email, role, name, starting_location, route_managers)
  values (
    new.id,
    new.email,
    case when v_is_admin then 'admin' else 'user' end,
    v_name,
    case when v_is_admin then 'HP13 6BU' else null end,
    public.default_route_managers(v_is_admin, v_name)
  )
  on conflict (id) do nothing;

  -- Seeded stores have no owner until the admin account exists.
  if v_is_admin then
    update public.stores set user_id = new.id where user_id is null;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that already existed before this migration.
insert into public.profiles (id, email, role, name, starting_location, route_managers)
select
  u.id,
  u.email,
  case when a.email is not null then 'admin' else 'user' end,
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1)),
  case when a.email is not null then 'HP13 6BU' else null end,
  public.default_route_managers(
    a.email is not null,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1))
  )
from auth.users u
left join public.app_admins a on lower(a.email) = lower(u.email)
on conflict (id) do update
  set role = case when excluded.role = 'admin' then 'admin' else public.profiles.role end,
      starting_location = coalesce(public.profiles.starting_location, excluded.starting_location),
      route_managers = coalesce(public.profiles.route_managers, excluded.route_managers);

-- ---------------------------------------------------------------------
-- 8. Mileage logs
-- ---------------------------------------------------------------------
create table if not exists public.mileage_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date       date not null default current_date,
  miles      numeric(7, 1) not null check (miles > 0 and miles <= 2000),
  type       text not null check (type in ('work', 'personal')),
  notes      text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
alter table public.mileage_logs enable row level security;
create index if not exists mileage_logs_user_date_idx on public.mileage_logs (user_id, date desc);

drop policy if exists "mileage_logs: owner all" on public.mileage_logs;
create policy "mileage_logs: owner all" on public.mileage_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 9. Expenses (budget rules live in src/lib/budget.ts:
--     standard -> profiles.standard_budget per month (default GBP 60);
--     sales_day + ooh -> shared profiles.sales_day_budget (default GBP 150))
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date       date not null default current_date,
  amount     numeric(10, 2) not null check (amount > 0 and amount <= 10000),
  location   text not null check (char_length(location) between 1 and 200),
  recipient  text not null check (char_length(recipient) between 1 and 200),
  category   text not null default 'standard' check (category in ('standard', 'sales_day', 'ooh')),
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create index if not exists expenses_user_date_idx on public.expenses (user_id, date desc);

drop policy if exists "expenses: owner all" on public.expenses;
create policy "expenses: owner all" on public.expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 10. Seed stores (coordinates pre-geocoded for the route engine)
--     Jo's patch (Joseph) and David's patch (David).
-- ---------------------------------------------------------------------
insert into public.stores (name, address, grade, assigned_manager, vibe, latitude, longitude)
values
  -- Jo's stores (Joseph)
  ('Newbury - Currys', 'Unit 11 Newbury Retail Park, Pinchington Lane, Newbury', 'C', 'Joseph', 'fun and lively', 51.384718, -1.319272),
  ('Oxford Botley - Currys', 'Unit 1, Lamarsh Road, Oxford', 'C', 'Joseph', 'fun and lively', 51.752455, -1.285872),
  ('John Lewis High Wycombe', 'Holmers Farm Way, Cressex Centre, High Wycombe, Bucks', 'A', 'Joseph', 'fun and lively', 51.611126, -0.782828),
  ('John Lewis Reading', 'Broad Street, Reading, Berkshire', 'A', 'Joseph', 'fun and lively', 51.455317, -0.972064),
  ('Didcot - Currys', 'Unit 2 The Orchard Centre, Didcot', 'D', 'Joseph', 'fun and lively', 51.606985, -1.238805),
  ('Newbury Extra - Tesco', 'Pinchington Lane, Newbury, Berkshire', 'C', 'Joseph', 'fun and lively', 51.384383, -1.319874),
  ('Reading Extra - Tesco', 'Napier Road, Reading', 'C', 'Joseph', 'fun and lively', 51.459092, -0.957166),
  ('Reading West Extra - Tesco', 'Portman Road, Reading', 'D', 'Joseph', 'fun and lively', 51.459011, -0.991716),
  ('Aylesbury Extra - Tesco', 'Broadfield Retail Park, Bicester Road, Aylesbury', 'C', 'Joseph', 'fun and lively', 51.816394, -0.800318),
  ('Aylesbury 2 - Tesco', 'Tring Road, Aylesbury', 'D', 'Joseph', 'fun and lively', 51.815187, -0.792220),
  ('Reading - Currys', 'Unit 5 Reading Gate Retail Park, Reading', 'C', 'Joseph', 'fun and lively', 51.422445, -0.980079),
  ('High Wycombe - Currys', 'Unit E Wycombe Retail Park, Ryemead Way, High Wycombe', 'C', 'Joseph', 'fun and lively', 51.619574, -0.719001),
  ('Aylesbury - EE', '40 Friars Square Shopping Centre, Aylesbury', 'A', 'Joseph', 'fun and lively', 51.815701, -0.813119),
  ('High Wycombe: Eden - EE', 'Unit 3 16 Newland Street Eden Shopping Centre, High Wycombe', 'A', 'Joseph', 'fun and lively', 51.629633, -0.754493),
  ('Newbury - EE', '25a Northbrook Street, Newbury', 'B', 'Joseph', 'fun and lively', 51.403415, -1.324253),
  ('Aylesbury - Vodafone', '21 Market Square, Aylesbury', 'A', 'Joseph', 'fun and lively', 51.816042, -0.812468),
  ('High Wycombe - Vodafone', 'Plot 105 12 Union Parade Eden Shopping Centre, High Wycombe', 'A', 'Joseph', 'fun and lively', 51.629652, -0.753172),
  ('Newbury Northbrook St - Vodafone', '85 Northbrook Street, Newbury', 'A', 'Joseph', 'fun and lively', 51.402978, -1.324436),
  ('Witney - Vodafone', 'Unit 10 The Woolgate Centre, Witney', 'C', 'Joseph', 'fun and lively', 51.784968, -1.484700),
  ('Maidenhead - Vodafone', '1 Queens Walk (55 High St), The Nicholson Centre, Maidenhead', 'C', 'Joseph', 'fun and lively', 51.522748, -0.720922),
  ('Reading The Oracle Centre - Vodafone', 'U13 Oracle Centre, Reading', 'A', 'Joseph', 'fun and lively', 51.454258, -0.972426),
  ('High Wycombe - O2', 'Unit 44B, 27 Newland Street, High Wycombe', 'A', 'Joseph', 'fun and lively', 51.629697, -0.755681),
  ('Aylesbury - O2', '34 Friars Square, Aylesbury', 'A', 'Joseph', 'fun and lively', 51.815273, -0.813481),
  ('Oxford - O2', 'Unit SU9a 218 Queen Street, Westgate Centre, Oxford', 'C', 'Joseph', 'fun and lively', 51.750771, -1.260779),
  ('Reading - O2', '20 Broad Street, Reading', 'A', 'Joseph', 'fun and lively', 51.455650, -0.973534),
  ('Maidenhead - O2', '61 High Street, Maidenhead', 'C', 'Joseph', 'fun and lively', 51.410668, -0.672303),
  ('Didcot - O2', 'Unit 22B The Orchard Centre, Didcot', 'D', 'Joseph', 'fun and lively', 51.606985, -1.238805),
  ('Wokingham - Tesco', '78 Finchampstead Road, Wokingham', 'D', 'Joseph', 'fun and lively', 51.403644, -0.838074),
  ('Oxford 2 - Tesco', 'Unit 7 Oxford Retail, Cowley, Oxford', 'D', 'Joseph', 'fun and lively', 51.728032, -1.203064),
  ('Abingdon - Tesco', 'Marcham Road, Abingdon', 'C', 'Joseph', 'fun and lively', 51.668667, -1.305958),
  ('Aylesbury - Currys', 'Aylesbury Shopping Park, Cambridge Street, Aylesbury', 'C', 'Joseph', 'fun and lively', 51.819819, -0.811249),
  ('Didcot - EE', 'Unit 10 Orchard Centre Station Road, Didcot', 'C', 'Joseph', 'fun and lively', 51.607392, -1.240079),
  ('Reading: Broad Street - EE', '114/115 Broad Street, Reading', 'A', 'Joseph', 'fun and lively', 51.455346, -0.971821),
  ('Maidenhead High Street - H3G', '76-78 High Street, Maidenhead', 'C', 'Joseph', 'fun and lively', 51.522724, -0.722051),
  ('Oxford - Vodafone', '3 Cornmarket St, Oxford', 'A', 'Joseph', 'fun and lively', 51.752276, -1.257748),
  ('Wokingham - Vodafone', '11 Market Place, Wokingham', 'D', 'Joseph', 'fun and lively', 51.410148, -0.834101),
  ('High Wycombe Loudwater - Tesco', 'London Road, Loudwater, High Wycombe', 'D', 'Joseph', 'fun and lively', 51.610932, -0.702859),
  ('Oxford: Westgate - EE', 'Unit 31 Westgate Shopping Centre, Oxford', 'C', 'Joseph', 'fun and lively', 51.749570, -1.261835),
  ('John Lewis Oxford', '101 The Westgate, Queen Street, Oxford', 'A', 'Joseph', 'fun and lively', 51.749507, -1.262514),
  ('Oxford Westgate - H3G', 'Unit U49 234 The Westgate, Oxford', 'C', 'Joseph', 'fun and lively', 51.750858, -1.260703),
  ('Didcot - Vodafone', '9a Orchard Street, Didcot', 'D', 'Joseph', 'fun and lively', 51.607155, -1.239111),
  ('Witney - O2', 'Unit 22 Woolgate Shopping Centre, Witney', 'C', 'Joseph', 'fun and lively', 51.785116, -1.484379),
  ('Bracknell - Currys', 'The Peel Centre, Skimped Hill Lane, Bracknell', 'C', 'Joseph', 'fun and lively', 51.413976, -0.758650),
  ('Andover - Currys', 'Unit 2 Churchill Retail Park, New Street, Andover', 'C', 'Joseph', 'fun and lively', 51.215174, -1.474138),
  ('Farnborough - Currys', 'Unit B Farnborough Gate, Farnborough Road, Farnborough', 'C', 'Joseph', 'fun and lively', 51.307465, -0.747348),
  ('Sandhurst Extra - Tesco', 'The Meadows, Marshall Road, Sandhurst, Surrey', 'C', 'Joseph', 'fun and lively', 51.336784, -0.777852),
  ('Aldershot - Tesco', '5 Wellington Avenue, Aldershot, Hampshire', 'D', 'Joseph', 'fun and lively', 51.251115, -0.775389),
  ('Andover Extra - Tesco', 'River Way, Andover, Hampshire', 'C', 'Joseph', 'fun and lively', 51.219715, -1.468514),
  ('Guildford - Tesco', 'Ashenden Road, Guildford, Surrey', 'D', 'Joseph', 'fun and lively', 51.241665, -0.599306),
  ('Fleet - EE', '30B The Hart Ctr, Fleet', 'C', 'Joseph', 'fun and lively', 51.282039, -0.841222),
  ('Andover - EE', '51/53 High Street The Chantry Centre, Andover', 'A', 'Joseph', 'fun and lively', 51.208071, -1.479167),
  ('Guildford: High Street - EE', '92 High Street, Guildford', 'A', 'Joseph', 'fun and lively', 51.235502, -0.573159),
  ('Andover - Vodafone', '39 High Street, Andover', 'B', 'Joseph', 'fun and lively', 51.207824, -1.479584),
  ('Camberley - Vodafone', '11 Cambridge Walk, Camberley', 'A', 'Joseph', 'fun and lively', 51.337542, -0.746583),
  ('Farnborough Princes Mead - Vodafone', 'Unit 1 Princes Mead Shopping Centre, Farnborough', 'A', 'Joseph', 'fun and lively', 51.291874, -0.757132),
  ('Farnham - Vodafone', '32 The Borough, Farnham', 'D', 'Joseph', 'fun and lively', 51.215036, -0.798365),
  ('Guildford 66 High Street - Vodafone', '66 High Street, Guildford', 'A', 'Joseph', 'fun and lively', 51.235281, -0.574007),
  ('Basingstoke Festival - Vodafone', 'Unit 31A Festival Place, Basingstoke', 'A', 'Joseph', 'fun and lively', 51.265284, -1.086100),
  ('Basingstoke - H3G', 'Unit 34, Wesley Walk, Festival Place, Basingstoke', 'C', 'Joseph', 'fun and lively', 51.262826, -1.086198),
  ('Camberley - H3G', 'Unit 9 Princes Walk, Camberley', 'B', 'Joseph', 'fun and lively', 51.339284, -0.746098),
  ('Farnborough - H3G', 'Unit 1, 39 Princes Mead, Farnborough', 'C', 'Joseph', 'fun and lively', 51.291763, -0.758031),
  ('Bracknell - H3G', '48 High Street, Bracknell', 'C', 'Joseph', 'fun and lively', 51.416815, -0.750250),
  ('Camberley - O2', '1 The Square, The Mall Main Square, Camberley', 'A', 'Joseph', 'fun and lively', 51.338088, -0.746306),
  ('Guildford - O2', '59 High Street, Guildford', 'A', 'Joseph', 'fun and lively', 51.235311, -0.574947),
  ('Farnborough - O2', '5 The Meads, Farnborough', 'C', 'Joseph', 'fun and lively', 51.291375, -0.754536),
  ('Bracknell - O2', '28 Bracknell Walk, Bracknell', 'A', 'Joseph', 'fun and lively', 51.416246, -0.749695),
  ('Basingstoke - O2', 'Unit 31 Main Mall, Festival Place, Basingstoke', 'A', 'Joseph', 'fun and lively', 51.265671, -1.086224),
  ('Bracknell North - Tesco', 'County Lane, Warfield, Bracknell', 'C', 'Joseph', 'fun and lively', 51.427501, -0.732720),
  ('Basingstoke - Tesco', 'District Shopping Cen, Chincham, Basingstoke', 'C', 'Joseph', 'fun and lively', 51.283126, -1.060929),
  ('Alton - Vodafone', '72 High Street Alton', 'D', 'Joseph', 'fun and lively', 51.148399, -0.976065),
  ('Basingstoke - EE', 'Unit 33 Wesley Walk Festival Place Shopping Ctr, Basingstoke', 'A', 'Joseph', 'fun and lively', 51.265642, -1.086493),
  ('Aldershot - EE', '39 Union Street, Aldershot', 'C', 'Joseph', 'fun and lively', 51.249350, -0.764966),
  ('Farnham - EE', '43 The Borough, Farnham', 'A', 'Joseph', 'fun and lively', 51.215244, -0.798208),
  ('Farnborough - EE', 'SU4 The Meads, Farnborough', 'B', 'Joseph', 'fun and lively', 51.292221, -0.754592),
  ('Camberley - EE', '9 Cambridge Walk Main Square, Camberley', 'C', 'Joseph', 'fun and lively', 51.337550, -0.746694),
  ('Bracknell (The Lexicon) - Vodafone', 'The Lexicon, 336, Bracknell Walk, Bracknell', 'C', 'Joseph', 'fun and lively', 51.415966, -0.749696),
  ('Guildford - Currys', 'Ladymead Retail Park, Guildford', 'C', 'Joseph', 'fun and lively', 51.248569, -0.579354),
  ('Basingstoke (St. Michael''s Retail Park) - Currys', 'Unit 5-6 St Michael''s Retail Park, The Harrow Way, Basingstoke', 'C', 'Joseph', 'fun and lively', 51.251750, -1.107340),
  -- David's stores (David)
  ('Slough - Currys', 'Unit A Westgate Retail Park, Bath Road, Slough', 'C', 'David', 'reserved', 51.517313, -0.627616),
  ('Chingford - Currys', 'Unit 1 Corktree Retail Park, Hall Lane, Chingford', 'C', 'David', 'reserved', 51.630887, 0.003996),
  ('Tottenham Hale - Currys', 'Tottenham Hale Retail Park, Broad Lane, Tottenham Hale', 'A', 'David', 'reserved', 51.587753, -0.061282),
  ('Romford - Currys', 'Unit 2 Eastern Avenue RP, Romford', 'B', 'David', 'reserved', 51.593442, 0.186322),
  ('Harlow - Currys', 'Units 10-11 Queensgate Rp, Edinburgh Way, Harlow', 'D', 'David', 'reserved', 51.784104, 0.107890),
  ('Beckton - Currys', '7 Beckton Triangle Retail Park, 5 Clapsgate Lane, Beckton', 'B', 'David', 'reserved', 51.523591, 0.071503),
  ('Chadwell Heath - Currys', 'Unit 5 Goodmayes Retail Park, High Road, Chadwell Heath', 'C', 'David', 'reserved', 51.567743, 0.116709),
  ('Friern Barnet - Currys', '11 Friern Barnet Retail Park, Pegasus Way, Friern Barnet', 'B', 'David', 'reserved', 51.611960, -0.144061),
  ('Slough Wellington Ext - Tesco', 'Brunel Way, Wellington Street, Slough', 'D', 'David', 'reserved', 51.510061, -0.589436),
  ('Goodmayes Extra - Tesco', '822 High Road, Romford', 'D', 'David', 'reserved', 51.572974, 0.146471),
  ('Romford Extra - Tesco', '300 Hornchurch Road, Hornchurch', 'D', 'David', 'reserved', 51.565652, 0.191796),
  ('Romford Gallions Cn Ext - Tesco', 'Bryant Avenue, Romford', 'D', 'David', 'reserved', 51.588857, 0.220638),
  ('Borehamwood Extra - Tesco', 'Shenley Road, Borehamwood', 'B', 'David', 'reserved', 51.659275, -0.269358),
  ('Cheshunt Extra - Tesco', 'Brookfield Centre, Cheshunt, Waltham Cross', 'B', 'David', 'reserved', 51.701825, -0.034104),
  ('Gallions Reach Extra - Tesco', '1 Armada Way, Royal Dock Road, Beckton', 'B', 'David', 'reserved', 51.516824, 0.075844),
  ('Colney Hatch Extra - Tesco', 'Coppetts Centre, North Circular Road, North Finchley', 'D', 'David', 'reserved', 51.607247, -0.154955),
  ('Lea Valley Extra - Tesco', '1 Glover Drive, Upper Edmonton', 'B', 'David', 'reserved', 51.609983, -0.048364),
  ('Ponders End Extra - Tesco', '288 High Street, Enfield', 'B', 'David', 'reserved', 51.648058, -0.047665),
  ('Waltham Abbey - Tesco', 'Sewardstone Road, Waltham Abbey', 'D', 'David', 'reserved', 51.646475, -0.010479),
  ('Enfield - Currys', 'De Mandeville Gate, 333 Southbury Road, Enfield', 'C', 'David', 'reserved', 51.647761, -0.057464),
  ('London: Barking - EE', 'Unit 16 Ripple Walk Vicarage Fields Shopping Ctr, Barking', 'A', 'David', 'reserved', 51.538992, 0.080424),
  ('London: Beckton - EE', '14A Gallions Reach Beckton, London', 'C', 'David', 'reserved', 51.516581, 0.078884),
  ('London: Crouch End - EE', '50 The Broadway Crouch End, London', 'D', 'David', 'reserved', 51.579734, -0.123355),
  ('London: East Ham - EE', '109 High Street North East Ham, London', 'A', 'David', 'reserved', 51.536226, 0.052056),
  ('Enfield - EE', '19 Church Street, Enfield', 'A', 'David', 'reserved', 51.652200, -0.081500),
  ('Ilford - EE', '163 High Road, Ilford', 'A', 'David', 'reserved', 51.559843, 0.071874),
  ('Romford - EE', 'F4 Liberty Shopping Ctr, Romford', 'A', 'David', 'reserved', 51.578175, 0.183102),
  ('Slough - EE', '162 High Street, Slough', 'A', 'David', 'reserved', 51.497918, -0.544077),
  ('Uxbridge - EE', '53 High Street The Pavillions, Uxbridge', 'A', 'David', 'reserved', 51.546584, -0.480184),
  ('London: Wood Green - EE', '14 Cheapside High Road Wood Green, London', 'A', 'David', 'reserved', 51.594579, -0.109520),
  ('Harlow - EE', 'Unit 5 Harvey Shopping Ctr, Harlow', 'A', 'David', 'reserved', 51.783763, 0.108942),
  ('London: Tottenham Hale - EE', 'UC2 Tottenham Hale Retail Prk Tottenham, London', 'A', 'David', 'reserved', 51.587753, -0.061282),
  ('Enfield - Voda', '21 Church Street. Enfield. Middlesex', 'A', 'David', 'reserved', 51.652200, -0.081500),
  ('Harlow Broadwalk - Voda', '33 Broadwalk. Harlow', 'C', 'David', 'reserved', 51.770338, 0.094967),
  ('Slough - Voda', '139 High Street. Slough', 'C', 'David', 'reserved', 51.509947, -0.596703),
  ('Brentwood II - H3G', 'Unit 9, Baytree Centre, Brentwood', 'A', 'David', 'reserved', 51.619327, 0.302304),
  ('Ilford - H3G', 'Unit 73, The Exchange Shopping Centre, High Road, Ilford', 'A', 'David', 'reserved', 51.558273, 0.071167),
  ('Uxbridge II - H3G', '119 The Chimes, Uxbridge', 'A', 'David', 'reserved', 51.545445, -0.476483),
  ('Harlow - O2', '35 Broadwalk, HARLOW', 'A', 'David', 'reserved', 51.770338, 0.094967),
  ('Ilford - O2', 'Unit 70 Middle Level, The Exchange Centre, ILFORD', 'A', 'David', 'reserved', 51.558273, 0.071167),
  ('Enfield - O2', 'Unit 20 Shopping Precinct, Palace Gardens, ENFIELD', 'A', 'David', 'reserved', 51.650953, -0.082389),
  ('Romford - O2', 'G14 Lockwood Walk, Liberty Centre, ROMFORD', 'A', 'David', 'reserved', 51.577629, 0.183192),
  ('Uxbridge - O2', '234 The Chimes Shopping Centre, UXBRIDGE', 'A', 'David', 'reserved', 51.545706, -0.477538),
  ('Harlow Church Langley - Tesco', 'Church Langley Way, Harlow', 'D', 'David', 'reserved', 51.765923, 0.131021),
  ('Potters Bar - Tesco', 'Mutton Lane, Potters Bar', 'D', 'David', 'reserved', 51.692775, -0.182298),
  ('HARLOW EDINBURGH WAY - Tesco', '29 EAST ROAD, HARLOW', 'B', 'David', 'reserved', 51.785513, 0.123838),
  ('Highams Park - Tesco', '405 Larkshall Road, Chingford, Highams Park, London', 'B', 'David', 'reserved', 51.619361, -0.000046),
  ('Uxbridge Chimes Centre - Voda', 'Unit 240. Chimes Centre. Uxbridge', 'A', 'David', 'reserved', 51.545598, -0.477307),
  ('Hertford - Tesco', 'Ware Rd Hertford', 'B', 'David', 'reserved', 51.797221, -0.072410),
  ('Ilford The Exchange - Voda', 'Unit 67 The Exchange Shopping Centre Ilford Essex', 'A', 'David', 'reserved', 51.559843, 0.071874),
  ('London Wood Green - Voda', 'Unit 46 Cavendish Walk Wood Green Shopping City Wood Green London', 'A', 'David', 'reserved', 51.594579, -0.109520),
  ('Barkingside - Voda', '94 High Street, Barkingside', 'C', 'David', 'reserved', 51.590978, 0.083121),
  ('Waltham Cross - Voda', '2 High Street .Waltham Cross', 'D', 'David', 'reserved', 51.686100, -0.033116),
  ('London: Palmers Green - EE', '333 Green Lanes Palmers Green, London', 'D', 'David', 'reserved', 51.615790, -0.109588),
  ('Waltham Cross - EE', '127/129 High Street Waltham Cross, Enfield', 'C', 'David', 'reserved', 51.682374, -0.033438),
  ('Wood Green - O2', '81 High Road, WOOD GREEN', 'A', 'David', 'reserved', 51.592658, -0.106375),
  ('Brentwood - Voda', '20 High Street, Brentwood', 'A', 'David', 'reserved', 51.620694, 0.304304),
  ('Loughton - Voda', '210 High road, Loughton', 'A', 'David', 'reserved', 51.647809, 0.055309),
  ('Borehamwood - Voda', '2 Keystone Passage, Shenley Road, Borehamwood', 'D', 'David', 'reserved', 51.655530, -0.276405),
  ('Romford SC - H3G', 'Unit 5, Liberty Centre, Romford', 'A', 'David', 'reserved', 51.578175, 0.183102),
  ('Edmonton Green - EE', '30 South Mall Edmonton Green SC, London', 'A', 'David', 'reserved', 51.623644, -0.058627),
  ('Wood Green HS - H3G', 'Unit 3 The Mall, 88 High Road, Wood Green', 'A', 'David', 'reserved', 51.594240, -0.109277),
  ('Slough HS - H3G', 'Unit 2, 188 High St, Slough', 'A', 'David', 'reserved', 51.507716, -0.588232),
  ('London Muswell Hill - Voda', '211 Muswell Hill Broadway, London', 'D', 'David', 'reserved', 51.592516, -0.143269),
  ('Slough High Street - O2', '146 High Street, Slough', 'A', 'David', 'reserved', 51.483653, -0.522189)
on conflict (name) do nothing;

-- Give seeded stores to the admin if the admin already signed up.
update public.stores
   set user_id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
 where user_id is null;

-- ---------------------------------------------------------------------
-- 11. Onboarding: odometer, working days and each person's own stores
-- ---------------------------------------------------------------------
-- Odometer reading in miles. Logged trips add to it automatically (below).
alter table public.profiles add column if not exists current_mileage numeric(9, 1);
-- Days of the week this person works, 0 = Sunday ... 6 = Saturday.
alter table public.profiles add column if not exists working_days smallint[] not null default '{1,2,3,4,5}';
-- Set when the onboarding flow is finished. NULL sends the person through it.
alter table public.profiles add column if not exists onboarded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_current_mileage_check;
alter table public.profiles add constraint profiles_current_mileage_check
  check (current_mileage is null or current_mileage between 0 and 999999);
alter table public.profiles drop constraint if exists profiles_working_days_check;
alter table public.profiles add constraint profiles_working_days_check
  check (working_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(working_days) <= 7);

-- Logging, editing or deleting a trip moves the odometer by the same miles.
create or replace function public.apply_mileage_to_odometer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_delta numeric;
begin
  if tg_op = 'INSERT' then
    v_user := new.user_id; v_delta := new.miles;
  elsif tg_op = 'DELETE' then
    v_user := old.user_id; v_delta := -old.miles;
  else
    if new.user_id is distinct from old.user_id then
      update public.profiles set current_mileage = greatest(0, current_mileage - old.miles)
       where id = old.user_id and current_mileage is not null;
      v_user := new.user_id; v_delta := new.miles;
    else
      v_user := new.user_id; v_delta := new.miles - old.miles;
    end if;
  end if;

  if v_delta <> 0 then
    update public.profiles
       set current_mileage = least(999999, greatest(0, current_mileage + v_delta))
     where id = v_user and current_mileage is not null;
  end if;
  return null;
end;
$$;
revoke execute on function public.apply_mileage_to_odometer() from public, anon, authenticated;

drop trigger if exists mileage_logs_odometer on public.mileage_logs;
create trigger mileage_logs_odometer
  after insert or update of miles, user_id or delete on public.mileage_logs
  for each row execute function public.apply_mileage_to_odometer();

-- Stores each person has chosen as theirs during onboarding (or later in
-- My stores). When someone has none, the app falls back to route_managers.
create table if not exists public.user_stores (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  store_id   uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);
alter table public.user_stores enable row level security;
create index if not exists user_stores_store_idx on public.user_stores (store_id);

drop policy if exists "user_stores: read own or admin" on public.user_stores;
create policy "user_stores: read own or admin" on public.user_stores
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "user_stores: insert own" on public.user_stores;
create policy "user_stores: insert own" on public.user_stores
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_stores: delete own" on public.user_stores;
create policy "user_stores: delete own" on public.user_stores
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 12. Personal monthly budgets (GBP), editable by each person in the app
--     standard_budget: standard expenses. Default GBP 60.
--     sales_day_budget: shared pool for Sales Day and OOH expenses. Default GBP 150.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists standard_budget numeric(8, 2) not null default 60;
alter table public.profiles add column if not exists sales_day_budget numeric(8, 2) not null default 150;

-- Re-assert the defaults in case the columns were created by hand earlier.
alter table public.profiles alter column standard_budget set default 60;
alter table public.profiles alter column sales_day_budget set default 150;

alter table public.profiles drop constraint if exists profiles_standard_budget_check;
alter table public.profiles add constraint profiles_standard_budget_check
  check (standard_budget between 0 and 5000);
alter table public.profiles drop constraint if exists profiles_sales_day_budget_check;
alter table public.profiles add constraint profiles_sales_day_budget_check
  check (sales_day_budget between 0 and 5000);
