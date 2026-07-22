-- ============================================================
-- migrations/voip-cardlock-migration.sql
-- Session 27 — card-locked VOIP billing + Twilio suspend mechanism
--
-- Supersedes the wallet-grace-period model from voip-migration.sql.
-- Safe to run on top of the existing schema; all statements are idempotent.
--
-- Run in Supabase SQL Editor. NOTE: the SQL Editor only returns the result
-- of the LAST statement when several are run together — the verification
-- query at the bottom is a single combined SELECT for exactly that reason.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Stripe customer + saved card, at the profile level
--
-- Platform-level, not VOIP-specific: any future recurring product
-- (corporate seats, subscription plans) reuses these columns rather
-- than inventing its own card storage.
--
-- We store the Stripe *ids* only — never PAN, expiry or CVC. The
-- last4/brand columns are display-only convenience, sourced from the
-- PaymentMethod object at attach time, so the UI can render "Visa ••4242"
-- without a round-trip to Stripe on every page load.
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id        text,
  ADD COLUMN IF NOT EXISTS default_payment_method_id text,
  ADD COLUMN IF NOT EXISTS card_brand                text,
  ADD COLUMN IF NOT EXISTS card_last4                text,
  ADD COLUMN IF NOT EXISTS card_exp_month            smallint,
  ADD COLUMN IF NOT EXISTS card_exp_year             smallint,
  ADD COLUMN IF NOT EXISTS card_attached_at          timestamptz;

-- One Stripe customer per profile. Partial index so the many NULLs
-- (every user who has never attached a card) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_key
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2. voip_numbers — suspension lifecycle
--
-- Status now flows:
--   active -> past_due -> suspended -> pending_release -> released
--
-- 'past_due'        charge failed, number still rings, retries pending
-- 'suspended'       VoiceUrl cleared at Twilio; number still OWNED by
--                   Kairos Ventures so it can never be reassigned to a
--                   stranger while the user's CFU may still point at it
-- 'pending_release' suspended and past the hold window; the billing pass
--                   will release it at Twilio on its next run
-- 'released'        gone from our account, back in Twilio's pool
--
-- The old 'grace_period' status and grace_period_ends_at column are
-- retained (not dropped) so any existing test rows stay readable; the
-- new billing job never writes either. Drop them once test data is
-- wiped at launch.
-- ------------------------------------------------------------
ALTER TABLE voip_numbers
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS suspended_at             timestamptz,
  ADD COLUMN IF NOT EXISTS suspend_reason           text,
  ADD COLUMN IF NOT EXISTS release_scheduled_at     timestamptz,
  ADD COLUMN IF NOT EXISTS failed_charge_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_failure_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_charge_attempt_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_stage      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_url_before_suspend text;

-- The billing pass scans on (status, next_renewal_at) and, separately,
-- on (status, first_failure_at) for the dunning cascade. Both indexed.
CREATE INDEX IF NOT EXISTS voip_numbers_billing_due_idx
  ON voip_numbers (status, next_renewal_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS voip_numbers_dunning_idx
  ON voip_numbers (status, first_failure_at)
  WHERE status IN ('past_due', 'suspended', 'pending_release');


-- ------------------------------------------------------------
-- 3. voip_charges — Stripe-aware
--
-- The original table assumed wallet debits, so every row carried
-- wallet_balance_before/after. Those columns stay (nullable) for the
-- existing rows, but card charges write Stripe fields instead.
--
-- stripe_payment_intent_id is UNIQUE where present: this is the
-- idempotency backstop. If the billing pass somehow runs twice for the
-- same period, the second insert fails loudly rather than silently
-- double-charging a customer.
-- ------------------------------------------------------------
ALTER TABLE voip_charges
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS failure_code             text,
  ADD COLUMN IF NOT EXISTS failure_message          text,
  ADD COLUMN IF NOT EXISTS attempt_number           integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS voip_charges_payment_intent_key
  ON voip_charges (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Guards against two renewal passes both charging the same number for the
-- same billing month, even if Stripe never gets as far as issuing an
-- intent id. Only applies to successful charges — failed attempts are
-- expected to repeat within a period.
CREATE UNIQUE INDEX IF NOT EXISTS voip_charges_period_paid_key
  ON voip_charges (voip_number_id, billing_period_start)
  WHERE status = 'paid';

-- wallet_balance_* were NOT NULL in some drafts of the original
-- migration; card charges have no wallet involvement, so relax them.
-- (No-ops if they were already nullable.)
ALTER TABLE voip_charges ALTER COLUMN wallet_balance_before DROP NOT NULL;
ALTER TABLE voip_charges ALTER COLUMN wallet_balance_after  DROP NOT NULL;


-- ------------------------------------------------------------
-- 3b. Status CHECK constraints — MUST be widened before any code runs
--
-- voip-migration.sql created voip_numbers.status with a CHECK allowing
-- only: pending, active, grace_period, released, suspended.
--
-- The card-locked dunning cascade writes two statuses that constraint
-- rejects: 'past_due' and 'pending_release'. Without this block, every
-- ALTER above applies cleanly and then the FIRST failed charge throws a
-- constraint violation at runtime — a failure that only surfaces in
-- production, on the unhappy path, weeks after deploy.
--
-- 'grace_period' is retained in the allowed list purely so any existing
-- test rows remain valid. No new code writes it. Remove it from the list
-- once test data is wiped at launch.
--
-- Constraint names: Postgres auto-names CHECK constraints
-- <table>_<column>_check, so that's what we drop. IF EXISTS makes this
-- safe to re-run.
-- ------------------------------------------------------------
ALTER TABLE voip_numbers DROP CONSTRAINT IF EXISTS voip_numbers_status_check;

ALTER TABLE voip_numbers
  ADD CONSTRAINT voip_numbers_status_check
  CHECK (status IN (
    'pending',
    'active',
    'past_due',
    'suspended',
    'pending_release',
    'released',
    'grace_period'
  ));

-- voip_charges.status allowed: paid, failed, skipped_insufficient_funds.
-- The new billing code only ever writes 'paid' or 'failed', both already
-- permitted, so no change is strictly needed. Rewritten anyway to drop
-- the now-meaningless wallet-era value from NEW rows' vocabulary while
-- keeping it legal for existing ones.
ALTER TABLE voip_charges DROP CONSTRAINT IF EXISTS voip_charges_status_check;

ALTER TABLE voip_charges
  ADD CONSTRAINT voip_charges_status_check
  CHECK (status IN ('paid', 'failed', 'skipped_insufficient_funds'));


-- ------------------------------------------------------------
-- 4. RLS
--
-- profiles already has its own policies — the new card columns inherit
-- them, which is correct: a user can read their own card_last4.
-- IMPORTANT: no policy grants UPDATE on stripe_customer_id or
-- default_payment_method_id to the user; those are written exclusively
-- by the service role via the payment-methods router.
--
-- voip_numbers / voip_charges keep the established pattern from
-- voip-migration.sql: own-row SELECT for the user, all writes service-role.
-- Nothing to change here — the new columns are covered by the existing
-- table-level policies. Stated explicitly so a future reader doesn't
-- assume it was overlooked.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- 5. Verification — single combined query (SQL Editor returns only the
--    last statement's result, so this is deliberately one SELECT).
--    Expect: 7 profile columns, 9 voip_numbers columns, 5 voip_charges
--    columns, 5 indexes, and status_check_ok = 'yes'.
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'profiles'
       AND column_name IN ('stripe_customer_id','default_payment_method_id',
                           'card_brand','card_last4','card_exp_month',
                           'card_exp_year','card_attached_at')
  ) AS profiles_cols_expect_7,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'voip_numbers'
       AND column_name IN ('stripe_payment_method_id','suspended_at',
                           'suspend_reason','release_scheduled_at',
                           'failed_charge_count','first_failure_at',
                           'last_charge_attempt_at','last_reminder_stage',
                           'voice_url_before_suspend')
  ) AS voip_numbers_cols_expect_9,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'voip_charges'
       AND column_name IN ('stripe_payment_intent_id','stripe_payment_method_id',
                           'failure_code','failure_message','attempt_number')
  ) AS voip_charges_cols_expect_5,
  (SELECT count(*) FROM pg_indexes
     WHERE indexname IN ('profiles_stripe_customer_id_key',
                         'voip_numbers_billing_due_idx',
                         'voip_numbers_dunning_idx',
                         'voip_charges_payment_intent_key',
                         'voip_charges_period_paid_key')
  ) AS indexes_expect_5,
  -- Proves the widened CHECK actually admits the new statuses, rather
  -- than merely proving a constraint of that name exists.
  (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%past_due%'
                AND pg_get_constraintdef(oid) LIKE '%pending_release%'
               THEN 'yes' ELSE 'NO - CASCADE WILL FAIL' END
     FROM pg_constraint
    WHERE conname = 'voip_numbers_status_check'
  ) AS status_check_ok_expect_yes;
