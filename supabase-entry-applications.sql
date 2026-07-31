-- SpeakLab — Entry Test applications (public funnel from Meta ads)
--
-- RUN THIS AFTER supabase-level-test-schema.sql and supabase-admin-auth.sql.
-- Supabase Dashboard → SQL Editor → New query. Safe to re-run.
--
-- This is a SEPARATE funnel from level_tests. level_tests is the logged-in
-- placement test taken after enrolling; this table holds cold applications from
-- apply.html, which anyone can fill in with no account. Keeping them apart
-- means the ad traffic cannot pollute placement data, and an application can be
-- rejected without touching a student record.

create table if not exists public.entry_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- ── Basic info ────────────────────────────────────────────────────────
  full_name text not null,
  whatsapp  text not null,
  age_group text,              -- 18-25 | 26-35 | 36-45 | 45+
  city      text,

  -- ── Education & background ────────────────────────────────────────────
  education  text,             -- matric | intermediate | bachelors | masters | other
  grades     text,             -- free text: "78%", "3.4 CGPA", "A grade"
  occupation text,             -- student | job | business | other

  -- ── English level (the actual filter) ─────────────────────────────────
  translation_answer text,     -- their English rendering of the Urdu prompt
  writing_answer     text,     -- "describe your daily routine"
  self_rating        text,     -- beginner | basic | good | fluent

  -- ── Seriousness ───────────────────────────────────────────────────────
  motivation text,
  fee_ready  boolean,          -- "ready to invest in a premium program?"

  -- ── Scoring (auto, same LLM path as the level test) ───────────────────
  english_score numeric(5,2) not null default 0,   -- 0–100
  english_band  text,                              -- A1 … C2
  english_label text,                              -- Beginner … Proficient
  scored_by     text not null default 'auto',      -- 'ai' when the LLM graded it
  score_report  jsonb,                             -- per-criterion breakdown + examiner note

  -- ── Review workflow ───────────────────────────────────────────────────
  application_status text not null default 'pending'
    check (application_status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  admin_notes text,

  source text default 'apply-page'
);

create index if not exists entry_applications_created_at_idx on public.entry_applications (created_at desc);
create index if not exists entry_applications_status_idx     on public.entry_applications (application_status);
create index if not exists entry_applications_whatsapp_idx   on public.entry_applications (whatsapp);

alter table public.entry_applications enable row level security;

-- /api/apply writes with the anon key unless SUPABASE_SERVICE_ROLE_KEY is set,
-- so anon needs insert. Nothing else.
drop policy if exists "entry_applications_insert_public" on public.entry_applications;
create policy "entry_applications_insert_public"
  on public.entry_applications for insert
  to anon, authenticated
  with check (true);

-- Applications carry names, phone numbers and free text. Reads are admins only,
-- exactly like level_tests — never grant this to anon.
drop policy if exists "entry_applications_select_anon"  on public.entry_applications;
drop policy if exists "entry_applications_select_admin" on public.entry_applications;
create policy "entry_applications_select_admin"
  on public.entry_applications for select
  to authenticated
  using (public.is_admin());

-- Approve / reject from admin.html.
drop policy if exists "entry_applications_update_admin" on public.entry_applications;
create policy "entry_applications_update_admin"
  on public.entry_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy: rejecting is a status change, not a deletion, so the ad
-- spend that produced the lead stays measurable.


-- ── Verify ───────────────────────────────────────────────────────────────
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'entry_applications';
--
--   select relrowsecurity from pg_class where relname = 'entry_applications';
