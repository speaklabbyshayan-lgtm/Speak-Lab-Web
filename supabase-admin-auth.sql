-- SpeakLab — admin authentication + RLS lockdown
--
-- RUN THIS SECOND, after supabase-level-test-schema.sql.
-- Supabase Dashboard → SQL Editor → New query. Safe to re-run.
--
-- What this replaces: admin.html used to gate on a hardcoded prompt() password
-- while the database let the anon key read every enrollment, message and test
-- result. After this script, reads require a logged-in admin.
--
-- ⚠ READ THIS BEFORE RUNNING ⚠
-- Access is granted to the email addresses in public.admin_users, and that
-- address must be a real Supabase Auth user (Dashboard → Authentication →
-- Users). If it isn't, you will lock yourself out of admin.html. To add or
-- recover an admin, come back to this SQL editor and run:
--     insert into public.admin_users (email, note) values ('you@example.com', 'Me');
-- The SQL editor uses the service role and ignores RLS, so it always works.


-- ── 1. Who counts as an admin ────────────────────────────────────────────
create table if not exists public.admin_users (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- Matches the admin address already hardcoded in login.html and
-- student-portal.js, so existing redirects keep working.
insert into public.admin_users (email, note)
values ('speaklabbyshayan@gmail.com', 'Owner')
on conflict (email) do nothing;

alter table public.admin_users enable row level security;


-- ── 2. is_admin() ────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read admin_users regardless of the caller's own
-- permissions. That is also what stops the policy below from recursing: the
-- function runs as the table owner, which bypasses RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Only admins can see the admin list. No insert/update/delete policy exists,
-- so the roster can only be changed from the SQL editor or service role.
drop policy if exists "admin_users_select_admin" on public.admin_users;
create policy "admin_users_select_admin"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());


-- ── 3. Link a test to its enrollment without reading enrollments ─────────
-- /api/level-test used to SELECT from enrollments with the anon key to find
-- the matching row. Once reads are admin-only that would break, so the join
-- moves into the database, where a definer-rights trigger can do it safely.
create or replace function public.link_level_test_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.enrollment_id is null then
    select e.id
      into new.enrollment_id
    from public.enrollments e
    where lower(e.email) = lower(new.student_email)
    order by e.created_at desc
    limit 1;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.level_tests') is null then
    raise notice 'SKIPPED: public.level_tests does not exist. Run supabase-level-test-schema.sql first, then re-run this file.';
  else
    drop trigger if exists level_tests_link_enrollment on public.level_tests;
    create trigger level_tests_link_enrollment
      before insert on public.level_tests
      for each row execute function public.link_level_test_enrollment();

    -- Test results: admin-only reads. Inserts stay open so /api/level-test can
    -- record a submission; there is deliberately no update/delete policy, so a
    -- student cannot rewrite a score.
    drop policy if exists "level_tests_select_anon"  on public.level_tests;
    drop policy if exists "level_tests_select_admin" on public.level_tests;
    create policy "level_tests_select_admin"
      on public.level_tests for select
      to authenticated
      using (public.is_admin());

    raise notice 'level_tests: reads are now admin-only.';
  end if;
end $$;


-- ── 4. Lock down the existing PII tables ─────────────────────────────────
-- enrollments and contact_submissions hold names, emails, phone numbers and
-- message bodies, and were readable by anyone holding the (public) anon key.
--
-- Enabling RLS without an insert policy would break the public enroll and
-- contact forms, so each block guarantees the insert policy first, then
-- restricts reads.

-- 4a. Drop whatever SELECT policies exist today. Policy names differ between
-- projects, so find them rather than guess.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('enrollments', 'contact_submissions')
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    raise notice 'Dropped open SELECT policy "%" on %', pol.policyname, pol.tablename;
  end loop;

  -- A FOR ALL policy also grants reads but may grant writes the forms depend
  -- on, so flag it instead of dropping it blind.
  for pol in
    select policyname, tablename, roles
    from pg_policies
    where schemaname = 'public'
      and tablename in ('enrollments', 'contact_submissions')
      and cmd = 'ALL'
  loop
    raise notice 'REVIEW: policy "%" on % is FOR ALL (roles: %) and may still expose reads.',
      pol.policyname, pol.tablename, pol.roles;
  end loop;
end $$;

-- 4b. enrollments
alter table public.enrollments enable row level security;

drop policy if exists "enrollments_insert_public" on public.enrollments;
create policy "enrollments_insert_public"
  on public.enrollments for insert
  to anon, authenticated
  with check (true);

drop policy if exists "enrollments_select_admin" on public.enrollments;
create policy "enrollments_select_admin"
  on public.enrollments for select
  to authenticated
  using (public.is_admin());

-- Payment status / seat toggles in admin.html.
drop policy if exists "enrollments_update_admin" on public.enrollments;
create policy "enrollments_update_admin"
  on public.enrollments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4c. contact_submissions
alter table public.contact_submissions enable row level security;

drop policy if exists "contact_submissions_insert_public" on public.contact_submissions;
create policy "contact_submissions_insert_public"
  on public.contact_submissions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "contact_submissions_select_admin" on public.contact_submissions;
create policy "contact_submissions_select_admin"
  on public.contact_submissions for select
  to authenticated
  using (public.is_admin());

-- "Mark read" in admin.html.
drop policy if exists "contact_submissions_update_admin" on public.contact_submissions;
create policy "contact_submissions_update_admin"
  on public.contact_submissions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ── 4d. Keep the rest of the admin panel working ─────────────────────────
-- admin.html and admin/students.html used to talk to Supabase as the `anon`
-- role, because the only gate was a prompt() password. They now talk to it as
-- `authenticated`. Any existing policy scoped to `anon` alone therefore stops
-- applying to them, which would break the Student Journey controls and task
-- management.
--
-- RLS policies are permissive and OR'd together, so granting admins explicit
-- access here cannot take away anything that already works — it only
-- guarantees the admin panel keeps functioning after the role change. Tables
-- students also touch (their own progress, their own completions) keep their
-- existing student policies untouched.
do $$
declare t text;
begin
  foreach t in array array['student_progress', 'weekly_tasks', 'task_completions', 'student_badges']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED: table % does not exist.', t;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t
    );
    raise notice 'Admins granted full access to % (existing student policies untouched).', t;
  end loop;
end $$;


-- ── 5. Verify ────────────────────────────────────────────────────────────
-- Run these after the script and read the output.

-- Every policy now on the protected tables:
--   select tablename, policyname, cmd, roles, qual
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('level_tests', 'enrollments', 'contact_submissions', 'admin_users')
--   order by tablename, cmd;

-- RLS must be ON for all four:
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('level_tests', 'enrollments', 'contact_submissions', 'admin_users');

-- Your admin roster:
--   select * from public.admin_users;

-- Confirm the seeded admin actually has a Supabase Auth account — an empty
-- result here means you WILL be locked out of admin.html:
--   select a.email, (u.id is not null) as has_auth_account
--   from public.admin_users a
--   left join auth.users u on lower(u.email) = lower(a.email);
