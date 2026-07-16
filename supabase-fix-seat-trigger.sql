-- SpeakLab — repair the enrollment trigger that blocks enrolling
--
-- SYMPTOM: clicking Enroll fails with "UPDATE requires a WHERE clause".
--
-- CAUSE: a trigger on public.enrollments runs an UPDATE with no WHERE clause.
-- The `safeupdate` extension rejects that, which aborts the whole INSERT. The
-- old script.js swallowed the error ("Supabase Error (Ignored)") and sent the
-- confirmation email anyway, so enrollments have been failing to save silently
-- while students and staff still got emails. That is why seats.booked_seats is
-- still 0.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run. Nothing is dropped before its definition is printed.


-- ── 1. Print every current trigger on enrollments ────────────────────────
-- Read this output. If step 2 replaces something you needed, the full original
-- definition is here to restore from.
do $$
declare r record;
begin
  raise notice '=== EXISTING TRIGGERS ON public.enrollments ===';
  for r in
    select t.tgname, p.oid, p.proname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.enrollments'::regclass
      and not t.tgisinternal
  loop
    raise notice 'TRIGGER % -> FUNCTION %()', r.tgname, r.proname;
    raise notice '%', pg_get_functiondef(r.oid);
  end loop;
  raise notice '=== END ===';
end $$;


-- ── 2. A correct seat counter ────────────────────────────────────────────
-- Two fixes in one:
--   • It has a WHERE clause, so safeupdate accepts it.
--   • It recomputes from enrollments instead of doing `booked_seats + 1`.
--     An increment drifts permanently the moment one insert fails or a row is
--     deleted; a recount is self-healing and repairs the count already lost.
-- SECURITY DEFINER so the update is not blocked by RLS on seats.
create or replace function public.speaklab_sync_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.seats
     set booked_seats = (select count(*) from public.enrollments),
         updated_at   = now()
   where is_open = true;   -- ← the WHERE that safeupdate requires
  return null;             -- AFTER trigger: return value is ignored
end;
$$;


-- ── 3. Replace only seat-counting triggers ───────────────────────────────
-- Scoped deliberately: a trigger is only dropped if its body mentions both
-- `seats` and `update`. Anything else on this table is left alone.
do $$
declare r record;
declare body text;
declare hits int := 0;
begin
  for r in
    select t.tgname, p.oid
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.enrollments'::regclass
      and not t.tgisinternal
  loop
    body := lower(pg_get_functiondef(r.oid));
    if body like '%seats%' and body like '%update%' then
      execute format('drop trigger %I on public.enrollments', r.tgname);
      raise notice 'Dropped seat trigger "%" — its definition is printed above.', r.tgname;
      hits := hits + 1;
    end if;
  end loop;

  if hits = 0 then
    raise notice 'No seat-counting trigger found. If enrolling still fails, the culprit is another trigger — send the step 1 output to your developer.';
  end if;
end $$;

drop trigger if exists enrollments_sync_seats on public.enrollments;
create trigger enrollments_sync_seats
  after insert or delete on public.enrollments
  for each row execute function public.speaklab_sync_seats();


-- ── 4. Repair the count that already drifted ─────────────────────────────
update public.seats
   set booked_seats = (select count(*) from public.enrollments),
       updated_at   = now()
 where is_open = true;


-- ── 5. Verify ────────────────────────────────────────────────────────────
-- Should now show one trigger: enrollments_sync_seats
--   select tgname from pg_trigger
--   where tgrelid = 'public.enrollments'::regclass and not tgisinternal;

-- Seats vs reality — booked_seats must equal the enrollment count:
--   select s.batch_name, s.total_seats, s.booked_seats, s.is_open,
--          (select count(*) from public.enrollments) as actual_enrollments
--   from public.seats s;

-- NOTE: seats.batch_name still says "June Batch" while the rest of the site
-- says July. Fix when convenient:
--   update public.seats set batch_name = 'July Batch' where is_open = true;
