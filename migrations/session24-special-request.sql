-- =============================================================================
-- Migration: "Request a Plan" (Special Request) feature
-- Project: Juzgo (esimconnect / emsovpcmdnuxrhbyvnvb.supabase.co)
-- Session 24
-- Run manually via Supabase SQL Editor (this project does not auto-apply
-- migrations — same convention as every other migrations/*.sql file).
--
-- Context: a second purchase channel alongside the normal curated storefront.
-- Customers tick data amount / duration / region against packages that exist
-- in airalo_catalog but are NOT currently active in juzgo_selected_plans
-- (i.e. reviewed but not currently offered). Matches are shown at the
-- catalog's own minimum_selling_price_sgd — no new pricing logic. Purchasing
-- one does NOT promote it into the normal storefront; that stays a manual
-- (or future threshold-based) decision. See CONTEXT.md Session 24 log for
-- full design discussion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tag orders that came through this channel instead of the normal
--    catalog/storefront flow.
-- -----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'catalog'
    CHECK (order_source IN ('catalog', 'special_request'));

CREATE INDEX IF NOT EXISTS idx_orders_order_source ON orders (order_source);

COMMENT ON COLUMN orders.order_source IS '''catalog'' = normal /plans storefront purchase. ''special_request'' = purchased via /request-a-plan, bypassing the juzgo_selected_plans curation gate. See special_request_log for the originating request.';

-- -----------------------------------------------------------------------------
-- 2. Log every Special Request search — matched or not — so David can review
--    demand for packages not currently offered, and follow up on unmatched
--    requests manually (admin spec: "Special Requests" Admin tab, Session 24).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS special_request_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid,                    -- nullable; guests can search too
  customer_email      text,                    -- nullable; only known if user is logged in or provides one
  data_amount         text,                    -- ticked selection, e.g. '5 GB' — nullable = "any"
  validity_days       integer,                 -- ticked selection — nullable = "any"
  country_region      text,                    -- ticked selection, e.g. 'Asia' — nullable = "any"
  matched             boolean NOT NULL,
  matched_package_ids jsonb,                   -- up to 3 package_ids shown to the user, if matched = true
  selected_package_id text,                    -- set if the user went on to actually order one of the matches
  order_id            uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_special_request_log_matched ON special_request_log (matched);
CREATE INDEX IF NOT EXISTS idx_special_request_log_created_at ON special_request_log (created_at DESC);

COMMENT ON TABLE special_request_log IS 'Every /request-a-plan search, matched or not. Admin-only visibility (Special Requests tab). Unmatched rows are the demand signal for what to add to the catalog next.';

-- No RLS enabled — this table is written and read exclusively via server.js
-- using the Supabase service role key (POST /special-request/match writes,
-- GET /admin/special-requests reads under requireAdmin). No anon-key access
-- needed in either direction, unlike airalo_catalog/juzgo_selected_plans
-- which the storefront reads directly.

-- =============================================================================
-- Post-migration checklist:
-- [ ] Run this whole file once in Supabase SQL Editor.
-- [ ] Confirm: SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'orders' AND column_name = 'order_source';
--     — should show up, default 'catalog'.
-- [ ] Confirm special_request_log exists and is empty:
--       SELECT count(*) FROM special_request_log;
-- =============================================================================
