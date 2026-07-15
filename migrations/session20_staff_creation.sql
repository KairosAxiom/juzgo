-- Session 20 — Corporate staff creation redesign
-- Run in Supabase SQL Editor

-- 1. Domain lock: source of truth for which email domain a company's
--    staff accounts must be created on.
alter table corporates add column if not exists email_domain text;

-- Backfill existing corporate rows from their contact_email
update corporates
set email_domain = split_part(contact_email, '@', 2)
where email_domain is null;

-- 2. Forced password change: set true when an account is created via
--    admin-generated password (new staff creation flow). Frontend checks
--    this on login and forces a password-change screen before anything
--    else is usable.
alter table profiles add column if not exists must_change_password boolean default false;
