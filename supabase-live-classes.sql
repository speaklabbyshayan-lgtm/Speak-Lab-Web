-- SpeakLab — live classes: schedule, in-portal Zoom join, attendance
--
-- RUN THIS AFTER supabase-admin-auth.sql and supabase-enrollment-upgrade.sql
-- (it depends on public.is_admin() and on enrollments.student_id /
-- enrollments.batch_preference). Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- What this replaces: nothing was stored at all. live-class.html asked the Zoom
-- API "is a meeting live right now?" on every page load and showed a single
-- button that was dead the other 99% of the time. There was no schedule, so a
-- student had no way to know when class was — and no record of who attended.
--
-- Adds:
--   • live_classes      — the schedule, plus the Zoom coordinates to join it
--   • class_attendance  — one row per student per class, written on Join
--   • is_paid_student() — the gate that was missing everywhere
--   • student_batch()   — so RLS can show a student only their own batch


-- ── 1. Who counts as a paying student ────────────────────────────────────
-- Same shape as is_admin() in supabase-admin-auth.sql: SECURITY DEFINER so it
-- can read enrollments regardless of the caller's own policies, which is also
-- what stops the policies below from recursing.
--
-- 'partial' counts. Students who have paid a deposit are sitting in class; the
-- portal locking them out would create support tickets, not revenue.
create or replace function public.is_paid_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = auth.uid()
      and e.payment_status in ('paid', 'partial')
  );
$$;

grant execute on function public.is_paid_student() to authenticated;


-- Which batch the caller is in, so a weekday student does not see the weekend
-- schedule. Most recent enrollment wins if someone has more than one.
create or replace function public.student_batch()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.batch_preference
  from public.enrollments e
  where e.student_id = auth.uid()
  order by e.created_at desc
  limit 1;
$$;

grant execute on function public.student_batch() to authenticated;


-- ── 2. live_classes ──────────────────────────────────────────────────────
create table if not exists public.live_classes (
  id                  uuid primary key default gen_random_uuid(),
  topic               text not null,
  description         text,

  -- null = every batch sees it. Otherwise the same vocabulary as
  -- enrollments.batch_preference, so the two can be compared directly.
  batch               text,

  starts_at           timestamptz not null,
  duration_minutes    integer not null default 90,

  -- The Zoom Meeting SDK joins by meeting number + passcode, not by URL.
  zoom_meeting_number text not null,
  zoom_passcode       text,
  -- Kept as well: the fallback for iOS Safari and any browser where the
  -- embedded SDK fails to start. Without it a student has no way in.
  zoom_join_url       text,

  status              text not null default 'scheduled',
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

alter table public.live_classes
  drop constraint if exists live_classes_batch_check;
alter table public.live_classes
  add constraint live_classes_batch_check
  check (batch is null or batch in ('weekday', 'weekend', 'flexible'));

alter table public.live_classes
  drop constraint if exists live_classes_status_check;
alter table public.live_classes
  add constraint live_classes_status_check
  check (status in ('scheduled', 'live', 'ended', 'cancelled'));

alter table public.live_classes
  drop constraint if exists live_classes_duration_check;
alter table public.live_classes
  add constraint live_classes_duration_check
  check (duration_minutes > 0 and duration_minutes <= 600);

create index if not exists live_classes_starts_at_idx on public.live_classes (starts_at desc);
create index if not exists live_classes_batch_idx     on public.live_classes (batch);


-- ── 3. class_attendance ──────────────────────────────────────────────────
create table if not exists public.class_attendance (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.live_classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now()
);

-- One row per student per class: the row is written every time Join is pressed,
-- and students press it more than once (dropped call, refresh, second device).
-- Without this the admin attendance count would be a click count.
create unique index if not exists class_attendance_unique_idx
  on public.class_attendance (class_id, student_id);

create index if not exists class_attendance_class_idx on public.class_attendance (class_id);


-- ── 4. RLS ───────────────────────────────────────────────────────────────
alter table public.live_classes     enable row level security;
alter table public.class_attendance enable row level security;

-- Students: paid only, and only their own batch.
--
-- The batch test is deliberately permissive at the edges — it hides a class
-- only when both sides name a batch and they disagree. A student who enrolled
-- before batch_preference existed (it is nullable, see
-- supabase-enrollment-upgrade.sql) still sees the schedule rather than an
-- empty page.
drop policy if exists "live_classes_select_paid" on public.live_classes;
create policy "live_classes_select_paid"
  on public.live_classes for select
  to authenticated
  using (
    public.is_paid_student()
    and (
      batch is null
      or batch = 'flexible'
      or public.student_batch() is null
      or public.student_batch() = 'flexible'
      or batch = public.student_batch()
    )
  );

-- Admins create and manage the schedule straight from admin.html, the same way
-- every other admin screen in this repo talks to Supabase.
drop policy if exists "live_classes_admin_all" on public.live_classes;
create policy "live_classes_admin_all"
  on public.live_classes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Attendance is written by /api/zoom-signature using the student's own token,
-- so the row can only ever be their own.
drop policy if exists "class_attendance_insert_own" on public.class_attendance;
create policy "class_attendance_insert_own"
  on public.class_attendance for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists "class_attendance_select_own_or_admin" on public.class_attendance;
create policy "class_attendance_select_own_or_admin"
  on public.class_attendance for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "class_attendance_admin_write" on public.class_attendance;
create policy "class_attendance_admin_write"
  on public.class_attendance for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ── 5. Attendance roster for the admin panel ─────────────────────────────
-- admin.html needs a name and email next to each attendance row, but those live
-- in enrollments / student_progress and a plain PostgREST embed cannot reach
-- auth.users. SECURITY DEFINER keeps that join server-side, and the is_admin()
-- guard inside means it cannot be called by anyone else.
create or replace function public.class_roster(p_class_id uuid)
returns table (
  student_id uuid,
  full_name  text,
  email      text,
  joined_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
    select a.student_id,
           coalesce(e.full_name, p.student_name, '—') as full_name,
           coalesce(e.email, p.student_email, u.email) as email,
           a.joined_at
    from public.class_attendance a
    left join auth.users u              on u.id = a.student_id
    left join public.student_progress p on p.student_id = a.student_id
    left join lateral (
      select en.full_name, en.email
      from public.enrollments en
      where en.student_id = a.student_id
      order by en.created_at desc
      limit 1
    ) e on true
    where a.class_id = p_class_id
    order by a.joined_at;
end;
$$;

grant execute on function public.class_roster(uuid) to authenticated;


-- ── 6. Verify ────────────────────────────────────────────────────────────
-- As a paid student (run from the browser console on the portal, not here —
-- the SQL editor is service role and ignores RLS):
--   await supabaseClient.rpc('is_paid_student')          → true
--   await supabaseClient.from('live_classes').select('*') → their batch only
--
-- As a fresh signup with no enrollment: both should come back empty/false.
--
-- Policies now in place:
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('live_classes', 'class_attendance')
--   order by tablename, cmd;
--
-- Seed a class to test against (replace the Zoom fields with a real meeting):
--   insert into public.live_classes
--     (topic, batch, starts_at, duration_minutes, zoom_meeting_number, zoom_passcode, zoom_join_url)
--   values
--     ('Test Class', null, now() + interval '5 minutes', 60, '00000000000', 'test', 'https://zoom.us/j/00000000000');
