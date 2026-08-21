/*
 * Partition-then-group day assignment (Session 31).
 *
 * Fixes region-impure days: a "Tokyo" trip with must-see Kinkaku-ji (Kyoto),
 * Nara, and Mount Fuji previously had those far places round-robined / k-means'd
 * into Tokyo days, because the global clusterer just minimises distance with no
 * concept of "different region". This module partitions places by location
 * FIRST, groups the out-of-destination ones by mutual proximity, and allocates
 * days to each partition proportionally within the FIXED trip length — so every
 * day comes out region-pure by construction.
 *
 * All PURE (no React, no network). Distance primitives are reused from
 * regions.js so there's a single haversine in the codebase's lib layer.
 */

import { haversineKm } from './regions.js';

/*
 * Proximity radius for grouping OUT-OF-DESTINATION places into a shared
 * excursion. Deliberately LARGER than regions.THRESHOLD_KM (25km, which splits
 * neighbourhoods WITHIN a trip): far-flung day-trip anchors that belong to one
 * excursion sit tens of km apart (Kyoto↔Nara ~41km, Kyoto↔Osaka ~46km) yet are
 * hundreds of km from the next region (Kansai↔Fuji ~275km, Kansai↔Tokyo ~367km).
 * 80km comfortably coalesces a Kansai cluster while never bridging that
 * inter-region gap. Heuristic; tunable.
 */
export const FAR_GROUP_KM = 80;

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n;
}
function validCoord(v) {
  const n = num(v);
  return typeof n === 'number' && !isNaN(n) && n !== 0;
}
function hasCoords(p) {
  return validCoord(p.lat) && validCoord(p.lng);
}

// Centre of a destination bounding box — the reference the partition measures
// "inside vs outside" against. Null when bounds are absent (fail-open upstream).
export function boundsCentroid(bounds) {
  if (!bounds) return null;
  return { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 };
}

// True if a coordinate sits outside the destination box (same 0.05 buffer as
// stripOutOfBoundsCoords, so "outside" means the same thing everywhere).
export function isOutsideBounds(lat, lng, bounds, buffer = 0.05) {
  if (!bounds) return false; // can't judge ⇒ treat as inside (fail-open)
  const inside =
    lat >= bounds.south - buffer && lat <= bounds.north + buffer &&
    lng >= bounds.west - buffer && lng <= bounds.east + buffer;
  return !inside;
}

/*
 * P1 — split places into in-destination vs out-of-destination.
 * Out = has valid coords AND falls outside the destination box. Places with no
 * usable coordinates stay IN (nothing to judge; the existing round-robin day
 * assignment handles them). Fail-open: null bounds ⇒ everything IN (no
 * partition, identical to pre-Session-31 behaviour).
 */
export function partitionByLocation(places, bounds) {
  if (!bounds) return { inDest: places.slice(), outDest: [] };
  const inDest = [];
  const outDest = [];
  for (const p of places) {
    if (hasCoords(p) && isOutsideBounds(num(p.lat), num(p.lng), bounds)) {
      outDest.push(p);
    } else {
      inDest.push(p);
    }
  }
  return { inDest, outDest };
}

/*
 * P2 — cluster PLACES (not days) by mutual proximity. Agglomerative: seed a
 * group with the first ungrouped place, absorb any place within thresholdKm of
 * the running group centroid, repeat until stable, then start the next group.
 * Kansai (Kinkaku-ji ↔ Nara ~40km) coalesces; Fuji (~350km away) is its own
 * group. Deterministic: input order is preserved for seeding and results are
 * stable across renders. Places without coords are ignored here (they can't be
 * spatially grouped — callers keep them in the destination partition).
 */
export function clusterPlacesByProximity(places, thresholdKm = FAR_GROUP_KM) {
  const pts = places.filter(hasCoords).map((p) => ({ ...p, lat: num(p.lat), lng: num(p.lng) }));
  const groups = [];
  const used = new Array(pts.length).fill(false);

  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const members = [pts[i]];
    used[i] = true;
    let centroid = { lat: pts[i].lat, lng: pts[i].lng };

    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pts.length; j++) {
        if (used[j]) continue;
        if (haversineKm(centroid.lat, centroid.lng, pts[j].lat, pts[j].lng) <= thresholdKm) {
          members.push(pts[j]);
          used[j] = true;
          // recompute running centroid
          centroid = {
            lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
            lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
          };
          grew = true;
        }
      }
    }
    groups.push({ places: members, centroid });
  }
  return groups;
}

/*
 * P3 — allocate a FIXED total number of days across partitions in proportion to
 * their place counts, with the invariants:
 *   • every non-empty group gets ≥ 1 day
 *   • the allocations sum EXACTLY to totalDays
 *   • allocation is deterministic (largest-remainder / Hamilton method)
 *   • index 0 is the DESTINATION and absorbs leftover/rounding
 *
 * `sizes` = [destCount, outGroup1Count, outGroup2Count, ...].
 * Edge — more groups than days: not every group can get a day. We give days to
 * the largest groups first (destination always kept), and return a `dropped`
 * list of group indices that got 0 so the caller/UI can surface it.
 */
export function allocateDays(totalDays, sizes) {
  const n = sizes.length;
  const total = Math.max(1, totalDays);
  if (n === 0) return { alloc: [], dropped: [] };
  if (n === 1) return { alloc: [total], dropped: [] };

  // If we literally cannot give every group ≥1 day, keep the destination plus
  // the (total-1) largest out-groups; the rest are dropped (0 days).
  if (n > total) {
    const outIdx = sizes.map((s, i) => ({ i, s })).slice(1)
      .sort((a, b) => b.s - a.s || a.i - b.i);
    const keep = new Set([0, ...outIdx.slice(0, total - 1).map((o) => o.i)]);
    const alloc = sizes.map((_, i) => (keep.has(i) ? 1 : 0));
    // destination keeps whatever remains after each kept out-group takes 1
    const dropped = sizes.map((_, i) => i).filter((i) => !keep.has(i));
    return { alloc, dropped };
  }

  const grandTotal = sizes.reduce((s, x) => s + x, 0) || 1;
  // Give every group its floor(proportional) but at least 1.
  const raw = sizes.map((s) => (s / grandTotal) * total);
  const floors = raw.map((r) => Math.max(1, Math.floor(r)));
  let used = floors.reduce((s, x) => s + x, 0);

  // If the mandatory ≥1 minimums already overshoot, trim from the destination
  // first, then from the largest allocations, never below 1.
  if (used > total) {
    let over = used - total;
    // trim destination surplus first
    while (over > 0 && floors[0] > 1) { floors[0]--; over--; }
    // then trim other groups by size desc, never below 1
    const order = sizes.map((s, i) => ({ i, s })).slice(1).sort((a, b) => b.s - a.s || a.i - b.i);
    let oi = 0;
    while (over > 0 && oi < order.length) {
      const gi = order[oi].i;
      if (floors[gi] > 1) { floors[gi]--; over--; }
      else oi++;
    }
    return { alloc: floors, dropped: [] };
  }

  // Distribute the remaining days by largest fractional remainder.
  let remaining = total - used;
  const remainders = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let ri = 0;
  while (remaining > 0) {
    floors[remainders[ri % remainders.length].i]++;
    remaining--;
    ri++;
  }
  return { alloc: floors, dropped: [] };
}

/*
 * P4 — order the out-of-destination groups for the "after the destination"
 * sequence: nearest-first from the destination centroid (reuses the
 * nearest-neighbour idea from regions.orderRegions). Groups without a centroid
 * (shouldn't happen — they're built from coord-bearing places) go last.
 */
export function orderOutGroups(groups, destCentroid) {
  if (!destCentroid || groups.length <= 1) return groups.slice();
  const remaining = groups.slice();
  const ordered = [];
  let anchor = destCentroid;
  while (remaining.length) {
    let bestI = 0, bestD = Infinity;
    remaining.forEach((g, i) => {
      const d = haversineKm(anchor.lat, anchor.lng, g.centroid.lat, g.centroid.lng);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const next = remaining.splice(bestI, 1)[0];
    ordered.push(next);
    anchor = next.centroid;
  }
  return ordered;
}

// Distance (km) below which an out-of-destination excursion is framed as a
// there-and-back day-trip; above it, as an overnight side-trip. Heuristic.
export const DAY_TRIP_KM = 150;

/*
 * Plain-language explanation of what an out-of-destination excursion entails,
 * for the review UI. No fabricated specifics (no line/fare/schedule) — only a
 * rough hours-each-way for the far case. `destination` is interpolated.
 */
export function describeOutOfDest(km, destination) {
  const rounded = Math.round(km);
  const dest = destination || 'your destination';
  if (km <= DAY_TRIP_KM) {
    return {
      kind: 'day-trip',
      text: `About ${rounded} km from ${dest} — doable as a day-trip, there and back in a day.`,
    };
  }
  const hours = km / 70; // coarse intercity average incl. access; deliberately rough
  const roughHours = hours < 1.5 ? '1–2 hours' : `about ${Math.round(hours)} hours`;
  return {
    kind: 'side-trip',
    text: `About ${rounded} km from ${dest} — roughly ${roughHours} each way. Realistically an overnight side-trip, not a day-trip; keeping it adds long transit to one of your days.`,
  };
}
