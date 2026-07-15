-- SpeakLab — Level Test schema
-- RUN THIS FIRST, then supabase-admin-auth.sql.
-- Supabase Dashboard → SQL Editor → New query. Safe to re-run.
--
-- This file deliberately grants NO read access: test results contain student
-- emails and speech transcripts. supabase-admin-auth.sql grants reads to
-- logged-in admins only. Until you run it, the admin dashboard will show an
-- empty table — that is the safe default, not a bug.

create table if not exists public.level_tests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Who took it. enrollment_id is best-effort: the test still records
  -- if the student never completed an enrollment row.
  enrollment_id uuid references public.enrollments(id) on delete set null,
  student_name  text not null,
  student_email text not null,
  whatsapp      text,

  -- Scores are stored raw so the report can always be recomputed.
  grammar_score    integer not null default 0,
  grammar_total    integer not null default 0,
  speaking_score   integer not null default 0,
  speaking_total   integer not null default 0,
  overall_percent  numeric(5,2) not null default 0,

  cefr_level  text not null,   -- A1 | A2 | B1 | B2 | C1 | C2
  level_label text,            -- Beginner … Proficient
  placement   text,            -- suggested SpeakLab class group

  report  jsonb,               -- strengths / focus areas / per-section breakdown
  answers jsonb,               -- raw submission, kept for audit + re-grading

  duration_seconds integer,
  graded_by text default 'auto',  -- 'ai' when the speaking section used the LLM
  status text not null default 'completed'
);

create index if not exists level_tests_email_idx      on public.level_tests (lower(student_email));
create index if not exists level_tests_created_at_idx on public.level_tests (created_at desc);
create index if not exists level_tests_level_idx      on public.level_tests (cefr_level);
create index if not exists level_tests_enrollment_idx on public.level_tests (enrollment_id);

alter table public.level_tests enable row level security;

-- A student submits their result through /api/level-test. That endpoint uses the
-- anon key unless SUPABASE_SERVICE_ROLE_KEY is set, so anon needs insert.
drop policy if exists "level_tests_insert_anon" on public.level_tests;
create policy "level_tests_insert_anon"
  on public.level_tests for insert
  to anon, authenticated
  with check (true);

-- No SELECT policy here on purpose. Reads are granted to admins in
-- supabase-admin-auth.sql, which also drops this older permissive policy if an
-- earlier version of this file created it.
drop policy if exists "level_tests_select_anon" on public.level_tests;

-- Results are immutable from the client: no update/delete policy is granted,
-- so a student cannot rewrite their own score. Use the service role for edits.

-- Convenience view: newest attempt per student, joined to their enrollment.
--
-- security_invoker = true is load-bearing. Without it a view executes with its
-- owner's rights and quietly bypasses the RLS on level_tests and enrollments,
-- handing anon a read of every student's data through the back door.
create or replace view public.latest_level_tests
with (security_invoker = true) as
select distinct on (lower(lt.student_email))
  lt.*,
  e.city,
  e.payment_status,
  e.seat_confirmed
from public.level_tests lt
left join public.enrollments e on e.id = lt.enrollment_id
order by lower(lt.student_email), lt.created_at desc;
