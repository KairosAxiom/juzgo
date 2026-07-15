-- Session 21 cleanup: orphaned corp_id on davidlim@juzgo.world's profile,
-- and leftover test `corporates` rows (Worldwide Pte Ltd / eSimConnect
-- World Pte Ltd, Juzgo Test Corp). Run in Supabase SQL Editor.
--
-- Safe to run any time before launch. Wrapped in a transaction so it's
-- all-or-nothing. Also generically clears ANY profile whose corp_id points
-- at a corporates row that no longer exists (not just the known
-- davidlim@juzgo.world case) — this is the same class of bug the code
-- comments in server.js describe, so worth catching any other stray rows.

BEGIN;

-- Snapshot the corp ids we're about to remove
CREATE TEMP TABLE _test_corp_ids AS
SELECT id FROM corporates
WHERE company_name IN ('Worldwide Pte Ltd', 'eSimConnect World Pte Ltd', 'Juzgo Test Corp');

-- Clear stale corp links on profiles: anything pointing at a test corp,
-- OR anything already orphaned (corp_id set but the corporates row is gone)
UPDATE profiles
SET is_corporate = false, corp_id = NULL, corp_role = NULL
WHERE corp_id IN (SELECT id FROM _test_corp_ids)
   OR (corp_id IS NOT NULL AND corp_id NOT IN (SELECT id FROM corporates));

-- Remove any leftover invite rows tied to the test corps (old deprecated
-- flow, but the table/rows may still exist)
DELETE FROM corp_invites WHERE corp_id IN (SELECT id FROM _test_corp_ids);

-- Remove the test corporate accounts themselves
DELETE FROM corporates WHERE id IN (SELECT id FROM _test_corp_ids);

DROP TABLE _test_corp_ids;

COMMIT;

-- Verify afterward:
-- SELECT email, is_corporate, corp_id, corp_role FROM profiles p
--   JOIN auth.users u ON u.id = p.id WHERE u.email = 'davidlim@juzgo.world';
-- SELECT company_name FROM corporates;  -- should no longer list the 3 test rows
