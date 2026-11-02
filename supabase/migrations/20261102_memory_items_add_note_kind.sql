-- Capture Track S2 (2026-11-02): add 'note' kind for the Alfred notebook.
-- Two-layer rule: must match ALLOWED_KINDS in Server/server.js.
begin;
alter table memory_items drop constraint if exists memory_items_kind_check;
alter table memory_items add constraint memory_items_kind_check
  check (kind in ('recall','reminder','activity','document','appointment','health_report','hold','vital','diet','note'));
commit;
