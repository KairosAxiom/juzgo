# Juzgo — Airalo Catalog, Pricing & P&L: Admin Portal Build Spec

Status: design brief, not yet implemented. Written for the Claude Code session working
directly against `D:\Kairos\juzgo` (repo `KairosAxiom/juzgo`, Supabase backend,
Cloudflare Pages frontend, Render backend).

Source data referenced throughout: `report_api_with_net_prices_2026-07-14_ALL_Unlimited.csv`
(Airalo pricing export, 3,872 packages — 3,619 country-specific, 215 regional bundles,
38 global bundles). A working Excel version of the catalog/pricing/P&L logic already
exists (`juzgo_airalo_catalog_template.xlsx`) and can serve as the reference for column
names, formulas, and expected behavior — this spec ports that logic into the live product.

---

## 1. Goal

Move Airalo's full package catalog into Juzgo's own database, let David curate which
packages are actually sold (tick on/off) and set Juzgo's own customer-facing price per
package (independent of Airalo's recommended retail price), and track real cost-of-sales
vs. revenue per package as orders come in — all inside the existing Admin Portal, not a
separate spreadsheet.

---

## 2. Supabase schema

### 2.1 `airalo_catalog`
One row per Airalo package. Refreshed by the catalog sync job (see §4). This table is
system-owned — David does not edit it directly.

| Column | Type | Notes |
|---|---|---|
| `package_id` | text, PK | Airalo's package id, e.g. `sohbat-mobile-7days-1gb` |
| `country_region` | text | Airalo's label, e.g. `Japan`, `Asia`, `Discover Global` |
| `scope` | text | `country` \| `region` \| `global` — derived at sync time |
| `type` | text | `sim` \| `topup` |
| `data_amount` | text | e.g. `1 GB`, `Unlimited` |
| `validity_days` | int | parsed from package id / API `day` field |
| `net_price` | numeric | Airalo's cost to Juzgo |
| `minimum_selling_price` | numeric | **Hard floor, not a suggestion.** Per Airalo's own FAQ, the "retail price" / "recommended retail price" field IS the minimum price partners are permitted to sell at — despite the name, it is not merely advisory. Sourced from the same CSV/API field as `recommended_retail_price` below; kept as a separate, accurately-named column so the floor is unambiguous in code and in the Admin Portal UI. |
| `recommended_retail_price` | numeric | Retained for backward compatibility with the CSV import and existing naming; always equal to `minimum_selling_price`. Prefer `minimum_selling_price` in any new code that enforces the floor. |
| `networks` | text | raw networks string from CSV (single-country packages only) |
| `rechargeable` | boolean | from live API `rechargeability` field — **not in CSV** |
| `topup_grace_window_days` | int, nullable | from live API — operator-level grace window for topping up after validity ends |
| `install_window_days` | int, nullable | from live API — window before an uninstalled eSIM is recycled |
| `activation_policy` | text | from live API — e.g. `first-usage` |
| `is_fair_usage_policy` | boolean | from live API |
| `fair_usage_policy` | text, nullable | from live API |
| `coverages` | jsonb | array of `{country_code, country_name, networks}` — populated for region/global packages from live API `coverages` field; null for single-country packages |
| `last_synced_at` | timestamptz | |

Indexes: `scope`, `country_region`, GIN index on `coverages` if querying inside it directly
(otherwise rely on `country_coverage_index`, §2.2).

### 2.2 `country_coverage_index`
Reverse-lookup table built at sync time by exploding every package's coverage into
per-country rows. Powers the search feature in §6.2.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `country_name` | text | e.g. `Japan` |
| `country_code` | text | e.g. `JP` |
| `package_id` | text, FK -> airalo_catalog.package_id | |
| `scope` | text | `country` \| `region` \| `global` — copied from parent package for fast filtering |

For single-country packages, this is a 1:1 row (package covers only itself). For
region/global packages, one row per country in `coverages`.

### 2.3 `juzgo_selected_plans`
David's curation layer. This is what the Admin Portal's "Sell?" tick and price field
actually write to.

| Column | Type | Notes |
|---|---|---|
| `package_id` | text, PK, FK -> airalo_catalog.package_id | |
| `is_active` | boolean | the "tick" — whether this plan is live on the storefront |
| `your_price` | numeric | Juzgo's customer-facing price; defaults to `minimum_selling_price` on first tick, editable after — but never below it |
| `updated_by` | text | admin user email |
| `updated_at` | timestamptz | |

**Validation rule (enforce both client-side and server-side):** `your_price >=
airalo_catalog.minimum_selling_price`. This should be a database constraint (CHECK
constraint or trigger), not just a UI guard, since a direct API call or a future
integration could otherwise bypass a client-only check. Airalo enforces this floor on
their end too (order submission is expected to reject anything effectively priced below
it), so a Juzgo-side violation would surface as a failed order rather than a silent
problem — better to catch it at save time in the Admin Portal than at checkout.

Note for pricing strategy: this floor is shared by every Airalo partner, not just Juzgo —
no reseller can legally undercut it. Competitive differentiation on identical packages is
therefore capped at "match the floor," with real differentiation coming from UX (the
Check/Verify flow, search/coverage design), not from price alone.

Storefront queries always join `airalo_catalog` -> `juzgo_selected_plans` filtered on
`is_active = true` — the catalog table alone is never customer-facing.

### 2.4 `orders` (extend existing table)
Add columns to whatever order/purchase table already backs "My Purchases":

| Column | Type | Notes |
|---|---|---|
| `package_id` | text, FK -> airalo_catalog.package_id | |
| `iccid` | text, nullable | populated after Airalo order confirms; null until then |
| `net_price_at_sale` | numeric | snapshot — Airalo's price can change over time, P&L must use price-at-purchase |
| `your_price_at_sale` | numeric | snapshot of what the customer was actually charged |
| `esim_status_last_checked` | text, nullable | cache of last "Check" result: `active` \| `expired` \| `not_rechargeable` |
| `esim_status_checked_at` | timestamptz, nullable | |

Snapshotting price at sale time is what makes the P&L dashboard (§7) accurate even as
Airalo's pricing or David's own pricing changes week to week.

---

## 3. Airalo API fields needed (recap — not in the CSV)

The CSV export only has commercial fields (price, data, validity via package id, a
useless networks-count string for bundles). Everything below must come from the live
`GET /v2/packages` endpoint during catalog sync:

- `rechargeability` (boolean, per package)
- `topup_grace_window_days`, `install_window_days` (per operator)
- `activation_policy`
- `is_fair_usage_policy`, `fair_usage_policy`
- `coverages` (array of country/network objects — this is the one that unblocks the
  country-list and search features)

For the "Check" button, the relevant live endpoints (called on-demand, per ICCID, not
polled) are the usage endpoint and the eSIM package history endpoint. The package
history endpoint is rate-limited to 1 call per 15 minutes per ICCID — fine for a
user-triggered button, not for a background job.

---

## 4. Catalog sync job

- Runs hourly (per Airalo's own guidance — well under their 40 req/min limit).
- Calls `GET /v2/packages` for the full catalog (~3,872 packages currently, per the CSV;
  live count may differ slightly at sync time).
- Upserts into `airalo_catalog` keyed on `package_id`; removes rows no longer present in
  the response (Airalo packages do go out of stock).
- Explodes `coverages` into `country_coverage_index` for every region/global package.
- Does **not** touch `juzgo_selected_plans` — David's curation and pricing choices persist
  independent of catalog refreshes. A newly out-of-stock package that's still marked
  `is_active` should probably be flagged for David's attention rather than silently pulled
  — exact behavior (auto-deactivate vs. flag) still to be decided.

---

## 5. Admin Portal UI — new "Catalog & Pricing" tab

Mirrors the Excel template's logic, adapted for a live paginated table:

- **Filter pills**: Country / Region / Global (same semantics as the storefront search
  design in §6.2) plus a search box, since 3,872 rows needs filtering to be usable.
- **Table columns**: Sell? (toggle, writes `juzgo_selected_plans.is_active`), Country/
  Region, Package Id, Type, Data, Validity, Net Price, Recommended Retail, Your Price
  (editable, writes `juzgo_selected_plans.your_price`), Margin $, Margin % (both computed
  client-side or via a view, not stored).
- Virtualized/paginated rendering required — do not render all 3,872 rows to the DOM at
  once.
- Bulk actions worth considering: "select all in current filter", "apply RRP as price to
  all selected" — not required for v1 but likely requested once David is using this daily.

---

## 6. Storefront UI

### 6.1 Bundle product page
"View List of Countries" button, populated from `airalo_catalog.coverages` (already
cached, no live call). Scrollable/searchable list for large bundles (Discover Global
likely 100+ countries).

### 6.2 Search & browse
Three scope filter pills (Country / Region / Global) + search box, per the design agreed
earlier in this project:
- Pill alone, no search text -> browse all packages in that scope.
- Search text alone -> queries `country_coverage_index` by country name, returns results
  grouped by scope (country-specific / region bundles / global bundles containing that
  country), narrowest to broadest.
- Pill + search text together -> narrows to just that scope's matches.
- Each region/global result card shows "Covers X and N more countries", clickable, opens
  the same country-list modal as §6.1 (second entry point, same cached data).
- Open question, not yet decided: does searching a region name (e.g. "Asia") also surface
  the narrower per-country plans nested inside it? Flagged for a product decision before
  building this direction.

### 6.3 "My Purchases" — Check/Verify button
Per purchase (once `iccid` is populated post-order):
- Button calls a new backend endpoint, e.g. `GET /esim/:iccid/check`, which calls Airalo's
  live usage/package-history endpoint server-side (Airalo token never exposed to
  frontend) and returns one of three states:
  - **Top Up available** — rechargeable, still within validity or within
    `topup_grace_window_days` of the operator
  - **Buy New eSIM** — not rechargeable (never had a topup path), but not necessarily
    expired
  - **Expired — Buy New eSIM** — validity and any grace window have both passed
- Do not calculate this state locally from stored dates — always defer to the live Airalo
  response, since grace-window behavior varies by operator and (per Airalo's own
  documentation) has some inconsistency worth confirming empirically in sandbox before
  finalizing the three-state logic above.
- Cache the result in `orders.esim_status_last_checked` / `esim_status_checked_at` purely
  for UI display ("last checked 2 hours ago") — never as a substitute for a fresh call
  when the user actually taps Check, given the 15-minute rate limit is per ICCID, not per
  user session.

---

## 7. P&L Dashboard

Two layers, same as the Excel version:

**Projected/catalog economics** — sum of `net_price` vs `your_price` across everything
currently `is_active = true` in `juzgo_selected_plans`. Answers "if every selected plan
sold once, what's the margin." Useful for pricing decisions, not a real P&L.

**Actual P&L** — driven entirely by `orders`, using `net_price_at_sale` and
`your_price_at_sale` (the snapshotted values, not current catalog prices):
- Revenue = `SUM(your_price_at_sale)` over orders in the selected period
- COGS = `SUM(net_price_at_sale)` over the same
- Gross profit = Revenue − COGS
- Gross margin % = Gross profit / Revenue

Break down by scope (country/region/global) and by individual package for David to see
which plans are actually profitable in practice, not just on paper.

---

## 8. Open items / decisions still needed

1. Sandbox-test actual topup behavior against an expired ICCID to confirm the three-state
   Check logic in §6.3 — Airalo's own help content is inconsistent on whether topup
   survives validity expiry, and this needs empirical confirmation, not assumption.
2. Reverse search direction (region name -> nested country plans) — product decision,
   not yet made.
3. Behavior when a package drops out of Airalo's live catalog while still marked
   `is_active` in `juzgo_selected_plans` — auto-deactivate vs. flag for review.
4. Whether topup packages need their own "Sell?" curation separate from their parent sim
   package, or should always follow the parent's active/inactive state automatically.

---

## 9. Suggested build order

1. Supabase migration for the four schema pieces in §2.
2. Catalog sync job (§4) — get real data flowing before building UI against it.
3. Admin Portal Catalog & Pricing tab (§5) — David can start curating immediately, even
   before the storefront-facing pieces exist.
4. Storefront search + bundle country-list (§6.1, §6.2).
5. Check/Verify button (§6.3) — depends on `iccid` capture at order time, which should be
   verified as already wired into the order-creation flow before this step starts.
6. P&L Dashboard (§7) — depends on real order data existing, so naturally comes last.
