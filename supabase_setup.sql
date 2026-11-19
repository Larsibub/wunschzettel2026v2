-- ============================================================
--  WUNSCHZETTEL – Supabase Setup  (Korrigiert nach ARCHITEKTUR.md)
-- ============================================================

-- 0) Extension sicherstellen (gen_random_uuid)
create extension if not exists "pgcrypto";

-- 1) Tabelle "wishes" (Abschnitt 3.1)
drop table if exists public.wishes cascade;

create table public.wishes (
  id          uuid          primary key default gen_random_uuid(),
  title       text          not null,
  description text          default '',
  price       numeric(10,2) default 0,
  priority    integer       not null default 1
              constraint wishes_priority_check check (priority between 1 and 3),
  product_url text          default null,
  image_url   text          default null,
  is_reserved boolean       not null default false,
  created_at  timestamptz   not null default now()
);

-- Indexe (häufige Sortierung/Filterung)
create index idx_wishes_created_at on public.wishes (created_at desc);
create index idx_wishes_priority   on public.wishes (priority desc);

-- 2) ROW LEVEL SECURITY auf "wishes" (Abschnitt 3.3)
alter table public.wishes enable row level security;

drop policy if exists "anon_read"   on public.wishes;
drop policy if exists "auth_select" on public.wishes;
drop policy if exists "auth_insert" on public.wishes;
drop policy if exists "auth_update" on public.wishes;
drop policy if exists "auth_delete" on public.wishes;

-- anon: read-only (nur SELECT)
create policy "anon_read"
  on public.wishes for select
  to anon
  using (true);

-- authenticated: volles CRUD
create policy "auth_select"
  on public.wishes for select
  to authenticated
  using (true);

create policy "auth_insert"
  on public.wishes for insert
  to authenticated
  with check (true);

create policy "auth_update"
  on public.wishes for update
  to authenticated
  using (true)
  with check (true);

create policy "auth_delete"
  on public.wishes for delete
  to authenticated
  using (true);

-- 3) Public Storage-Bucket "wish-images" (Abschnitt 3.2)
insert into storage.buckets (id, name, public)
values ('wish-images', 'wish-images', true)
on conflict (id) do update
set public = true;

-- 4) Storage-RLS auf "wish-images" (Abschnitt 3.2)
drop policy if exists "wish_images_public_read" on storage.objects;
drop policy if exists "wish_images_auth_insert" on storage.objects;
drop policy if exists "wish_images_auth_update" on storage.objects;
drop policy if exists "wish_images_auth_delete" on storage.objects;

create policy "wish_images_public_read"
  on storage.objects for select
  using (bucket_id = 'wish-images');

create policy "wish_images_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'wish-images');

create policy "wish_images_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'wish-images')
  with check (bucket_id = 'wish-images');

create policy "wish_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'wish-images');