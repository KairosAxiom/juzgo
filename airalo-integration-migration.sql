-- =============================================================================
-- Migration: Airalo catalog, coverage index, curated selection, and order extension
-- Project: Juzgo (esimconnect / emsovpcmdnuxrhbyvnvb.supabase.co)
-- Reference: juzgo-airalo-catalog-admin-spec.md §2
-- Run manually via Supabase SQL Editor (this project does not auto-apply migrations
-- — same convention as migrations/session20_staff_creation.sql)
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
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juzgo_selected_plans (
  package_id    text PRIMARY KEY REFERENCES airalo_catalog(package_id) ON DELETE CASCADE,
  is_active     boolean NOT NULL DEFAULT false,
  your_price    numeric(10,2) NOT NULL,
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT your_price_floor CHECK (
    your_price >= (SELECT minimum_selling_price FROM airalo_catalog WHERE airalo_catalog.package_id = juzgo_selected_plans.package_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_selected_plans_is_active ON juzgo_selected_plans (is_active);

COMMENT ON TABLE juzgo_selected_plans IS 'Curated sell list. Storefront queries always join airalo_catalog -> juzgo_selected_plans filtered on is_active = true; airalo_catalog alone is never customer-facing.';

-- NOTE on the your_price_floor CHECK constraint above: a CHECK constraint with a
-- subquery is not standard/portable Postgres (subqueries in CHECK are technically
-- disallowed by the SQL standard and unreliable in Postgres in practice — this may
-- fail to apply or fail on insert). If this errors when run, use a BEFORE INSERT/UPDATE
-- trigger instead:
--
-- CREATE OR REPLACE FUNCTION enforce_price_floor() RETURNS trigger AS $$
-- DECLARE floor_price numeric(10,2);
-- BEGIN
--   SELECT minimum_selling_price INTO floor_price FROM airalo_catalog WHERE package_id = NEW.package_id;
--   IF NEW.your_price < floor_price THEN
--     RAISE EXCEPTION 'your_price (%) is below the minimum selling price (%) for package %', NEW.your_price, floor_price, NEW.package_id;
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE TRIGGER trg_enforce_price_floor
--   BEFORE INSERT OR UPDATE ON juzgo_selected_plans
--   FOR EACH ROW EXECUTE FUNCTION enforce_price_floor();
--
-- Test both approaches in the Supabase SQL Editor before committing to one —
-- if the CHECK constraint above applies cleanly, prefer it (simpler); otherwise
-- drop it and use the trigger.

-- -----------------------------------------------------------------------------
-- 4. Extend orders — add Airalo-specific columns.
--    IMPORTANT: column names below assume the existing `orders` table structure
--    documented in CONTEXT.md. Verify actual table name/columns in Supabase
--    before running — this project's orders table may need confirming (the
--    card-payment fulfillment gap noted in CONTEXT.md Session 17 suggests the
--    orders table's real-world usage may not yet match assumptions cleanly).
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

-- =============================================================================
-- Post-migration checklist:
-- [ ] Confirm the your_price_floor constraint applied (see NOTE above) — test with
--     an intentionally-too-low insert, confirm it's rejected.
-- [ ] Confirm `orders` table name/columns above actually match this project's schema
--     (this migration assumes the table is literally named `orders` — verify in
--     Supabase Table Editor first).
-- [ ] RLS: airalo_catalog and country_coverage_index likely need public SELECT
--     policies (USING (true)) since they're read by the storefront — see CONTEXT.md's
--     "RLS silent empty" gotcha: a table with RLS enabled but no SELECT policy
--     returns empty results, not an error, to the anon key. juzgo_selected_plans
--     likely needs admin-only write, public read (is_active = true rows only).
-- [ ] After running: this migration creates empty tables. Catalog sync job (not
--     part of this migration) is what actually populates airalo_catalog and
--     country_coverage_index from the live Airalo API.
-- =============================================================================
