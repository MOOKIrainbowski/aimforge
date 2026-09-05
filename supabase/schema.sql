-- AimonSite — suggestion box and accounts.
--
-- Run this once in the Supabase SQL editor. It is written to be re-runnable:
-- every object is created if missing and every policy is dropped first, so
-- applying it twice is safe.
--
-- The important thing in this file is not the tables, it is the policies.
-- AimonSite ships as static files, so the client is entirely under the
-- player's control: anything it is trusted to decide, it can be made to lie
-- about. Authorship, admin replies and deletion are therefore decided here,
-- against auth.uid(), and the client's word is never taken for any of them.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per account. `is_admin` is set by hand (see the bottom of this
-- file); nothing in the app can write it.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- author_id points at profiles rather than auth.users so PostgREST can embed
-- the author's display name in one request. profiles.id is itself the user id,
-- so this is the same reference with a joinable name attached.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('suggestion', 'bug')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'planned', 'resolved', 'declined')),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- When each reader last opened each thread. Per-viewer, which is why it is a
-- table rather than a column on posts: the unread dot means "new since *you*
-- last looked", and everyone looks at different times.
create table if not exists public.post_reads (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists comments_post_id_idx on public.comments (post_id);

-- ---------------------------------------------------------------------------
-- Who is an admin
-- ---------------------------------------------------------------------------

-- security definer so a policy can ask this without the asker needing to be
-- able to read other people's profile rows. The empty search_path is not
-- decoration: without it, a definer function can be pointed at a different
-- `profiles` by whoever calls it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- A profile row appears the moment an account does, so the app never has to
-- cope with a signed-in user who has nowhere to put a display name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_reads enable row level security;

-- Profiles: everyone signed in can read display names (a board without author
-- names is a board of strangers), and you may edit your own.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ...but not your own admin flag. Column privileges, not a policy: a policy
-- can only say which rows you may touch, never which columns, so this is the
-- mechanism that actually stops a client from promoting itself.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Posts: readable by anyone signed in. You may write one as yourself; you may
-- not write one as somebody else, edit one after the fact, or delete one.
-- Status changes and deletion are the admin's, and only the admin's.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated using (true);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists posts_update_admin on public.posts;
create policy posts_update_admin on public.posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete to authenticated using (public.is_admin());

-- Comments: same shape, plus the one that matters — `by_admin` may only be
-- true if the account writing it actually is one. Without this line the
-- "Admin" badge is a checkbox anybody can tick from the console.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (true);

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and (by_admin = false or public.is_admin()));

drop policy if exists comments_delete_admin on public.comments;
create policy comments_delete_admin on public.comments
  for delete to authenticated using (public.is_admin());

-- Read markers: yours, and invisible to everyone else. That invisibility is
-- what makes the embedded post_reads in one select mean "when I last looked".
drop policy if exists post_reads_own on public.post_reads;
create policy post_reads_own on public.post_reads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Making yourself an admin
-- ---------------------------------------------------------------------------
--
-- Sign in through the app once so the account exists, then run this with your
-- own address. This is deliberately a manual step: there is no first-user
-- promotion and no way to reach it from the client.
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
