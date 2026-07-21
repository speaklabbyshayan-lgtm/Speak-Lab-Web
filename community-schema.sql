-- SpeakLab — Community Announcements widget schema
--
-- RUN THIS in the Supabase Dashboard → SQL Editor → New query.
-- Requires supabase-admin-auth.sql to have been run first (it defines
-- public.is_admin(), which the admin-only policies below rely on).
-- Safe to re-run: everything is idempotent and starter posts only seed once.


-- ── 1. Tables ────────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete set null,
  user_name   text not null,
  user_badge  text default 'Student',
  content     text not null check (char_length(content) between 1 and 500),
  is_pinned   boolean default false,
  likes_count integer default 0,
  created_at  timestamptz default now()
);

create table if not exists public.community_replies (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references public.community_posts(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  user_name  text not null,
  user_badge text default 'Student',
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz default now()
);

create table if not exists public.community_likes (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references public.community_posts(id) on delete cascade,
  user_id    uuid,
  visitor_id text,
  created_at timestamptz default now()
);

-- One like per person per post (logged-in users keyed by user_id, anonymous
-- visitors by the client-generated visitor_id). Duplicate likes are ignored.
create unique index if not exists community_likes_user_unique
  on public.community_likes(post_id, user_id) where user_id is not null;
create unique index if not exists community_likes_visitor_unique
  on public.community_likes(post_id, visitor_id) where visitor_id is not null;

create index if not exists community_replies_post_idx on public.community_replies(post_id);
create index if not exists community_posts_feed_idx on public.community_posts(is_pinned desc, created_at desc);


-- ── 2. Keep likes_count in sync (runs as definer, bypasses RLS) ───────────
create or replace function public.community_bump_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.community_posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists community_likes_count on public.community_likes;
create trigger community_likes_count
  after insert or delete on public.community_likes
  for each row execute function public.community_bump_likes();


-- ── 3. Row Level Security ────────────────────────────────────────────────
alter table public.community_posts   enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_likes   enable row level security;

-- Posts: everyone reads; logged-in users post as themselves; admins pin
-- (update) and delete any; authors may delete their own.
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
  for select using (true);

drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "community_posts_update_admin" on public.community_posts;
create policy "community_posts_update_admin" on public.community_posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts
  for delete to authenticated using (public.is_admin() or auth.uid() = user_id);

-- Replies: everyone reads; logged-in users reply as themselves; admins or the
-- author may delete.
drop policy if exists "community_replies_select" on public.community_replies;
create policy "community_replies_select" on public.community_replies
  for select using (true);

drop policy if exists "community_replies_insert" on public.community_replies;
create policy "community_replies_insert" on public.community_replies
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "community_replies_delete" on public.community_replies;
create policy "community_replies_delete" on public.community_replies
  for delete to authenticated using (public.is_admin() or auth.uid() = user_id);

-- Likes: everyone reads; anyone (visitor or member) may like. No delete policy
-- is exposed, so likes are one-way — the browser remembers what it liked.
drop policy if exists "community_likes_select" on public.community_likes;
create policy "community_likes_select" on public.community_likes
  for select using (true);

drop policy if exists "community_likes_insert" on public.community_likes;
create policy "community_likes_insert" on public.community_likes
  for insert to anon, authenticated with check (true);


-- ── 4. Realtime ──────────────────────────────────────────────────────────
-- Lets the widget receive new posts / replies / likes without a page refresh.
do $$ begin
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_replies;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_likes;
exception when duplicate_object then null; end $$;


-- ── 5. Starter posts (only when the board is empty) ──────────────────────
do $$ begin
  if not exists (select 1 from public.community_posts) then
    insert into public.community_posts (user_name, user_badge, content, is_pinned) values
    ('Shayan', 'Admin 👑', '🎉 Welcome to SpeakLab Community! August batch starts 1st August — only limited seats remaining. Drop your questions below!', true),
    ('Shayan', 'Admin 👑', '📅 FREE Seminar on 28th July in Lahore! Register on WhatsApp: 0301-4497532 — seats are filling fast 🔥', true),
    ('Ali Hassan', 'Student 🎓', 'Just completed Week 2 and I can already feel the difference in how I speak! Best decision ever 🚀', false),
    ('Fatima Malik', 'Student 🎓', 'The mock interview practice in Week 7 was absolutely game-changing. Got my job offer last week! 🎯', false);
  end if;
end $$;
