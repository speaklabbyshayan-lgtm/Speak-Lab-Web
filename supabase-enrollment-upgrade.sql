-- SpeakLab — enrollment upgrade: accounts + batch preference
--
-- RUN THIS THIRD, after supabase-level-test-schema.sql and
-- supabase-admin-auth.sql. Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- Adds:
--   • enrollments.student_id      — links an enrollment to its Supabase Auth user
--   • enrollments.batch_preference — weekday / weekend / flexible

alter table public.enrollments
  add column if not exists student_id uuid references auth.users(id) on delete set null;

alter table public.enrollments
  add column if not exists batch_preference text;

-- Free text rather than an enum: the options live in data.json so the team can
-- add a batch without a migration. Constrained to the known set, but nullable
-- so the rows enrolled before this feature existed stay valid.
alter table public.enrollments
  drop constraint if exists enrollments_batch_preference_check;
alter table public.enrollments
  add constraint enrollments_batch_preference_check
  check (batch_preference is null or batch_preference in ('weekday', 'weekend', 'flexible'));

create index if not exists enrollments_student_id_idx        on public.enrollments (student_id);
create index if not exists enrollments_batch_preference_idx  on public.enrollments (batch_preference);

-- Enrolling now requires a signed-in account, so tighten the insert policy that
-- supabase-admin-auth.sql created: only `authenticated`, and the row must
-- belong to the caller. This stops someone enrolling under another user's id.
drop policy if exists "enrollments_insert_public" on public.enrollments;
drop policy if exists "enrollments_insert_authed" on public.enrollments;
create policy "enrollments_insert_authed"
  on public.enrollments for insert
  to authenticated
  with check (student_id = auth.uid());

-- Let a student read back their own enrollment (to show status in the portal).
-- Admins keep the broad read granted in supabase-admin-auth.sql.
drop policy if exists "enrollments_select_own" on public.enrollments;
create policy "enrollments_select_own"
  on public.enrollments for select
  to authenticated
  using (student_id = auth.uid());


-- ── Verify ───────────────────────────────────────────────────────────────
-- New columns:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'enrollments'
--     and column_name in ('student_id', 'batch_preference');

-- Batch demand at a glance (the same split the admin dashboard shows):
--   select coalesce(batch_preference, 'not asked') as batch, count(*)
--   from public.enrollments group by 1 order by 2 desc;

-- Backfill student_id for people who enrolled before accounts were required,
-- by matching on email. Review before running:
--   update public.enrollments e
--   set student_id = u.id
--   from auth.users u
--   where e.student_id is null and lower(u.email) = lower(e.email);
