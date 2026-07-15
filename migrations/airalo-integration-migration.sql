-- =============================================================================
-- Migration: Airalo catalog, coverage index, curated selection, and order extension
-- Project: Juzgo (esimconnect / emsovpcmdnuxrhbyvnvb.supabase.co)
-- Reference: juzgo-airalo-catalog-admin-spec.md §2
-- Run manually via Supabase SQL Editor (this project does not auto-apply migrations
-- — same convention as migrations/session20_staff_creation.sql and
-- migrations/juzgo-migration-seed.sql)
--
-- Session 23 update: verified against the live repo (Server/server.js) before
-- finalizing —
--   - `orders` is confirmed as the real table name, with a real `id` PK. No column
--     name collisions with the new Airalo columns below (existing orders columns are
--     price_sgd, data_amount, package_title, country_name/code, etc. — none of the
--     six new columns overlap).
--   - Resolved the CHECK-vs-trigger question flagged in the Session 22 draft: dropped
--     the subquery CHECK constraint entirely. Postgres does not allow subqueries in
--     CHECK constraints at all (hard parser error, not just "unreliable") — so this
--     was never going to work, no need to test both. Trigger only, below.
--   - Added RLS enable + public-read policies, matching the exact convention already
--     used for countries/esim_plans in migrations/juzgo-migration-seed.sql (backend
--     writes use the Supabase service role key in server.js, which bypasses RLS
--     entirely — so these policies only affect anon-key/frontend reads).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. airalo_catalog — system-owned, refreshed by the catalog sync job.
--    David does not edit this table directly; it's overwritten/upserted on sync.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS airalo_catalog (
  package_id                 text PRIMARY KEY,
  country_region              text NOT NULL,
  scope                       text NOT NULL CHECK (scope IN ('country', 'region', 'global')),
  type                        text NOT NULL CHECK (type IN ('sim', 'topup')),
  data_amount                 text,                      -- e.g. '1 GB', 'Unlimited'
  validity_days                integer,
  net_price                   numeric(10,2) NOT NULL,
  minimum_selling_price       numeric(10,2) NOT NULL,     -- hard floor — see DECISIONS.md
  recommended_retail_price    numeric(10,2) NOT NULL,     -- kept = minimum_selling_price, see admin spec §2.1
  networks                    text,                       -- raw string, single-country packages only
  rechargeable                boolean,
  topup_grace_window_days     integer,
  install_window_days         integer,
  activation_policy           text,
  is_fair_usage_policy        boolean,
  fair_usage_policy           text,
  coverages                   jsonb,                      -- [{country_code, country_name, networks}], region/global only
  last_synced_at              timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airalo_catalog_scope ON airalo_catalog (scope);
CREATE INDEX IF NOT EXISTS idx_airalo_catalog_country_region ON airalo_catalog (country_region);
CREATE INDEX IF NOT EXISTS idx_airalo_catalog_type ON airalo_catalog (type);
CREATE INDEX IF NOT EXISTS idx_airalo_catalog_coverages_gin ON airalo_catalog USING gin (coverages);

COMMENT ON TABLE airalo_catalog IS 'Full Airalo package catalog, refreshed by the hourly catalog sync job. Not customer-facing directly — storefront queries always join through juzgo_selected_plans.';
COMMENT ON COLUMN airalo_catalog.minimum_selling_price IS 'Hard floor per Airalo policy — despite being sourced from the field commonly called "recommended retail price," this is the legally enforced minimum partners may sell at. See DECISIONS.md.';

-- -----------------------------------------------------------------------------
-- 2. country_coverage_index — reverse lookup, built by exploding coverages at
--    sync time. Powers country search (admin spec §6.2).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS country_coverage_index (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name  text NOT NULL,
  country_code  text,
  package_id    text NOT NULL REFERENCES airalo_catalog(package_id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('country', 'region', 'global'))
);

CREATE INDEX IF NOT EXISTS idx_coverage_index_country_name ON country_coverage_index (country_name);
CREATE INDEX IF NOT EXISTS idx_coverage_index_package_id ON country_coverage_index (package_id);

COMMENT ON TABLE country_coverage_index IS 'One row per (country, package) pair. Single-country packages map 1:1 to themselves; region/global packages explode into one row per country in their coverages array. Rebuilt on every catalog sync.';

-- -----------------------------------------------------------------------------
-- 3. juzgo_selected_plans — David's curation layer: what's actually sold, and
--    at what price. This is what the Admin Portal's "Sell?" tick writes to.
--
--    NOTE: no CHECK constraint here (see header note above — subqueries are not
--    permitted in CHECK constraints in Postgres; the floor is enforced below by
--    a BEFORE INSERT/UPDATE trigger instead).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juzgo_selected_plans (
  package_id    text PRIMARY KEY REFERENCES airalo_catalog(package_id) ON DELETE CASCADE,
  is_active     boolean NOT NULL DEFAULT false,
  your_price    numeric(10,2) NOT NULL,
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selected_plans_is_active ON juzgo_selected_plans (is_active);

COMMENT ON TABLE juzgo_selected_plans IS 'Curated sell list. Storefront queries always join airalo_catalog -> juzgo_selected_plans filtered on is_active = true; airalo_catalog alone is never customer-facing.';

CREATE OR REPLACE FUNCTION enforce_price_floor() RETURNS trigger AS $$
DECLARE floor_price numeric(10,2);
BEGIN
  SELECT minimum_selling_price INTO floor_price FROM airalo_catalog WHERE package_id = NEW.package_id;
  IF floor_price IS NOT NULL AND NEW.your_price < floor_price THEN
    RAISE EXCEPTION 'your_price (%) is below the minimum selling price (%) for package %', NEW.your_price, floor_price, NEW.package_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_price_floor ON juzgo_selected_plans;
CREATE TRIGGER trg_enforce_price_floor
  BEFORE INSERT OR UPDATE ON juzgo_selected_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_price_floor();

-- -----------------------------------------------------------------------------
-- 4. Extend orders — add Airalo-specific columns.
--    Confirmed against Server/server.js: `orders` is the real table name, uses
--    an `id` PK, and none of the six columns below collide with existing ones
--    (price_sgd, data_amount, package_title, country_name, country_code, status,
--    payment_method, referral_code, reseller_code, discount_sgd, order_code, etc.
--    all remain untouched).
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS package_id text REFERENCES airalo_catalog(package_id),
  ADD COLUMN IF NOT EXISTS iccid text,
  ADD COLUMN IF NOT EXISTS net_price_at_sale numeric(10,2),
  ADD COLUMN IF NOT EXISTS your_price_at_sale numeric(10,2),
  ADD COLUMN IF NOT EXISTS esim_status_last_checked text CHECK (esim_status_last_checked IN ('active', 'expired', 'not_rechargeable') OR esim_status_last_checked IS NULL),
  ADD COLUMN IF NOT EXISTS esim_status_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_iccid ON orders (iccid) WHERE iccid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_package_id ON orders (package_id) WHERE package_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. RLS — public read access.
--    Matches the exact convention already used for countries/esim_plans
--    (migrations/juzgo-migration-seed.sql): enable RLS, add an explicit
--    SELECT-true policy. Without this, an RLS-enabled table with no SELECT
--    policy returns silently empty results to the anon key, not an error
--    (see CONTEXT.md's "RLS silent empty" gotcha).
--
--    All writes to these three tables happen server-side via server.js, which
--    uses SUPABASE_SERVICE_ROLE_KEY — service role bypasses RLS entirely, so
--    these policies only govern frontend (anon key) reads.
--
--    juzgo_selected_plans read policy is scoped to is_active = true only,
--    since inactive/unpublished pricing shouldn't be readable by anon clients
--    even though the storefront query would filter it anyway (defense in depth).
-- -----------------------------------------------------------------------------
ALTER TABLE airalo_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_coverage_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE juzgo_selected_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read airalo_catalog" ON airalo_catalog;
DROP POLICY IF EXISTS "Public read country_coverage_index" ON country_coverage_index;
DROP POLICY IF EXISTS "Public read active selected_plans" ON juzgo_selected_plans;

CREATE POLICY "Public read airalo_catalog" ON airalo_catalog FOR SELECT USING (true);
CREATE POLICY "Public read country_coverage_index" ON country_coverage_index FOR SELECT USING (true);
CREATE POLICY "Public read active selected_plans" ON juzgo_selected_plans FOR SELECT USING (is_active = true);

-- =============================================================================
-- Post-migration checklist:
-- [ ] Run this whole file once in Supabase SQL Editor.
-- [ ] Confirm the price-floor trigger works: try
--       INSERT INTO airalo_catalog (package_id, country_region, scope, type, net_price, minimum_selling_price, recommended_retail_price)
--       VALUES ('test-pkg', 'Testland', 'country', 'sim', 3.00, 5.00, 5.00);
--       INSERT INTO juzgo_selected_plans (package_id, is_active, your_price) VALUES ('test-pkg', true, 4.00);
--     — the second insert should be REJECTED (4.00 < 5.00 floor). Then try your_price = 5.50,
--     confirm it succeeds. Clean up both test rows after:
--       DELETE FROM juzgo_selected_plans WHERE package_id = 'test-pkg';
--       DELETE FROM airalo_catalog WHERE package_id = 'test-pkg';
-- [ ] Confirm RLS: from the frontend (anon key), SELECT * FROM airalo_catalog should work
--     (empty result set is fine — table's empty until sync runs); a direct anon-key write
--     attempt should fail.
-- [ ] After running: this migration creates empty tables. The catalog sync job (not part
--     of this migration — that's build-order step 3) is what actually populates
--     airalo_catalog and country_coverage_index from the live Airalo API.
-- =============================================================================
