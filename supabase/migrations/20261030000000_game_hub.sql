-- BOAROUTE Game Hub: the links people add with the + button.
--
-- Purely additive and safe to run twice: it creates one new table and touches
-- nothing that already exists. Cover images live in the existing private
-- task-media bucket under <user id>/games/, which the bucket's policies already
-- allow, so there is no new storage setup.

create table if not exists public.game_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  url text not null,
  title text not null,
  domain text not null,
  -- Storage path of the cover image, or null when the site shares none.
  cover_path text,
  created_at timestamptz not null default now(),
  constraint game_library_url_check check (url ~ '^https://[^[:space:]]+$' and length(url) <= 2048),
  constraint game_library_title_check check (length(title) between 1 and 80),
  constraint game_library_domain_check check (length(domain) between 1 and 253),
  constraint game_library_cover_check check (cover_path is null or (length(cover_path) <= 300 and cover_path ~ '^[0-9a-f-]{36}/games/[^/]+$')),
  constraint game_library_user_url_unique unique (user_id, url)
);

create index if not exists game_library_user_created_idx on public.game_library (user_id, created_at desc);

alter table public.game_library enable row level security;

-- Each person sees and changes only their own links. The cover must sit in
-- their own folder, so a path cannot point at someone else's files.
drop policy if exists game_library_select_own on public.game_library;
create policy game_library_select_own on public.game_library
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists game_library_insert_own on public.game_library;
create policy game_library_insert_own on public.game_library
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (cover_path is null or split_part(cover_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists game_library_update_own on public.game_library;
create policy game_library_update_own on public.game_library
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (cover_path is null or split_part(cover_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists game_library_delete_own on public.game_library;
create policy game_library_delete_own on public.game_library
  for delete to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
