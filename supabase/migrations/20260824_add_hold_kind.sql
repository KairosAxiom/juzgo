-- 20260824_add_hold_kind.sql
-- §8.2 short-lived recall: allow kind='hold' on memory_items.
-- Additive: widens the CHECK to include 'hold'; every existing row stays valid.
-- Applied live via Supabase SQL editor 2026-08-24.
alter table memory_items
  drop constraint if exists memory_items_kind_check;

alter table memory_items
  add constraint memory_items_kind_check
  check (kind in ('recall','reminder','activity','document','appointment','health_report','hold'));
