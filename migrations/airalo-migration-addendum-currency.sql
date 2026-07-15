-- =============================================================================
-- Addendum migration: split airalo_catalog price columns into USD + SGD pairs.
-- Run AFTER migrations/airalo-integration-migration.sql (Session 23 main migration).
-- Reason: throwaway sandbox script (Session 23, step 2) confirmed Airalo's
-- /v2/packages response includes a `prices` object with per-currency net_price and
-- recommended_retail_price for 18 currencies, including SGD. David chose to store
-- both USD and SGD rather than picking one. Safe to run as a clean rename/add — the
-- three tables from the main migration are still empty (catalog sync hasn't run yet).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. airalo_catalog — rename existing single-currency columns to _usd, add _sgd
--    counterparts.
-- -----------------------------------------------------------------------------
ALTER TABLE airalo_catalog RENAME COLUMN net_price TO net_price_usd;
ALTER TABLE airalo_catalog RENAME COLUMN minimum_selling_price TO minimum_selling_price_usd;
ALTER TABLE airalo_catalog RENAME COLUMN recommended_retail_price TO recommended_retail_price_usd;

ALTER TABLE airalo_catalog
  ADD COLUMN IF NOT EXISTS net_price_sgd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_selling_price_sgd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_retail_price_sgd numeric(10,2) NOT NULL DEFAULT 0;

-- Drop the temporary DEFAULT 0 now that the columns exist — it was only there so
-- ADD COLUMN could succeed if this table somehow already had rows. Real values
-- always come from the catalog sync job (source: response.data[].operators[].
-- packages[].prices.{net_price,recommended_retail_price}.SGD).
ALTER TABLE airalo_catalog ALTER COLUMN net_price_sgd DROP DEFAULT;
ALTER TABLE airalo_catalog ALTER COLUMN minimum_selling_price_sgd DROP DEFAULT;
ALTER TABLE airalo_catalog ALTER COLUMN recommended_retail_price_sgd DROP DEFAULT;

COMMENT ON COLUMN airalo_catalog.net_price_usd IS 'Airalo cost to Juzgo, USD. Source: packages[].prices.net_price.USD (equivalent to the flat packages[].net_price field).';
COMMENT ON COLUMN airalo_catalog.net_price_sgd IS 'Airalo cost to Juzgo, SGD. Source: packages[].prices.net_price.SGD.';
COMMENT ON COLUMN airalo_catalog.minimum_selling_price_usd IS 'Hard floor, USD. Source: packages[].prices.recommended_retail_price.USD (equivalent to the flat packages[].price field). See DECISIONS.md — despite the name, this is an enforced minimum, not a suggestion.';
COMMENT ON COLUMN airalo_catalog.minimum_selling_price_sgd IS 'Hard floor, SGD. Source: packages[].prices.recommended_retail_price.SGD. This is the currency the price-floor trigger on juzgo_selected_plans actually enforces against, since Juzgo checkout is SGD-only.';
COMMENT ON COLUMN airalo_catalog.recommended_retail_price_usd IS 'Retained for naming clarity alongside minimum_selling_price_usd — always equal to it. Prefer minimum_selling_price_usd in new code.';
COMMENT ON COLUMN airalo_catalog.recommended_retail_price_sgd IS 'Retained for naming clarity alongside minimum_selling_price_sgd — always equal to it. Prefer minimum_selling_price_sgd in new code.';

-- -----------------------------------------------------------------------------
-- 2. Update the price-floor trigger to check against the SGD floor, since
--    juzgo_selected_plans.your_price is what the customer is actually charged
--    (SGD, matching Stripe checkout / orders.price_sgd throughout the app).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_price_floor() RETURNS trigger AS $$
DECLARE floor_price numeric(10,2);
BEGIN
  SELECT minimum_selling_price_sgd INTO floor_price FROM airalo_catalog WHERE package_id = NEW.package_id;
  IF floor_price IS NOT NULL AND NEW.your_price < floor_price THEN
    RAISE EXCEPTION 'your_price (%) is below the minimum selling price in SGD (%) for package %', NEW.your_price, floor_price, NEW.package_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger itself (trg_enforce_price_floor) already exists and points at this
-- function by name — CREATE OR REPLACE updates its behavior in place, no need
-- to re-create the trigger.

-- =============================================================================
-- Post-migration checklist:
-- [ ] Confirm the rename worked: SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'airalo_catalog' ORDER BY column_name;
--     — should show net_price_usd, net_price_sgd, minimum_selling_price_usd,
--     minimum_selling_price_sgd, recommended_retail_price_usd, recommended_retail_price_sgd.
-- [ ] Re-run the same price-floor trigger test as the main migration, but now confirm
--     it's checking the SGD column specifically:
--       INSERT INTO airalo_catalog (package_id, country_region, scope, type, net_price_usd, net_price_sgd, minimum_selling_price_usd, minimum_selling_price_sgd, recommended_retail_price_usd, recommended_retail_price_sgd)
--       VALUES ('test-pkg', 'Testland', 'country', 'sim', 3.00, 4.00, 5.00, 6.00, 5.00, 6.00);
--       -- USD floor is 5.00, SGD floor is 6.00 (deliberately different from USD to prove it's checking SGD, not USD)
--       INSERT INTO juzgo_selected_plans (package_id, is_active, your_price) VALUES ('test-pkg', true, 5.50);
--       -- 5.50 is ABOVE the USD floor (5.00) but BELOW the SGD floor (6.00) — should be REJECTED.
--       -- If it succeeds instead, the trigger is still checking USD, not SGD — flag it.
--     Then clean up:
--       DELETE FROM juzgo_selected_plans WHERE package_id = 'test-pkg';
--       DELETE FROM airalo_catalog WHERE package_id = 'test-pkg';
-- =============================================================================
