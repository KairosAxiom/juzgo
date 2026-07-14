# Context.md — Juzgo × Airalo Integration

Last updated: 2026-07-14. Written to bring a new session (or a new contributor) up to
speed on this workstream without re-reading the full conversation history. Companion
documents referenced throughout: `juzgo-airalo-catalog-admin-spec.md` (full schema and
build spec), `juzgo_airalo_catalog_template.xlsx` (working catalog/pricing/P&L tool),
`juzgo-faq-draft.md` (customer-facing FAQ copy).

---

## Where this fits in Juzgo

Juzgo (juzgo.world) is registering as an Airalo Partner API integration to source its
eSIM catalog, replacing (or supplementing) manual plan management. This is the single
biggest pending integration in the product — Airalo API integration has been the blocked
item since early development, pending company registration/onboarding. That registration
is now complete and Juzgo has sandbox API access.

## Current status

- **Registered with Airalo, sandbox API access confirmed working.** API credentials
  (client_id / client_secret) obtained from the Partner Platform's API Integration menu.
  Same credentials work for both Sandbox and Production — mode is an **account-level
  state**, not a per-request parameter. Airalo's own docs: same API URL for both modes,
  no request-side switch exists.
- Sandbox order flow reportedly works end-to-end **except** real QR code activation on a
  physical device — this is expected: sandbox responses use dummy values (e.g. a literal
  `"TEST"` matching_id in Airalo's own example responses), so sandbox validates the code
  path, not a real installable eSIM. Full device-install verification only happens in
  Production.
- **No coding done yet.** Everything to date is design/spec work: schema, catalog sync
  design, Admin Portal plan, storefront UX, pricing rules, FAQ copy. This document plus
  the admin spec doc are meant to be handed to a Claude Code session working directly
  against the `juzgo` repo (`D:\Kairos\juzgo` on GENESIS-PRJ3) to start actual
  implementation.

## Source data

`report_api_with_net_prices_2026-07-14_ALL_Unlimited.csv` — Airalo's pricing export.
3,872 packages: 3,619 country-specific, 215 regional bundles, 38 global bundles. Columns:
Country Region, Package Id, Type (sim/topup), Net Price, Recommended retail price, Data,
SMS, Voice, Networks. This CSV has commercial fields only — no rechargeability, coverage
breakdown, or fair-use terms. Those come from the live `GET /v2/packages` API response
and must be merged in during catalog sync (see admin spec §1–4).

Of the 3,872 packages, 1,465 are "Unlimited" data type (762 sim, 703 topup) — roughly
38% of the catalog, which is why the Unlimited fair-use mechanics were worth documenting
carefully (see FAQ doc).

## Key business decisions made in this workstream

See `DECISIONS.md` for the durable decisions from this workstream (pricing floor
enforcement, no custom bundle creation, coverage curation rules, sim-before-topup
scope, Check/Verify live-call requirement, search UX, competitive positioning). This
Context.md intentionally doesn't repeat them — check there for the authoritative,
maintained version.

For quick orientation: sim vs topup are structurally different (sim = new eSIM/ICCID,
topup = recharge of an existing one, only works if rechargeable and within its validity
or grace window) — this distinction underlies most of the decisions above.

## Open items still needing a decision or sandbox confirmation

Full list in admin spec doc §8. Highlights:
- Empirically test topup behavior against an expired ICCID in sandbox — Airalo's help
  content is inconsistent on whether topup survives validity expiry.
- Whether searching a region name should also surface nested per-country plans (reverse
  search direction) — not yet decided.
- Behavior when a package drops from Airalo's live catalog while still marked active in
  Juzgo's selection — auto-deactivate vs. flag for review.
- Whether topup packages need independent curation/activation from their parent sim
  package.

## Handling credentials

`client_id` / `client_secret` obtained from Airalo Partner Platform → API Integration
menu. Same pair for sandbox and production. Store as environment variables on Render
(alongside existing Stripe/Supabase/Resend keys) — never hardcoded or committed. Treat as
production-sensitive from day one, since there is no separate "safe" sandbox-only key.

## Going live (future, not yet applicable)

Production switch is manual and irreversible — done by contacting the Airalo account
manager once all sandbox testing is complete (per Airalo's Go Live Checklist: all
endpoints tested, error handling verified, hourly package sync running, monitoring in
place). Switching **deletes sandbox products** and syncs the live catalog in — any
`juzgo_selected_plans` curation done against sandbox package IDs will need redoing
against production package IDs after the switch, since sandbox and production package
IDs are not guaranteed to match.

## Suggested next action

Per the admin spec's build order (§9): start with the Supabase migration for the four
new/extended tables (`airalo_catalog`, `country_coverage_index`,
`juzgo_selected_plans`, extended `orders`), then a throwaway script that authenticates
and pulls one real `GET /v2/packages` response to confirm field names and structure match
what this spec assumes, before writing the full catalog sync job.
