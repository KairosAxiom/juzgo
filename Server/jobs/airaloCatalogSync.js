// =============================================================================
// Airalo catalog sync job
// Reference: juzgo-airalo-catalog-admin-spec.md §4
//
// What it does:
//   1. Authenticates against Airalo's Partner API (same credentials work for
//      sandbox and production — mode is account-level, not per-request).
//   2. Pulls the full package catalog via GET /v2/packages.
//   3. Derives `scope` (country/region/global) per top-level entry using
//      country_code presence + a small hardcoded label list — NOT the CSV.
//      (Confirmed Session 23: live API's `title` field matches the CSV's
//      "Country Region" text exactly, so scope can be derived from the live
//      response alone, with no dependency on the static CSV snapshot at
//      sync time. The CSV was only ever needed for these labels, and we've
//      now hardcoded them.)
//   4. Builds a self-referential country_code -> country_name map from every
//      single-country entry in the same response, to resolve the bare ISO
//      codes found in coverages[].name/code (Airalo does not return a
//      readable name inside coverages itself).
//   5. Upserts every package (sim + topup) into airalo_catalog, keyed on
//      package_id. Removes rows for packages no longer present.
//   6. Fully rebuilds country_coverage_index (delete-all-then-reinsert, per
//      spec — this table is a derived cache, not a source of truth).
//   7. Never touches juzgo_selected_plans — David's curation/pricing choices
//      persist independently of catalog refreshes.
//
// Run manually for now:
//   cd /d/Kairos/juzgo
//   node Server/jobs/airaloCatalogSync.js
//
// Scheduling (hourly, per Airalo's own guidance) is a separate, later step —
// see the note at the bottom of this file. Not wired to a cron trigger yet.
// =============================================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'https://partners-api.airalo.com';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------------------------------------------------------
// Known non-country Country Region labels, confirmed against the 2026-07-14
// CSV export (213 region-label rows + 38 "Discover Global" rows out of 3,867
// total — reconciles closely with the 215/38/3619 figures in
// Context-Airalo-Integration.md). This list is small and has been stable;
// if Airalo introduces a new regional bundle, it'll fall through to the
// GLOBAL_LABELS check, then default to 'region' with a console.warn — see
// deriveScope() below — rather than silently misclassifying as 'country'.
// -----------------------------------------------------------------------------
const REGION_LABELS = new Set([
  'Africa',
  'Africa Safari',
  'Asia',
  'Caribbean Islands',
  'Europe',
  'European Union and United Kingdom',
  'Latin America',
  'Middle East and North Africa',
  'North America',
  'Oceania',
]);
const GLOBAL_LABELS = new Set(['Discover Global']);

function deriveScope(entry) {
  // Primary signal: a real ISO country_code means this is a single-country
  // entry — the most reliable check, doesn't depend on the label list at all.
  if (entry.country_code) return 'country';
  if (GLOBAL_LABELS.has(entry.title)) return 'global';
  if (REGION_LABELS.has(entry.title)) return 'region';
  console.warn(`  ! Unrecognized non-country label "${entry.title}" — defaulting to 'region'. Add it to REGION_LABELS or GLOBAL_LABELS in this file once confirmed.`);
  return 'region';
}

async function getAccessToken() {
  const clientId = process.env.AIRALO_CLIENT_ID;
  const clientSecret = process.env.AIRALO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing AIRALO_CLIENT_ID / AIRALO_CLIENT_SECRET in Server/.env');
  }

  const form = new FormData();
  form.append('client_id', clientId);
  form.append('client_secret', clientSecret);
  form.append('grant_type', 'client_credentials');

  const res = await fetch(`${BASE_URL}/v2/token`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
  });
  const json = await res.json();
  const token = json.data?.access_token;
  if (!token) throw new Error(`Token request failed: ${JSON.stringify(json)}`);
  return token;
}

async function fetchAllPackages(token) {
  // Airalo's own docs: "Set the limit parameter to a high value (e.g., 1,000)
  // to fetch all packages in a single request without using pagination."
  // Still loop on `links.next` defensively in case the catalog ever exceeds
  // that in one response — 40 req/min limit gives plenty of headroom either way.
  let all = [];
  let url = `${BASE_URL}/v2/packages?limit=1000&page=1`;
  let page = 1;

  while (url) {
    console.log(`Fetching packages page ${page}...`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) {
      throw new Error(`Packages request failed: HTTP ${res.status} — ${await res.text()}`);
    }
    const json = await res.json();
    all = all.concat(json.data || []);

    const nextUrl = json.links?.next;
    url = nextUrl && nextUrl !== url ? nextUrl : null;
    page += 1;
    if (page > 20) break; // sanity guard against an infinite loop
  }

  return all;
}

// -----------------------------------------------------------------------------
// Fallback names for country codes that show up inside region/global bundle
// coverage lists but don't have their own standalone single-country package
// in the catalog (so the self-referential code->name map has nothing to
// borrow from for them). Confirmed against a real sandbox sync (Session 23) —
// these 11 codes were the ones that fell through. AN is a deprecated ISO code
// (former Netherlands Antilles); FR-GP is Airalo's non-standard extended code
// for Guadeloupe (a French overseas region, not its own ISO country) — both
// kept as-is since Airalo is the source of truth for what code it returns.
// If a future sync surfaces new unresolved codes, they'll show up in the
// script's own "! Could not resolve a readable name" warning — add them here.
// -----------------------------------------------------------------------------
const FALLBACK_COUNTRY_NAMES = {
  MR: 'Mauritania',
  SD: 'Sudan',
  PR: 'Puerto Rico',
  AX: 'Åland Islands',
  GG: 'Guernsey',
  PF: 'French Polynesia',
  SM: 'San Marino',
  IR: 'Iran',
  RU: 'Russia',
  AN: 'Netherlands Antilles',
  'FR-GP': 'Guadeloupe',
};

function buildCodeToNameMap(entries) {
  const map = { ...FALLBACK_COUNTRY_NAMES };
  for (const entry of entries) {
    if (entry.country_code && entry.title) {
      // Live catalog entries take priority over the static fallback list,
      // since they're always current; the fallback only fills genuine gaps.
      map[entry.country_code] = entry.title;
    }
  }
  return map;
}

function toCatalogRows(entries) {
  const rows = [];
  for (const entry of entries) {
    const scope = deriveScope(entry);
    for (const operator of entry.operators || []) {
      const coverages = operator.coverages || null;
      for (const pkg of operator.packages || []) {
        rows.push({
          package_id: pkg.id,
          country_region: entry.title,
          scope,
          type: pkg.type, // 'sim' | 'topup'
          data_amount: pkg.data ?? null,
          validity_days: pkg.day ?? null,
          net_price_usd: pkg.prices?.net_price?.USD ?? pkg.net_price ?? null,
          net_price_sgd: pkg.prices?.net_price?.SGD ?? null,
          minimum_selling_price_usd: pkg.prices?.recommended_retail_price?.USD ?? pkg.price ?? null,
          minimum_selling_price_sgd: pkg.prices?.recommended_retail_price?.SGD ?? null,
          recommended_retail_price_usd: pkg.prices?.recommended_retail_price?.USD ?? pkg.price ?? null,
          recommended_retail_price_sgd: pkg.prices?.recommended_retail_price?.SGD ?? null,
          networks: null, // legacy CSV-only field — coverages[].networks is the richer live-API equivalent; not populated here
          rechargeable: operator.rechargeability ?? null,
          topup_grace_window_days: operator.topup_grace_window_days ?? null,
          install_window_days: operator.install_window_days ?? null,
          activation_policy: operator.activation_policy ?? null,
          is_fair_usage_policy: Boolean(pkg.is_fair_usage_policy),
          fair_usage_policy: pkg.fair_usage_policy ?? null,
          coverages,
          last_synced_at: new Date().toISOString(),
        });
      }
    }
  }
  return rows;
}

function toCoverageIndexRows(entries, codeToName) {
  const rows = [];
  const missingNames = new Set();

  for (const entry of entries) {
    const scope = deriveScope(entry);
    for (const operator of entry.operators || []) {
      const packageIds = (operator.packages || []).map((p) => p.id);
      if (packageIds.length === 0) continue;

      if (scope === 'country') {
        // Single-country package: one row per package, mapping to itself.
        for (const pid of packageIds) {
          rows.push({
            country_name: entry.title,
            country_code: entry.country_code,
            package_id: pid,
            scope,
          });
        }
      } else {
        // Region/global: explode coverages into one row per (country, package).
        for (const cov of operator.coverages || []) {
          const code = cov.code;
          const name = codeToName[code];
          if (!name) missingNames.add(code);
          for (const pid of packageIds) {
            rows.push({
              country_name: name || code, // fall back to the raw code rather than dropping the row
              country_code: code,
              package_id: pid,
              scope,
            });
          }
        }
      }
    }
  }

  if (missingNames.size > 0) {
    console.warn(`  ! Could not resolve a readable name for ${missingNames.size} country code(s) (no matching single-country package in this sync): ${[...missingNames].join(', ')}`);
  }

  return rows;
}

async function upsertCatalog(rows) {
  console.log(`Upserting ${rows.length} package rows into airalo_catalog...`);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('airalo_catalog').upsert(batch, { onConflict: 'package_id' });
    if (error) throw new Error(`Upsert failed on batch starting at ${i}: ${error.message}`);
  }
}

async function removeStalePackages(liveIds) {
  const { data: existing, error } = await supabase.from('airalo_catalog').select('package_id');
  if (error) throw new Error(`Failed to read existing package_ids: ${error.message}`);

  const liveSet = new Set(liveIds);
  const stale = (existing || []).map((r) => r.package_id).filter((id) => !liveSet.has(id));

  if (stale.length === 0) {
    console.log('No stale packages to remove.');
    return;
  }
  console.log(`Removing ${stale.length} package(s) no longer in Airalo's catalog...`);
  const BATCH = 500;
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    const { error: delErr } = await supabase.from('airalo_catalog').delete().in('package_id', batch);
    if (delErr) throw new Error(`Delete failed on batch starting at ${i}: ${delErr.message}`);
  }
}

async function rebuildCoverageIndex(rows) {
  console.log('Rebuilding country_coverage_index (delete-all-then-reinsert)...');
  const { error: delErr } = await supabase.from('country_coverage_index').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw new Error(`Failed to clear country_coverage_index: ${delErr.message}`);

  console.log(`Inserting ${rows.length} coverage rows...`);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('country_coverage_index').insert(batch);
    if (error) throw new Error(`Insert failed on batch starting at ${i}: ${error.message}`);
  }
}

async function runCatalogSync() {
  const startedAt = Date.now();
  console.log('=== Airalo catalog sync starting ===');

  const token = await getAccessToken();
  console.log('Authenticated.');

  const entries = await fetchAllPackages(token);
  console.log(`Fetched ${entries.length} top-level catalog entries.`);

  const codeToName = buildCodeToNameMap(entries);
  console.log(`Built code->name map for ${Object.keys(codeToName).length} countries.`);

  const catalogRows = toCatalogRows(entries);
  console.log(`Flattened to ${catalogRows.length} individual packages (sim + topup).`);

  const coverageRows = toCoverageIndexRows(entries, codeToName);
  console.log(`Built ${coverageRows.length} country_coverage_index rows.`);

  await upsertCatalog(catalogRows);
  await removeStalePackages(catalogRows.map((r) => r.package_id));
  await rebuildCoverageIndex(coverageRows);

  const scopeCounts = catalogRows.reduce((acc, r) => {
    acc[r.scope] = (acc[r.scope] || 0) + 1;
    return acc;
  }, {});
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('=== Sync complete ===');
  console.log(`Elapsed: ${elapsed}s`);
  console.log('Package counts by scope:', scopeCounts);
  console.log(`juzgo_selected_plans was not touched — curation persists independently.`);
}

if (require.main === module) {
  runCatalogSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Sync failed:', err);
      process.exit(1);
    });
}

module.exports = { runCatalogSync };

// =============================================================================
// Not done yet / next steps:
// - This is manually run only. Scheduling (hourly, per admin spec §4) needs a
//   decision on WHERE it runs — a Render Cron Job service (recommended: no
//   execution-time limits, reuses this exact script and Server/.env) vs. a
//   Cloudflare Worker scheduled trigger (would need porting this logic into
//   the worker's dashboard editor, and Workers have CPU-time constraints that
//   could be tight for ~3,800+ upserts). Worth deciding before wiring up
//   automatic scheduling — not blocking a first manual test run.
// - First run against the real sandbox catalog will take a few minutes and
//   write ~3,800 rows to airalo_catalog and likely tens of thousands of rows
//   to country_coverage_index (each region/global package explodes into one
//   row per country it covers). That's expected, not a bug.
// =============================================================================
