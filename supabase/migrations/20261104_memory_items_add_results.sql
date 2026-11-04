-- 2026-11-04: structured lab values on health_report rows.
-- Each entry: { test, value, unit, range, flag }. Drives Alfred's lab comparison table
-- and trend charts (build 2026-11-04a). Additive and nullable; existing rows untouched.
alter table memory_items add column if not exists results jsonb;
