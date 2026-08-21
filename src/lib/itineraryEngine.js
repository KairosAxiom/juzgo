/* ============================================================================
 * src/lib/itineraryEngine.js — shared itinerary generation engine.
 *
 * Extracted verbatim from src/pages/Itinerary.js (the pure geo-compute zone,
 * the three Claude prompt builders, and the two salvage JSON parsers) so that
 * BOTH the React frontend (Itinerary.js) and the Node backend
 * (Server/server.js, via `await import('../src/lib/itineraryEngine.js')`) run
 * ONE copy of the generation logic — no fork, single source of truth.
 *
 * PURE + IO ONLY. No React, no state, no DOM. The one duplicated haversine that
 * used to live here is gone — we import the single lib-layer copy from
 * ./regions, as regions.js/partition.js already do.
 *
 * The async IO layer (Nominatim geocoding) uses global fetch, present in
 * browsers and in Node >=18 (Render runs >=18). No node-fetch import needed.
 * ========================================================================== */

import { haversineKm, deriveRegions, orderRegions } from './regions.js';
import {
  boundsCentroid,
  partitionByLocation,
  clusterPlacesByProximity,
  allocateDays,
  orderOutGroups,
} from './partition.js';

/* ────────────────────────────────────────────────────────────────────────
   Geo helpers — day-clustering, within-day sequencing, travel-time calc.
   None of this depends on Claude's output; it runs entirely on the lat/lng
   already attached to each place, so it's deterministic and reliable.
   ──────────────────────────────────────────────────────────────────────── */

export function toNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n;
}

export function isValidCoord(v) {
  const n = toNum(v);
  return typeof n === 'number' && !isNaN(n) && n !== 0;
}

/* Assigns each point to its nearest centroid (haversine) */
function kmeansAssign(pts, centroids) {
  return pts.map((p) => {
    let best = 0, bestDist = Infinity;
    centroids.forEach((c, i) => {
      const d = haversineKm(p.lat, p.lng, c.lat, c.lng);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  });
}

function recomputeCentroids(pts, assignments, k, fallback) {
  return Array.from({ length: k }, (_, ci) => {
    const members = pts.filter((_, i) => assignments[i] === ci);
    if (members.length === 0) return fallback[ci];
    return {
      lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
      lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
    };
  });
}

/* Farthest-point sampling for k-means init — spreads initial centroids out
   across the data instead of risking two starting near each other, which
   is what plain random init can do at small N. */
function farthestPointInit(pts, k) {
  const centroids = [{ lat: pts[0].lat, lng: pts[0].lng }];
  while (centroids.length < k) {
    let bestPt = pts[0], bestDist = -1;
    pts.forEach((p) => {
      const d = Math.min(...centroids.map((c) => haversineKm(p.lat, p.lng, c.lat, c.lng)));
      if (d > bestDist) { bestDist = d; bestPt = p; }
    });
    centroids.push({ lat: bestPt.lat, lng: bestPt.lng });
  }
  return centroids;
}

/* Lloyd's algorithm (standard k-means) — converges in a handful of
   iterations at this scale (≤30 points). Minimizes actual within-cluster
   distance, unlike a 1D axis projection. Doesn't guarantee equal cluster
   sizes on its own — balanceClusterSizes() handles that afterward. */
function kmeansCluster(pts, k, maxIter = 25) {
  let centroids = farthestPointInit(pts, k);
  let assignments = new Array(pts.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    const next = kmeansAssign(pts, centroids);
    const changed = next.some((a, i) => a !== assignments[i]);
    assignments = next;
    centroids = recomputeCentroids(pts, assignments, k, centroids);
    if (!changed) break;
  }
  return { assignments, centroids };
}

/* k-means clusters are rarely equal-sized. Repeatedly move the
   best-fit point (closest to the target cluster's centroid, among points
   currently in an oversized cluster) from the most-oversized cluster into
   the most-undersized one, until every day has its target count. */
function balanceClusterSizes(pts, assignments, centroids, k) {
  const n = pts.length;
  const base = Math.floor(n / k);
  const remainder = n % k;
  const targetSizes = new Array(k).fill(base);
  for (let i = 0; i < remainder; i++) targetSizes[i] += 1;

  const assign = [...assignments];
  const sizesOf = () => {
    const s = new Array(k).fill(0);
    assign.forEach((a) => s[a]++);
    return s;
  };

  let guard = 0;
  while (guard++ < n * k) {
    const s = sizesOf();
    const overIdx = s.findIndex((count, i) => count > targetSizes[i]);
    if (overIdx === -1) break; // totals match, so this means every cluster is exactly at target
    const underIdx = s.findIndex((count, i) => count < targetSizes[i]);
    if (underIdx === -1) break;

    let bestPtIdx = -1, bestDist = Infinity;
    pts.forEach((p, i) => {
      if (assign[i] !== overIdx) return;
      const d = haversineKm(p.lat, p.lng, centroids[underIdx].lat, centroids[underIdx].lng);
      if (d < bestDist) { bestDist = d; bestPtIdx = i; }
    });
    if (bestPtIdx === -1) break;
    assign[bestPtIdx] = underIdx;
  }
  return assign;
}

/* Orders the day-clusters into a sensible day-1-through-day-N sequence by
   chaining centroids nearest-neighbour style — so Day 2 picks up roughly
   where Day 1 left off, rather than jumping across town and back. */
function orderClustersByCentroidPath(centroids) {
  const remaining = centroids.map((c, i) => ({ ...c, idx: i }));
  const path = [remaining.shift()];
  while (remaining.length) {
    const last = path[path.length - 1];
    let bestI = 0, bestDist = Infinity;
    remaining.forEach((c, i) => {
      const d = haversineKm(last.lat, last.lng, c.lat, c.lng);
      if (d < bestDist) { bestDist = d; bestI = i; }
    });
    path.push(remaining.splice(bestI, 1)[0]);
  }
  return path.map((c) => c.idx);
}

/*
 * Nominatim (OpenStreetMap's free geocoder, no key required) is used to
 * fetch a real administrative bounding box for the trip's destination.
 * This gives ground truth to catch coordinate hallucinations against.
 * A pure distance/statistics approach was tried first and rejected: "far
 * from downtown" isn't inherently wrong (e.g. Changi vs. central
 * Singapore) but "outside the country" is a different kind of wrong, and
 * in a small, compact destination those two can land at nearly the same
 * distance — geometry alone can't reliably tell them apart. A real border
 * can.
 */
export async function fetchDestinationBounds(destination) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`
    );
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit || !hit.boundingbox) return null;
    const [south, north, west, east] = hit.boundingbox.map(Number);
    if ([south, north, west, east].some((n) => isNaN(n))) return null;
    return { south, north, west, east };
  } catch {
    return null; // fail open — if geocoding is unreachable, skip the check rather than blocking the whole flow
  }
}

/* True for a place the traveller explicitly named (Stage-1 must-see, which
   carries source==='user_specified', or a PlacePicker "add your own", which
   carries isCustom===true). These are trusted differently by the bounds
   strip below — see stripOutOfBoundsCoords. */
export function isUserNamedPlace(p) {
  return p.source === 'user_specified' || p.isCustom === true;
}

/*
 * Strips coordinates from any place whose lat/lng falls outside the
 * destination's real bounding box (plus a small buffer for edge rounding).
 * Places that lose their coordinates this way fall into the existing
 * "no usable coordinate" handling everywhere downstream (round-robin day
 * assignment, skipped on the map, skipped in travel-time segments) instead
 * of getting force-fit into a cluster and dragging it across a border.
 * No-op if bounds couldn't be fetched — fails open rather than blocking.
 *
 * User-named places (Session 29, multi-region support) are EXEMPT from the
 * tight destination box: a traveller in "Tokyo" may legitimately add Nara
 * (~370km SW) or Mount Fuji (~100km W), and those must survive as real
 * coordinates so they can form their own region cards rather than being
 * treated as hallucinations. They still get a generous country-scale sanity
 * guard so a genuinely garbage coordinate (wrong continent) is still caught.
 * AI-returned places keep the original tight strip unchanged — catching
 * coordinate hallucinations is that strip's entire purpose.
 */
export function stripOutOfBoundsCoords(places, bounds) {
  if (!bounds) return places;
  const buffer = 0.05; // ~5km — generous for edge rounding, tight enough to still catch cross-border hallucinations
  // Generous country-scale margin applied ONLY to user-named outliers: a few
  // degrees beyond the destination box (~a few hundred km) tolerates a
  // legitimately distant day-trip while still rejecting a wrong-country point.
  const SANITY_MARGIN_DEG = 4;
  return places.map((p) => {
    if (!isValidCoord(p.lat) || !isValidCoord(p.lng)) return p;
    const lat = toNum(p.lat), lng = toNum(p.lng);
    const inBounds =
      lat >= bounds.south - buffer && lat <= bounds.north + buffer &&
      lng >= bounds.west - buffer && lng <= bounds.east + buffer;
    if (inBounds) return { ...p, lat, lng };

    if (isUserNamedPlace(p)) {
      const withinSanity =
        lat >= bounds.south - SANITY_MARGIN_DEG && lat <= bounds.north + SANITY_MARGIN_DEG &&
        lng >= bounds.west - SANITY_MARGIN_DEG && lng <= bounds.east + SANITY_MARGIN_DEG;
      if (withinSanity) {
        // A trusted, deliberately-distant place (day-trip to another city).
        // Keep its coordinates — the region logic will split it out later.
        return { ...p, lat, lng };
      }
      console.warn(
        `[Juzgo debug] Rejected user-named "${p.name}" — coordinates (${lat}, ${lng}) are wildly outside the destination even for a day-trip. Likely a bad geocode.`
      );
      return { ...p, lat: null, lng: null };
    }

    console.warn(
      `[Juzgo debug] Rejected "${p.name}" — coordinates (${lat}, ${lng}) fall outside the destination's real geographic bounds. Likely bad coordinates from Claude.`
    );
    return { ...p, lat: null, lng: null };
  });
}

/* Removes any Stage-3 output whose subject is a transit network or mode of
   transport itself rather than a real destination (e.g. "MRT Network",
   "City Bus System"). The prompt already asks Claude not to generate
   these, but categories are self-reported by the model, so this is a
   cheap code-level backstop. */
export function stripTransitNetworkPlaces(places) {
  return places.filter((p) => p.type !== 'transport');
}

/* Looks up a single named place via Nominatim — used only as a fallback
   when a traveller's explicitly-requested place doesn't come back in
   Claude's Stage 3 JSON, so it can still be force-added with real
   coordinates rather than silently dropped. */
export async function geocodePlace(placeName, destination) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${placeName}, ${destination}`)}&format=json&limit=1`
    );
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    const lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/*
 * Geocodes any PlacePicker "add your own" place (isCustom, arriving with
 * lat/lng === null) so it can be placed on the map, clustered into a day,
 * and — when it's a genuinely distant spot — split into its own region card
 * (Session 29, multi-region support). Runs sequentially, one Nominatim
 * request at a time (same discipline as ensureMustSeePlaces), on the handful
 * of custom places at most. FAIL-OPEN: if a lookup returns null the place
 * keeps its null coordinates and behaves exactly as before this change
 * (listed, dropped into the lightest day, not mapped) — no regression.
 */
export async function geocodeCustomAdds(places, destination) {
  const result = [];
  for (const p of places) {
    const needsCoords = p.isCustom === true && !(isValidCoord(p.lat) && isValidCoord(p.lng));
    if (!needsCoords) { result.push(p); continue; }
    const coords = await geocodePlace(p.name, destination);
    result.push(coords ? { ...p, lat: coords.lat, lng: coords.lng } : p);
  }
  return result;
}

/*
 * Guarantees every place the traveller explicitly typed in Stage 1 ends up
 * in the final list, even if Claude's Stage 3 output dropped it. Does a
 * loose name-match first (Claude may have returned it with slightly
 * different phrasing); only geocodes and force-adds if genuinely missing.
 * Runs sequentially (not Promise.all) since it's a handful of places at
 * most and keeps Nominatim usage one-request-at-a-time.
 */
export async function ensureMustSeePlaces(places, mustSeeList, destination) {
  if (!mustSeeList || mustSeeList.length === 0) return places;
  const result = [...places];
  for (const rawName of mustSeeList) {
    const name = rawName.trim();
    if (!name) continue;
    const alreadyPresent = result.some(
      (p) => p.name && (p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()))
    );
    if (alreadyPresent) continue;
    const coords = await geocodePlace(name, destination);
    result.push({
      id: `must-see-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      type: 'places',
      description: 'Added because you specifically asked for it.',
      trust: 'ai',
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      source: 'user_specified',
      tier: 'core',
    });
  }
  return result;
}

/*
 * Replaces Claude's own "day" guess with a computed one. Runs balanced
 * k-means on valid coordinates — actual pairwise proximity, not a 1D
 * approximation — so each day is the set of places genuinely closest to
 * each other, sized evenly, then orders the resulting days into a sensible
 * day-1-to-day-N geographic sequence. Places without usable coordinates
 * (custom user-added places, or anything stripped by
 * stripOutOfBoundsCoords for having bad coordinates) fall back to
 * round-robin — better to place them arbitrarily than let one bad point
 * corrupt an entire day's cluster.
 */
export function clusterPlacesByDay(places, dayCount) {
  const safeDayCount = Math.max(1, dayCount);
  const valid = places
    .filter((p) => isValidCoord(p.lat) && isValidCoord(p.lng))
    .map((p) => ({ ...p, lat: toNum(p.lat), lng: toNum(p.lng) }));
  const invalid = places.filter((p) => !(isValidCoord(p.lat) && isValidCoord(p.lng)));

  if (valid.length === 0) {
    return places.map((p, i) => ({ ...p, day: p.day || ((i % safeDayCount) + 1) }));
  }
  if (valid.length <= safeDayCount) {
    // Too few points for k-means to be meaningful — one per day is already optimal.
    const withDay = valid.map((p, i) => ({ ...p, day: i + 1 }));
    const invalidWithDay = invalid.map((p, i) => ({ ...p, day: p.day || ((i % safeDayCount) + 1) }));
    return [...withDay, ...invalidWithDay];
  }

  const { assignments, centroids } = kmeansCluster(valid, safeDayCount);
  const balanced = balanceClusterSizes(valid, assignments, centroids, safeDayCount);
  const finalCentroids = recomputeCentroids(valid, balanced, safeDayCount, centroids);
  const dayOrder = orderClustersByCentroidPath(finalCentroids);
  const clusterToDay = {};
  dayOrder.forEach((clusterIdx, i) => { clusterToDay[clusterIdx] = i + 1; });

  const withDay = valid.map((p, i) => ({ ...p, day: clusterToDay[balanced[i]] }));
  const invalidWithDay = invalid.map((p, i) => ({ ...p, day: p.day || ((i % safeDayCount) + 1) }));
  return [...withDay, ...invalidWithDay];
}

/*
 * Session 31 — partition-then-group day assignment.
 *
 * Replaces the single global clusterPlacesByDay() call. Splits places into the
 * destination vs out-of-destination groups, allocates the FIXED trip days
 * proportionally, clusters each partition INDEPENDENTLY (so a Kyoto day never
 * mixes with a Tokyo day), and lays the days out destination-first then each
 * out-of-town group as its own contiguous day-block. Every place is tagged with
 * a `regionKey` ('dest' or a per-group key like 'out-0') so the review UI and
 * the cross-boundary move guard can reason about which block a stop belongs to.
 *
 * Returns { places, layout } where:
 *   places = every input place, now with .day (1..dayCount) and .regionKey
 *   layout = [{ key, kind:'dest'|'out', label, dayStart, dayEnd, places:[...],
 *              centroid, framingKm }]  — ordered blocks, for the review UI
 *
 * Fail-open: null bounds ⇒ everything is one 'dest' block clustered exactly as
 * before (pre-Session-31 behaviour), so a Nominatim outage can't break builds.
 * `dropped` group indices from allocateDays are folded back into the
 * destination (their places rejoin 'dest') so nothing is silently lost.
 */
export function partitionAndClusterByDay(places, dayCount, bounds, destinationName) {
  const safeDays = Math.max(1, dayCount);

  // Fail-open: no bounds ⇒ single destination block, original behaviour.
  if (!bounds) {
    const clustered = clusterPlacesByDay(places, safeDays).map((p) => ({ ...p, regionKey: 'dest' }));
    return {
      places: clustered,
      layout: [{ key: 'dest', kind: 'dest', label: destinationName || 'Main area', dayStart: 1, dayEnd: safeDays, places: clustered, centroid: null, framingKm: 0 }],
    };
  }

  const { inDest, outDest } = partitionByLocation(places, bounds);
  const destCentroid = boundsCentroid(bounds);
  const outGroups = orderOutGroups(clusterPlacesByProximity(outDest), destCentroid);

  // No out-of-destination places ⇒ single destination block (common case).
  if (outGroups.length === 0) {
    const clustered = clusterPlacesByDay(inDest, safeDays).map((p) => ({ ...p, regionKey: 'dest' }));
    return {
      places: clustered,
      layout: [{ key: 'dest', kind: 'dest', label: destinationName || 'Main area', dayStart: 1, dayEnd: safeDays, places: clustered, centroid: destCentroid, framingKm: 0 }],
    };
  }

  // Allocate the fixed days: index 0 = destination, then each out-group.
  const sizes = [inDest.length, ...outGroups.map((g) => g.places.length)];
  const { alloc, dropped } = allocateDays(safeDays, sizes);

  // Any dropped group (more groups than days) folds its places back into the
  // destination partition so they're never lost — they just aren't their own
  // block. (Rare; the review UI surfaces the squeeze.)
  const droppedSet = new Set(dropped);
  const foldBack = [];
  outGroups.forEach((g, gi) => { if (droppedSet.has(gi + 1)) foldBack.push(...g.places); });
  const destPlacesInput = [...inDest, ...foldBack];
  const keptOutGroups = outGroups.filter((_, gi) => !droppedSet.has(gi + 1));
  const keptAlloc = alloc.filter((_, i) => i === 0 || !droppedSet.has(i)); // dest + kept groups
  const destDays = keptAlloc[0];

  // Cluster the destination block (days 1..destDays).
  const destClustered = clusterPlacesByDay(destPlacesInput, destDays).map((p) => ({ ...p, regionKey: 'dest' }));

  const layout = [{
    key: 'dest', kind: 'dest', label: destinationName || 'Main area',
    dayStart: 1, dayEnd: destDays, places: destClustered, centroid: destCentroid, framingKm: 0,
  }];

  // Lay out each kept out-group as a contiguous block AFTER the destination.
  let cursor = destDays;
  const allOut = [];
  keptOutGroups.forEach((g, gi) => {
    const groupDays = keptAlloc[gi + 1];
    const key = `out-${gi}`;
    // Cluster within the group (small N) using the same clusterer, then offset
    // its 1..groupDays numbering to sit after the destination + prior groups.
    const clustered = clusterPlacesByDay(g.places, groupDays).map((p) => ({
      ...p, day: p.day + cursor, regionKey: key,
    }));
    const km = destCentroid ? Math.round(haversineKm(destCentroid.lat, destCentroid.lng, g.centroid.lat, g.centroid.lng)) : 0;
    layout.push({
      key, kind: 'out', label: null, dayStart: cursor + 1, dayEnd: cursor + groupDays,
      places: clustered, centroid: g.centroid, framingKm: km,
    });
    allOut.push(...clustered);
    cursor += groupDays;
  });

  return { places: [...destClustered, ...allOut], layout };
}

/* Total path distance in km, for evaluating 2-opt swaps */
export function pathDistanceKm(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += haversineKm(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng);
  }
  return total;
}

/* 2-opt local search: repeatedly reverses any segment of the route that
   shortens total distance, until no improving swap is left. Cleans up the
   self-crossing paths nearest-neighbour construction is prone to. Cheap at
   day-sized N (≤10 stops), so it's fine to run to convergence. */
export function twoOptImprove(path, maxPasses = 25) {
  if (path.length < 4) return path; // need 4+ points for a swap to matter
  let best = path;
  let improved = true;
  let passes = 0;
  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const a = best[i - 1], b = best[i], c = best[j], d = best[j + 1];
        const before = haversineKm(a.lat, a.lng, b.lat, b.lng) + haversineKm(c.lat, c.lng, d.lat, d.lng);
        const after = haversineKm(a.lat, a.lng, c.lat, c.lng) + haversineKm(b.lat, b.lng, d.lat, d.lng);
        if (after + 1e-9 < before) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

/*
 * Within a single day, order stops via nearest-neighbour construction, then
 * clean up with 2-opt so the path doesn't cross itself. Places without
 * coordinates (custom additions) are appended at the end since we have no
 * way to place them geographically.
 */
export function orderStopsWithinDay(dayPlaces) {
  const withCoords = dayPlaces.filter((p) => isValidCoord(p.lat) && isValidCoord(p.lng));
  const withoutCoords = dayPlaces.filter((p) => !(isValidCoord(p.lat) && isValidCoord(p.lng)));
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const remaining = withCoords.map((p) => ({ ...p, lat: toNum(p.lat), lng: toNum(p.lng) }));
  const path = [remaining.shift()];
  while (remaining.length) {
    const last = path[path.length - 1];
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineKm(last.lat, last.lng, p.lat, p.lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    path.push(remaining.splice(bestIdx, 1)[0]);
  }
  const optimized = twoOptImprove(path);
  return [...optimized, ...withoutCoords];
}

/* Orders every chosen place by day, then geographically within each day */
export function sequencePlaces(places, dayCount) {
  const ordered = [];
  for (let day = 1; day <= dayCount; day++) {
    const dayPlaces = places.filter((p) => Number(p.day) === day);
    ordered.push(...orderStopsWithinDay(dayPlaces));
  }
  // Any place with no day at all (shouldn't normally happen) goes last
  ordered.push(...places.filter((p) => !p.day));
  return ordered;
}

/* Custom places (added free-text in PlacePicker) have no day — drop each
   into whichever day currently has the fewest stops, so Stage 4 still gets
   a complete day assignment for every place. */
export function assignMissingDays(places, dayCount) {
  const counts = new Array(dayCount + 1).fill(0);
  places.forEach((p) => { if (p.day) counts[p.day] = (counts[p.day] || 0) + 1; });
  return places.map((p) => {
    if (p.day) return p;
    let minDay = 1, minCount = Infinity;
    for (let d = 1; d <= dayCount; d++) {
      if ((counts[d] || 0) < minCount) { minCount = counts[d] || 0; minDay = d; }
    }
    counts[minDay] = (counts[minDay] || 0) + 1;
    return { ...p, day: minDay };
  });
}

/* Categories treated as "strenuous/outdoor" for day-archetype purposes —
   not a fit for the arrival day (low energy, luggage likely still with the
   traveller) or the departure day (checkout has usually happened, so the
   traveller is luggage-bound and time-boxed toward the airport). */
export const OUTDOOR_STRENUOUS_TYPES = ['nature', 'sports'];

/*
 * Swaps outdoor/strenuous-type places off the arrival day and the
 * departure day and onto a middle day, geography permitting. Runs after
 * day-clustering/day-assignment, before within-day sequencing, so the
 * later geographic ordering (2-opt etc.) still applies to the corrected
 * day assignments rather than fighting them. Picks the geographically
 * closest eligible swap partner on a middle day to minimize disruption to
 * cluster tightness — this is a targeted correction, not a re-cluster.
 * No-op on 1-day trips (no "middle day" exists to swap into).
 */
export function applyDayArchetypeSwaps(places, dayCount) {
  if (dayCount < 2) return places;
  const arrivalDay = 1;
  const departureDay = dayCount;
  const sensitiveDays = dayCount >= 3 ? [arrivalDay, departureDay] : [departureDay];
  const middleDays = Array.from({ length: dayCount }, (_, i) => i + 1)
    .filter((d) => !sensitiveDays.includes(d));
  if (middleDays.length === 0) return places;

  const result = [...places];
  result.forEach((p, i) => {
    if (!sensitiveDays.includes(Number(p.day))) return;
    if (!OUTDOOR_STRENUOUS_TYPES.includes(p.type)) return;

    let bestIdx = -1, bestDist = Infinity;
    result.forEach((q, j) => {
      if (i === j) return;
      if (!middleDays.includes(Number(q.day))) return;
      if (OUTDOOR_STRENUOUS_TYPES.includes(q.type)) return;
      if (!isValidCoord(p.lat) || !isValidCoord(p.lng) || !isValidCoord(q.lat) || !isValidCoord(q.lng)) {
        if (bestIdx === -1) bestIdx = j; // no coords to rank by — still a valid swap partner
        return;
      }
      const d = haversineKm(toNum(p.lat), toNum(p.lng), toNum(q.lat), toNum(q.lng));
      if (d < bestDist) { bestDist = d; bestIdx = j; }
    });

    if (bestIdx !== -1) {
      const pDay = result[i].day;
      const qDay = result[bestIdx].day;
      result[i] = { ...result[i], day: qDay };
      result[bestIdx] = { ...result[bestIdx], day: pDay };
    }
  });

  return result;
}

/* Crude but grounded mode/time estimate — replace the body of this
   function with a real OSRM/OpenRouteService/transit-routing call when
   that lands; every caller already treats taxiMins/transitMins as ground
   truth, so the swap is a one-function change. transitMins is padded over
   taxiMins to account for station/stop access, waiting, and a likely
   transfer — a flat approximation until a real transit API is wired in. */
export function estimateTravelMinutes(km) {
  if (km <= 1.2) {
    return { mode: 'walk', mins: Math.max(2, Math.round((km / 4.5) * 60)) };
  }
  const taxiMins = Math.max(5, Math.round((km / 22) * 60));
  const transitMins = taxiMins + 12;
  return { mode: 'transit', taxiMins, transitMins };
}

/* Computes travel time only between consecutive same-day stops — the gap
   between the last stop of one day and the first of the next isn't a
   walkable/single-trip segment worth quoting a number for. */
export function buildTravelSegments(orderedPlaces) {
  const segments = [];
  for (let i = 0; i < orderedPlaces.length - 1; i++) {
    const a = orderedPlaces[i], b = orderedPlaces[i + 1];
    if (a.day !== b.day) continue;
    if (!isValidCoord(a.lat) || !isValidCoord(a.lng) || !isValidCoord(b.lat) || !isValidCoord(b.lng)) continue;
    const km = haversineKm(toNum(a.lat), toNum(a.lng), toNum(b.lat), toNum(b.lng));
    const est = estimateTravelMinutes(km);
    if (est.mode === 'walk') {
      segments.push({ day: a.day, from: a.name, to: b.name, km: Math.round(km * 10) / 10, mode: 'walk', mins: est.mins });
    } else {
      segments.push({ day: a.day, from: a.name, to: b.name, km: Math.round(km * 10) / 10, mode: 'transit', taxiMins: est.taxiMins, transitMins: est.transitMins });
    }
  }
  return segments;
}

/* ────────────────────────────────────────────────────────────────────────
   Salvage JSON parsers — tolerate truncated / fenced model output.
   Lifted verbatim from Itinerary.js (were component-scoped closures).
   ──────────────────────────────────────────────────────────────────────── */

export function parsePlacesJSON(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  // Fast path: well-formed array.
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through to salvage */ }

  // Salvage path: the response may be truncated (array never closed) if the
  // model ran long. Rather than fail the whole trip, pull out every complete
  // top-level object and keep them — a partial list beats an error screen.
  const start = cleaned.indexOf('[');
  if (start === -1) return [];
  const body = cleaned.slice(start + 1);
  const objects = [];
  let depth = 0, inStr = false, esc = false, buf = '';
  for (const ch of body) {
    if (esc) { buf += ch; esc = false; continue; }
    if (ch === '\\') { buf += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; buf += ch; continue; }
    if (inStr) { buf += ch; continue; }
    if (ch === '{') { if (depth === 0) buf = ''; depth++; buf += ch; continue; }
    if (ch === '}') {
      depth--;
      buf += ch;
      if (depth === 0) {
        try { objects.push(JSON.parse(buf)); } catch { /* skip malformed */ }
        buf = '';
      }
      continue;
    }
    if (depth > 0) buf += ch;
  }
  return objects;
}

export function parseEnrichmentJSON(text) {
  const cleaned = (text || '').replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* fall through to salvage */ }
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false, buf = '';
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { buf += ch; esc = false; continue; }
    if (ch === '\\') { buf += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; buf += ch; continue; }
    if (inStr) { buf += ch; continue; }
    if (ch === '{') { depth++; buf += ch; continue; }
    if (ch === '}') {
      depth--; buf += ch;
      if (depth === 0) { try { return JSON.parse(buf); } catch { return null; } }
      continue;
    }
    if (depth > 0) buf += ch;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   Prompt builders — the three Claude stages, as PURE functions.

   Refactored from the inline prompt assembly inside Itinerary.js's
   handleFetchPlaces / runEnrichment / buildItineraryFromPlaces. The template
   strings are reproduced BYTE-FOR-BYTE; only the variable *source* changed:
   component state (destination, interests, dates, …) is now read off an
   `inputs` object passed in. Callers (frontend + server) build `inputs` from
   the gather-format and pass the returned prompt string to their own Claude
   transport (proxy on the frontend, server-side key on the backend).

   `cats` is passed in already-resolved (id→title joined) so the engine never
   needs the UI-only CATEGORIES/UNIQUE_CATS constants — those stay in
   Itinerary.js as picker render data.
   ──────────────────────────────────────────────────────────────────────── */

/*
 * Stage 1 — place research prompt.
 * inputs: { destination, cats, dayCount, requestedCount, targetCount,
 *           mustSeeList, accommodation, noAccommodation,
 *           arrivalTime, departureTime, dates:{from,to}, experience }
 */
export function buildPlacesPrompt(inputs) {
  const {
    destination, cats, dayCount, requestedCount, targetCount,
    mustSeeList = [], accommodation, noAccommodation,
    arrivalTime, departureTime, dates = {}, experience = '',
  } = inputs;

  const accomLine = noAccommodation
    ? 'Accommodation not yet booked — feel free to suggest a well-located area to stay.'
    : accommodation ? `Staying at: ${accommodation}.` : '';
  const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime}.` : '';
  const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime}.` : '';
  const mustSeeLine = mustSeeList.length
    ? `The traveller has specifically asked to include these places — you MUST include every one of them in the JSON output, with accurate real coordinates, "source":"user_specified" and "tier":"core": ${mustSeeList.join(', ')}.`
    : '';
  const experienceText = (experience || '').trim();
  const experienceLine = experienceText
    ? `In the traveller's own words, here's the kind of trip they want — treat this as strong steering for WHICH specific places you pick and which you leave out (favour places that fit it, skip ones that clash), on top of the interest categories above: "${experienceText}".`
    : '';

  return `Recommend exactly ${targetCount} specific real places for a ${dayCount}-day trip to ${destination}, matching: ${cats || 'general sightseeing'}. The traveller plans roughly ${requestedCount} activities total at their selected pace — return more than that as bonus options (see tier rule below).
${arrivalLine}
${departureLine}
${accomLine}
${experienceLine}
${mustSeeLine}

Respond with ONLY a valid JSON array, no markdown fences, no prose. Keep every field tight — the whole array must fit in one response, so brevity matters. Each object:
{"id":"slug","name":"Place name","type":"category","description":"max 15 words","whyVisit":"max 20 words on what makes it worth a stop","bestTime":"max 6 words, e.g. 'Early morning, before crowds'","duration":"a range, e.g. '1–2 hours'","trust":"michelin|unesco|tourism|tripadvisor|gem|ai","lat":number,"lng":number,"tier":"core|optional","dateUncertain":boolean}

Stay within those word caps. "whyVisit", "bestTime", and "duration" are the richer detail a traveller reads before deciding — keep each concise and specific to THIS place (no generic filler like "a must-see for everyone"). "duration" is a rough guide only; never phrase it as an instruction.

Use real, accurate coordinates for each place — this matters more than usual, since we group places into days by their coordinates afterward, not by anything you decide. "michelin" only for actual Michelin recognition, "unesco" only for actual World Heritage sites, "tourism" for official board picks, "tripadvisor" for known traveller favorites, "gem" for genuine local spots, "ai" as fallback. Favor a spatially varied set across ${destination} over clustering everything in one neighborhood, so the whole trip has enough ground to work with once we group it geographically.

Mark roughly the first ${requestedCount} places as "tier":"core" (matching what the traveller asked for) and the rest as "tier":"optional" — bonus suggestions they can choose to add or skip. Across the full set, include at least ${dayCount * 3} genuine food/dining places and at least ${dayCount * 2} points of interest beyond food, so every day has real choice once places are grouped geographically — do not limit yourself to exactly the requested pace only.

Do not include a place whose subject is a transit network, station-as-generic-concept, or mode of transport itself (e.g. "MRT Network", "City Bus System", "The Subway") — these are not destinations. If "Getting Around" is one of the traveller's interests, leave it out of this JSON array entirely; it's handled separately as travel tips, not a place card.

Set "dateUncertain": true for any seasonal or limited-run event/exhibit you are not fully confident falls within the traveller's exact trip dates; otherwise omit it or set it false. Never assert a specific date you're not confident about.`;
}

/*
 * Stage 2 — enrichment prompt. Builds the per-region payload from the ordered
 * regions (deriveRegions + orderRegions, imported from ./regions) and the
 * places. Pure: takes destination + places, returns { prompt, regions } so the
 * caller can reuse the same region ordering when applying the parsed result.
 */
export function buildEnrichmentPrompt(destination, places) {
  const regions = orderRegions(deriveRegions(places));
  if (regions.length === 0) return { prompt: null, regions: [] };

  // Compact per-region payload: name-hint (day range), its places, and the
  // ordered region list so the model can offer hedged inter-region hints.
  const regionBlocks = regions.map((r) => {
    const rp = places
      .filter((p) => r.days.includes(Number(p.day)))
      .map((p) => `    - id:${p.id} | ${p.name} (${p.type}, Day ${p.day})${p.whyVisit ? ` — ${p.whyVisit}` : ''}`)
      .join('\n');
    return `Region ${r.key} (Days ${r.days.join(', ')}):\n${rp}`;
  }).join('\n\n');

  const regionOrderLine = regions.map((r) => r.key).join(' → ');

  const prompt = `You are enriching a ${destination} travel itinerary that has already been organised into geographic regions. For EACH region below, provide local dining and lodging guidance and, where applicable, ticket prices — as STRICT JSON only.

Regions (in travel order: ${regionOrderLine}):

${regionBlocks}

Return ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{
  "regions": [
    {
      "key": "<the region key exactly as given, e.g. d1-3>",
      "name": "<a short human region name you infer, e.g. Central Tokyo or Mount Fuji>",
      "eat": ["<2-3 specific dishes or food spots to seek out in this region>"],
      "stay": "<one short line: the best area/neighbourhood to base yourself in this region>",
      "gettingHere": "<for regions AFTER the first: ONE hedged line on getting here from the previous region — general mode + rough duration only, phrased as guidance to verify. For the first region use null.>",
      "places": [
        { "id": "<place id exactly as given>", "isPaidAttraction": <true|false>, "price": "<e.g. ¥1000 / SGD 12, or null>" }
      ]
    }
  ]
}

CRITICAL rules:
- PRICE GATING: set isPaidAttraction:true and give a price ONLY when the place is a well-known, fixed-fee ticketed venue — a park gate, cable car, scenic-area ticket, or museum admission whose price is genuinely established. For restaurants, streets, markets, viewpoints, free temples/shrines, or anything whose fee you are not confident about, set isPaidAttraction:false and price:null. Never guess a price. When unsure, isPaidAttraction:false.
- gettingHere: NEVER name a specific train line, service, platform, or fare, and NEVER quote a schedule. Give only a general mode (train/bus/car) and a rough duration, phrased so the traveller knows to verify (e.g. "usually reached by train, about 2 hours — check current schedules"). Null for the first region.
- Include every place id given for a region in that region's "places" array.
- Output valid JSON only — no commentary, no code fences.`;

  return { prompt, regions };
}

/*
 * Stage 3 — prose itinerary prompt.
 * inputs: { destination, dayCount, dates:{from,to}, travelers, budget,
 *           accommodation, noAccommodation, arrivalTime, departureTime,
 *           experience }
 * orderedPlaces: the fully sequenced places (with .day).
 * Returns the prompt string; the caller owns the fetch + continuation loop.
 */
export function buildProsePrompt(orderedPlaces, inputs) {
  const {
    destination, dayCount, dates = {}, travelers, budget,
    accommodation, noAccommodation, arrivalTime, departureTime, experience = '',
  } = inputs;

  const travelSegments = buildTravelSegments(orderedPlaces);

  const placesList = orderedPlaces.map((p) => {
    const dateNote = p.dateUncertain ? ' — date not confirmed, describe generally rather than asserting an exact date' : '';
    const sourceNote = p.source === 'user_specified' ? ' — traveller specifically requested this place' : '';
    return `- ${p.name} (${p.type}, Day ${p.day})${dateNote}${sourceNote}`;
  }).join('\n');

  const segmentLines = travelSegments.length
    ? travelSegments.map((s) =>
        s.mode === 'walk'
          ? `Day ${s.day}: "${s.from}" → "${s.to}": ${s.mins} min walk`
          : `Day ${s.day}: "${s.from}" → "${s.to}": ~${s.taxiMins} min by taxi/rideshare, or ~${s.transitMins} min by public transit (MRT/bus, includes station access, waiting, and any transfers)`
      ).join('\n')
    : '(No coordinate-based segments available — use your judgement sparingly and keep timing vague, e.g. "a short trip".)';
  const accomLine = noAccommodation
    ? 'Accommodation is not yet booked — suggest a well-located area to stay and factor in flexible timing for Day 1.'
    : accommodation ? `Staying at: ${accommodation}. Factor travel time to/from this location into the schedule.` : '';
  const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime} — Day 1 should start realistically after arrival, factoring in immigration, baggage, and transit to accommodation.` : '';
  const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime} — the final day should end with enough buffer time to reach the airport/departure point.` : '';
  const dayArchetypeLine = dayCount >= 2
    ? `Day 1 is the arrival day — keep the tone and any supplementary tips low-key, easing the traveller in. Day ${dayCount} is the departure day — assume standard hotel checkout around 11:00–12:00 and that the traveller is carrying or has stored their luggage until they leave for the airport; keep tips for this day calm and logistics-aware, and do not suggest or add any strenuous, muddy, or far-flung outdoor activity for it even in passing.`
    : '';
  const experienceText = (experience || '').trim();
  const experienceToneLine = experienceText
    ? `The traveller described the trip they want in their own words: "${experienceText}". Keep the tone, framing, and any tips aligned with this — but do NOT add places beyond the list above to satisfy it.`
    : '';

  return `You are a travel guide creating a detailed day-by-day itinerary for ${destination}.
Trip length: ${dayCount} days (${dates.from || 'flexible'} to ${dates.to || 'flexible'}). Travelers: ${travelers}. Budget: ${budget}.
${arrivalLine}
${departureLine}
${accomLine}
${experienceToneLine}
${dayArchetypeLine}

Build the itinerary using ONLY these places, in this exact order within each day — they've already been sequenced geographically to minimize backtracking, so do not reorder them:
${placesList}

Pre-calculated travel times between consecutive same-day stops (these come from real coordinates — use these exact numbers, do not estimate your own):
${segmentLines}

Format with clear day headings (e.g. "## Day 1"), morning/afternoon/evening structure, and a short "Before You Go" tips section at the top. Keep it well-organized and practical. Do not invent additional must-see places beyond the list above, but you may add brief transport tips between stops.

IMPORTANT phrasing rule for timing: do NOT suggest how long the traveller should spend at each location — let them decide that for themselves. Only mention timing when referring to travel time between consecutive stops, using ONLY the pre-calculated numbers given above:
- If a segment is a walk, phrase it as "🚶 Travel time to next stop: ~X mins (walk)".
- If a segment gives both a taxi and a transit number, phrase it as something like "🚕 ~X mins by taxi, or 🚇 ~Y mins by public transit (MRT/bus)" — you may mention that a public bus is a realistic alternative to the MRT when it plausibly serves that route, but do not invent a different number for it; always use the given transit number.
- If a transition isn't listed above, write "Travel time to next stop: plan for local transit" instead of guessing a number.
Never write a bare "Allow X mins" or suggest a dwell duration at a location.`;
}

/* ────────────────────────────────────────────────────────────────────────
   assembleItinerary — pure orchestration (NEW, refactored from
   handleBuildItinerary's body in Itinerary.js).

   This is the ONE piece here that is not a verbatim lift: it's the geocode →
   partition → dropped-group prune → archetype-swap → sequence chain, extracted
   so BOTH sides run it identically. All the React-only bits from the original
   (setFinalPlaces / setRegionLayout / setStep / window.__* / setPlanDirty /
   setMessages) are REMOVED — this returns the computed result and the caller
   does whatever it wants with it (frontend: pushes into state; server: saves a
   draft). Behaviour of the computation itself is unchanged from the original.

   Params:
     chosenPlaces  — research picks + any custom adds
     dayCount      — trip length
     destination   — destination name (for geocoding + labels)
     droppedGroups — a Set of out-group keys the user dropped in review
                     (frontend passes its live Set; server passes an empty Set)
   Returns: { orderedPlaces, layout, bounds }
   Async because it geocodes (geocodeCustomAdds + fetchDestinationBounds).
   ──────────────────────────────────────────────────────────────────────── */
export async function assembleItinerary({ chosenPlaces, dayCount, destination, droppedGroups = new Set() }) {
  // "Add your own" places arrive with null coordinates. Geocode them now
  // (sequential, fail-open) so a distant one has real coordinates and is
  // partitioned into the correct region-block, not wedged into a dest day.
  const geocoded = await geocodeCustomAdds(chosenPlaces, destination);

  // Fetch the destination bounds once (fail-open: null ⇒ single dest block).
  const bounds = await fetchDestinationBounds(destination);
  let { places: partitioned, layout } = partitionAndClusterByDay(geocoded, dayCount, bounds, destination);

  // Honour any out-of-town groups dropped in review: remove their places and
  // re-partition so freed days return to the destination.
  if (droppedGroups && droppedGroups.size > 0) {
    const droppedPlaceIds = new Set();
    layout.forEach((b) => { if (b.kind === 'out' && droppedGroups.has(b.key)) b.places.forEach((p) => droppedPlaceIds.add(p.id)); });
    if (droppedPlaceIds.size > 0) {
      const kept = geocoded.filter((p) => !droppedPlaceIds.has(p.id));
      ({ places: partitioned, layout } = partitionAndClusterByDay(kept, dayCount, bounds, destination));
    }
  }

  // Archetype swaps (arrival/departure easing) apply WITHIN the destination
  // block only — never move a far stop onto a destination day or vice-versa.
  const destDays = layout.find((b) => b.kind === 'dest');
  const destDayEnd = destDays ? destDays.dayEnd : dayCount;
  const destPart = partitioned.filter((p) => p.regionKey === 'dest');
  const outPart = partitioned.filter((p) => p.regionKey !== 'dest');
  const destAdjusted = applyDayArchetypeSwaps(destPart, destDayEnd);

  // Sequence within every day (both blocks); regionKey + day are preserved.
  const orderedPlaces = sequencePlaces([...destAdjusted, ...outPart], dayCount);

  return { orderedPlaces, layout, bounds };
}
