-- ============================================================
-- Migration: extend saved_itineraries
--   Alfred lifecycle + gather-format + eSIM seam
--
-- Applied to live Supabase: 2026-08-17 (Session 1).
-- This file records that change in git history; the change is
-- already live in the database.
--
-- Additive & reversible. RLS deliberately NOT enabled here — it is
-- a behaviour change (would restrict live save/load) and is logged
-- as its own Session 2 step, gated on user_id being non-null on all
-- rows first. See build-note §6 and schema-design §3.
--
-- Reconciled against live DDL before writing:
--   - trip_data is jsonb (not text) — kept as-is, no structured col added
--   - created_at is timestamptz / now(); id is uuid / gen_random_uuid()
--   - 'stage' column (text, default 'routed') is orphaned — unreferenced
--     anywhere in /src — left untouched
--   - 'kept' flag on places = convention INSIDE selected_places jsonb
--     ({... "kept": true}); missing treated as kept:true in app code.
--     No DDL for it.
--   - suggested_plan_id = text (not FK): both airalo_catalog and
--     juzgo_selected_plans are keyed by package_id text; loose seam by design.
-- ============================================================

-- 1. created/updated split (stop overloading created_at)
alter table saved_itineraries
  add column if not exists updated_at timestamptz default now();

-- 2. lifecycle status (Alfred's spine: gathering→draft→curated→locked)
alter table saved_itineraries
  add column if not exists status text not null default 'draft';
alter table saved_itineraries
  drop constraint if exists saved_itineraries_status_chk;
alter table saved_itineraries
  add constraint saved_itineraries_status_chk
  check (status in ('gathering','draft','curated','locked'));

-- 3. full gather-format capture (the ~10 real inputs;
--    destination stays its own column for indexing)
alter table saved_itineraries
  add column if not exists trip_inputs jsonb;

-- 4. eSIM fusion seam — text, matches package_id key on plan tables
alter table saved_itineraries
  add column if not exists suggested_plan_id text;

-- 5. provenance
alter table saved_itineraries
  add column if not exists created_via text default 'juzgo';
alter table saved_itineraries
  drop constraint if exists saved_itineraries_created_via_chk;
alter table saved_itineraries
  add constraint saved_itineraries_created_via_chk
  check (created_via in ('juzgo','alfred'));

-- ── Backfill existing rows (ran before any RLS) ──
update saved_itineraries
  set status = 'locked'
where status = 'draft' or status is null;

update saved_itineraries
  set created_via = 'juzgo'
where created_via is null;

update saved_itineraries
  set updated_at = created_at
where updated_at is null;
