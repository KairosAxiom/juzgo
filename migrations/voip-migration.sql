-- ============================================================
-- Juzgo VOIP — Session 26 migration
-- Run in Supabase SQL Editor. Additive only, no existing tables touched
-- except the new increment_wallet_balance RPC (new function, nothing altered).
-- ============================================================

-- ------------------------------------------------------------
-- 1. voip_numbers — a user's rented home-country Twilio number
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voip_numbers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number          text NOT NULL,           -- E.164, e.g. +6591234567
  country_code          text NOT NULL,           -- ISO2, e.g. SG
  twilio_sid            text,                    -- Twilio IncomingPhoneNumber SID (null until real purchase wired up)
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','grace_period','released','suspended')),
  monthly_rate_sgd      numeric(10,2) NOT NULL,
  purchased_at          timestamptz,
  next_renewal_at       timestamptz,
  grace_period_ends_at  timestamptz,
  released_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Billing job needs to efficiently find numbers due for renewal
CREATE INDEX IF NOT EXISTS idx_voip_numbers_renewal
  ON voip_numbers (next_renewal_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_voip_numbers_user ON voip_numbers (user_id);

ALTER TABLE voip_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own voip numbers"
  ON voip_numbers FOR SELECT
  USING (auth.uid() = user_id);
-- No insert/update/delete policies — all writes go through the service-role
-- backend (mirrors the corp_wallet / orders pattern already in use).

-- ------------------------------------------------------------
-- 2. voip_call_log — inbound/outbound call history per number
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voip_call_log (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voip_number_id         uuid NOT NULL REFERENCES voip_numbers(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  twilio_call_sid        text,
  direction              text NOT NULL CHECK (direction IN ('inbound','outbound')),
  counterparty_number    text,                   -- the other party's number (caller ID)
  status                 text NOT NULL DEFAULT 'in_progress'
                           CHECK (status IN ('in_progress','answered','missed','voicemail','no_answer','failed')),
  duration_seconds       integer,
  voicemail_recording_url text,
  voicemail_transcript   text,
  started_at             timestamptz NOT NULL DEFAULT now(),
  ended_at               timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voip_call_log_user ON voip_call_log (user_id);
CREATE INDEX IF NOT EXISTS idx_voip_call_log_number ON voip_call_log (voip_number_id);

ALTER TABLE voip_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own call log"
  ON voip_call_log FOR SELECT
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. voip_charges — recurring rental billing records
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voip_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voip_number_id        uuid NOT NULL REFERENCES voip_numbers(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_sgd            numeric(10,2) NOT NULL,
  charge_type           text NOT NULL DEFAULT 'rental'
                          CHECK (charge_type IN ('rental','proration','refund')),
  status                text NOT NULL DEFAULT 'paid'
                          CHECK (status IN ('paid','failed','skipped_insufficient_funds')),
  billing_period_start  date,
  billing_period_end    date,
  wallet_balance_before numeric(10,2),
  wallet_balance_after  numeric(10,2),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voip_charges_user ON voip_charges (user_id);
CREATE INDEX IF NOT EXISTS idx_voip_charges_number ON voip_charges (voip_number_id);

ALTER TABLE voip_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own voip charges"
  ON voip_charges FOR SELECT
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. increment_wallet_balance RPC — atomic personal wallet debit/credit
-- Mirrors increment_corp_wallet (already in use for corp wallet), but for
-- profiles.wallet_balance. Needed because the recurring billing job runs
-- server-side unattended — a fetch-then-update from Node is a race risk
-- once real cron billing goes live, same reasoning as the corp wallet RPC.
-- Call with a negative p_amount to debit, positive to credit.
-- Returns the new balance. Raises if it would go negative.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_wallet_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id
  RETURNING wallet_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance for user %', p_user_id;
  END IF;

  RETURN new_balance;
END;
$$;

-- ============================================================
-- End of migration. Nothing here touches existing tables/policies.
-- ============================================================
