import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import PlacePicker from '../components/PlacePicker';
import ItineraryMap from '../components/ItineraryMap';
import styles from './Itinerary.module.css';

const CATEGORIES = [
  { id: 'food',      emoji: '🍜', title: 'Food & Dining',        desc: 'Restaurants, cafes, street food' },
  { id: 'shopping',  emoji: '🏬', title: 'Shopping Malls',       desc: 'Major malls and retail centres' },
  { id: 'specialty', emoji: '🛍️', title: 'Specialty Shops',      desc: 'Local markets, boutiques, artisan shops' },
  { id: 'places',    emoji: '🏛️', title: 'Places of Interest',   desc: 'Landmarks, museums, heritage sites' },
  { id: 'nature',    emoji: '🌿', title: 'Nature & Parks',       desc: 'Parks, gardens, scenic spots' },
  { id: 'culture',   emoji: '🎭', title: 'Culture & Arts',       desc: 'Galleries, theatres, cultural centres' },
  { id: 'nightlife', emoji: '🌙', title: 'Nightlife',            desc: 'Bars, clubs, night markets' },
  { id: 'wellness',  emoji: '💆', title: 'Wellness & Spas',      desc: 'Spas, massage, wellness centres' },
  { id: 'sports',    emoji: '🏄', title: 'Sports & Activities',  desc: 'Adventure, sports venues' },
  { id: 'transport', emoji: '🚇', title: 'Getting Around',       desc: 'Key transport tips and hubs' },
];

const UNIQUE_CATS = [
  { id: 'gems',      emoji: '💎', title: 'Hidden Local Gems',    desc: 'Spots the guidebooks miss' },
  { id: 'seasonal',  emoji: '🎏', title: 'Seasonal & Events',    desc: "What's on while you're there" },
  { id: 'foodcrawl', emoji: '🥢', title: 'Local Food Crawls',    desc: 'Curated tastings, market to table' },
];

const PROXY_URL = 'https://claude-proxy.kairosventure-io.workers.dev/';

/* ────────────────────────────────────────────────────────────────────────
   Geo helpers — day-clustering, within-day sequencing, travel-time calc.
   None of this depends on Claude's output; it runs entirely on the lat/lng
   already attached to each place, so it's deterministic and reliable.
   ──────────────────────────────────────────────────────────────────────── */

function toNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n;
}

function isValidCoord(v) {
  const n = toNum(v);
  return typeof n === 'number' && !isNaN(n) && n !== 0;
}

/* Great-circle distance in km */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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
async function fetchDestinationBounds(destination) {
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

/*
 * Strips coordinates from any place whose lat/lng falls outside the
 * destination's real bounding box (plus a small buffer for edge rounding).
 * Places that lose their coordinates this way fall into the existing
 * "no usable coordinate" handling everywhere downstream (round-robin day
 * assignment, skipped on the map, skipped in travel-time segments) instead
 * of getting force-fit into a cluster and dragging it across a border.
 * No-op if bounds couldn't be fetched — fails open rather than blocking.
 */
function stripOutOfBoundsCoords(places, bounds) {
  if (!bounds) return places;
  const buffer = 0.05; // ~5km — generous for edge rounding, tight enough to still catch cross-border hallucinations
  return places.map((p) => {
    if (!isValidCoord(p.lat) || !isValidCoord(p.lng)) return p;
    const lat = toNum(p.lat), lng = toNum(p.lng);
    const inBounds =
      lat >= bounds.south - buffer && lat <= bounds.north + buffer &&
      lng >= bounds.west - buffer && lng <= bounds.east + buffer;
    if (inBounds) return { ...p, lat, lng };
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
function stripTransitNetworkPlaces(places) {
  return places.filter((p) => p.type !== 'transport');
}

/* Looks up a single named place via Nominatim — used only as a fallback
   when a traveller's explicitly-requested place doesn't come back in
   Claude's Stage 3 JSON, so it can still be force-added with real
   coordinates rather than silently dropped. */
async function geocodePlace(placeName, destination) {
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
 * Guarantees every place the traveller explicitly typed in Stage 1 ends up
 * in the final list, even if Claude's Stage 3 output dropped it. Does a
 * loose name-match first (Claude may have returned it with slightly
 * different phrasing); only geocodes and force-adds if genuinely missing.
 * Runs sequentially (not Promise.all) since it's a handful of places at
 * most and keeps Nominatim usage one-request-at-a-time.
 */
async function ensureMustSeePlaces(places, mustSeeList, destination) {
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
function clusterPlacesByDay(places, dayCount) {
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

/* Total path distance in km, for evaluating 2-opt swaps */
function pathDistanceKm(path) {
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
function twoOptImprove(path, maxPasses = 25) {
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
function orderStopsWithinDay(dayPlaces) {
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
function sequencePlaces(places, dayCount) {
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
function assignMissingDays(places, dayCount) {
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
const OUTDOOR_STRENUOUS_TYPES = ['nature', 'sports'];

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
function applyDayArchetypeSwaps(places, dayCount) {
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
function estimateTravelMinutes(km) {
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
function buildTravelSegments(orderedPlaces) {
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

/* Lightweight markdown renderer for chat bubbles — headers, bold, rules, blockquotes, lists */
function renderMarkdown(text) {
  const lines = text.split('\n');
  const blocks = [];
  let listBuffer = [];

  function flushList() {
    if (listBuffer.length > 0) {
      blocks.push(<ul key={`list-${blocks.length}`} className="md-list">{listBuffer}</ul>);
      listBuffer = [];
    }
  }

  function renderInline(str, key) {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>
    );
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushList();
      return; // collapse blank lines instead of stacking <br>
    }
    if (/^---+$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={idx} className="md-rule" />);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      blocks.push(<h3 key={idx} className="md-h3">{renderInline(trimmed.slice(3), idx)}</h3>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      blocks.push(<h2 key={idx} className="md-h2">{renderInline(trimmed.slice(2), idx)}</h2>);
      return;
    }
    if (trimmed.startsWith('> ')) {
      flushList();
      blocks.push(<blockquote key={idx} className="md-quote">{renderInline(trimmed.slice(2), idx)}</blockquote>);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      listBuffer.push(<li key={idx}>{renderInline(trimmed.replace(/^[-*]\s+/, ''), idx)}</li>);
      return;
    }
    flushList();
    blocks.push(<p key={idx} className="md-p">{renderInline(trimmed, idx)}</p>);
  });

  flushList();
  return blocks;
}

export default function Itinerary() {
  const [step, setStep] = useState(1); // 1=details, 2=interests, 3=place picker, 4=itinerary+map
  const [destination, setDestination] = useState('');
  const [dates, setDates] = useState({ from: '', to: '' });
  const [arrivalTime, setArrivalTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [noAccommodation, setNoAccommodation] = useState(false);
  const [travelers, setTravelers] = useState(1);
  const [budget, setBudget] = useState('moderate');
  const [perDayCount, setPerDayCount] = useState(3);
  const [interests, setInterests] = useState(['food', 'places']);
  const [mustSee, setMustSee] = useState('');

  const [recommendedPlaces, setRecommendedPlaces] = useState([]);
  const [finalPlaces, setFinalPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');

  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [user, setUser] = useState(null);
  const chatRef = useRef(null);
  const { lang } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const savedId = searchParams.get('saved');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (savedId && session?.user) loadSavedItinerary(savedId);
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function toggleInterest(id) {
    setInterests((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function tripDayCount() {
    if (!dates.from || !dates.to) return 3;
    const d1 = new Date(dates.from);
    const d2 = new Date(dates.to);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 3;
  }

  /* ── Stage 2 → 3: fetch recommended places ── */
  async function handleFetchPlaces() {
    if (!destination.trim()) return;
    setPlacesError('');
    setPlacesLoading(true);
    setStep(3);

    const cats = interests.map((id) => [...CATEGORIES, ...UNIQUE_CATS].find((c) => c.id === id)?.title).filter(Boolean).join(', ');
    const dayCount = tripDayCount();
    // requestedCount is what the traveller asked for via "Activities per day";
    // targetCount deliberately overproduces (~40% more) so PlacePicker has
    // real optional suggestions to offer rather than exactly enough to fill
    // the requested pace and nothing more.
    const requestedCount = dayCount * perDayCount;
    const targetCount = Math.min(45, Math.max(10, Math.round(requestedCount * 1.4)));
    const mustSeeList = mustSee.split(',').map((s) => s.trim()).filter(Boolean);
    const accomLine = noAccommodation
      ? 'Accommodation not yet booked — feel free to suggest a well-located area to stay.'
      : accommodation ? `Staying at: ${accommodation}.` : '';
    const arrivalLine = arrivalTime ? `Arrival: ${dates.from} at ${arrivalTime}.` : '';
    const departureLine = departureTime ? `Departure: ${dates.to} at ${departureTime}.` : '';
    const mustSeeLine = mustSeeList.length
      ? `The traveller has specifically asked to include these places — you MUST include every one of them in the JSON output, with accurate real coordinates, "source":"user_specified" and "tier":"core": ${mustSeeList.join(', ')}.`
      : '';

    const prompt = `Recommend exactly ${targetCount} specific real places for a ${dayCount}-day trip to ${destination}, matching: ${cats || 'general sightseeing'}. The traveller plans roughly ${requestedCount} activities total at their selected pace — return more than that as bonus options (see tier rule below).
${arrivalLine}
${departureLine}
${accomLine}
${mustSeeLine}

Respond with ONLY a valid JSON array, no markdown fences, no prose. Each object:
{"id":"slug","name":"Place name","type":"category","description":"max 20 words","trust":"michelin|unesco|tourism|tripadvisor|gem|ai","lat":number,"lng":number,"tier":"core|optional","dateUncertain":boolean}

Use real, accurate coordinates for each place — this matters more than usual, since we group places into days by their coordinates afterward, not by anything you decide. "michelin" only for actual Michelin recognition, "unesco" only for actual World Heritage sites, "tourism" for official board picks, "tripadvisor" for known traveller favorites, "gem" for genuine local spots, "ai" as fallback. Favor a spatially varied set across ${destination} over clustering everything in one neighborhood, so the whole trip has enough ground to work with once we group it geographically.

Mark roughly the first ${requestedCount} places as "tier":"core" (matching what the traveller asked for) and the rest as "tier":"optional" — bonus suggestions they can choose to add or skip. Across the full set, include at least ${dayCount * 3} genuine food/dining places and at least ${dayCount * 2} points of interest beyond food, so every day has real choice once places are grouped geographically — do not limit yourself to exactly the requested pace only.

Do not include a place whose subject is a transit network, station-as-generic-concept, or mode of transport itself (e.g. "MRT Network", "City Bus System", "The Subway") — these are not destinations. If "Getting Around" is one of the traveller's interests, leave it out of this JSON array entirely; it's handled separately as travel tips, not a place card.

Set "dateUncertain": true for any seasonal or limited-run event/exhibit you are not fully confident falls within the traveller's exact trip dates; otherwise omit it or set it false. Never assert a specific date you're not confident about.`;

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3200, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = parsePlacesJSON(text);
      if (parsed.length === 0) throw new Error('No places returned');

      // Backfill tier/source for anything Claude omitted, so downstream
      // code can always rely on these fields being present.
      const normalized = parsed.map((p, i) => ({
        ...p,
        source: p.source || 'ai',
        tier: p.tier || (i < requestedCount ? 'core' : 'optional'),
      }));
      // Code-level backstop for the "MRT as a place" problem — the prompt
      // already asks Claude to omit these, this just catches it if not.
      const noTransitPlaces = stripTransitNetworkPlaces(normalized);

      // Catch coordinate hallucinations against the destination's real
      // borders before they can drag a cluster across a country (see
      // fetchDestinationBounds / stripOutOfBoundsCoords).
      const bounds = await fetchDestinationBounds(destination);
      const sanitized = stripOutOfBoundsCoords(noTransitPlaces, bounds);

      // Guarantee every traveller-named place survives, even if Claude
      // dropped it — force-add with a fallback geocode if genuinely missing.
      const withMustSee = await ensureMustSeePlaces(sanitized, mustSeeList, destination);

      // Day assignment is computed here, from the coordinates Claude returned —
      // not trusted from anything Claude said about "day" (see clusterPlacesByDay).
      const clustered = clusterPlacesByDay(withMustSee, dayCount);
      console.log('[Juzgo debug] Parsed places:', parsed);
      console.log('[Juzgo debug] Destination bounds:', bounds);
      console.log('[Juzgo debug] Must-see check:', mustSeeList.map((name) => ({
        name, included: withMustSee.some((p) => p.name?.toLowerCase().includes(name.toLowerCase())),
      })));
      console.log('[Juzgo debug] Clustered by day:', clustered);
      window.__lastPlaces = clustered;
      setRecommendedPlaces(clustered);
    } catch (err) {
      setPlacesError('We had trouble researching places for this destination. Please try again.');
    }
    setPlacesLoading(false);
  }

  function parsePlacesJSON(text) {
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { return []; }
      }
      return [];
    }
  }

  /* ── Stage 3 → 4: build itinerary from chosen places ── */
  async function handleBuildItinerary(chosenPlaces) {
    const dayCount = tripDayCount();

    // Custom (free-text) places from PlacePicker have no day yet — slot each
    // into the lightest day. Then sequence every day's stops geographically
    // (nearest-neighbour) and compute real travel times from that sequence,
    // rather than asking Claude to guess either.
    const withDays = assignMissingDays(chosenPlaces, dayCount);
    // Move any strenuous/outdoor places off the arrival and departure days
    // onto a middle day before sequencing — see applyDayArchetypeSwaps.
    const archetypeAdjusted = applyDayArchetypeSwaps(withDays, dayCount);
    const orderedPlaces = sequencePlaces(archetypeAdjusted, dayCount);
    const travelSegments = buildTravelSegments(orderedPlaces);

    setFinalPlaces(orderedPlaces);
    console.log('[Juzgo debug] Final places sent to map:', orderedPlaces);
    console.log('[Juzgo debug] Travel segments:', travelSegments);
    window.__finalPlaces = orderedPlaces;
    setStep(4);
    setItineraryLoading(true);

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

    const prompt = `You are a travel guide creating a detailed day-by-day itinerary for ${destination}.
Trip length: ${dayCount} days (${dates.from || 'flexible'} to ${dates.to || 'flexible'}). Travelers: ${travelers}. Budget: ${budget}.
${arrivalLine}
${departureLine}
${accomLine}
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

    setMessages([{ role: 'assistant', content: `Building your ${destination} itinerary…` }]);

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "Sorry, I couldn't generate your itinerary. Please try again.";
      setMessages([{ role: 'assistant', content: text }]);
    } catch {
      setMessages([{ role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    }
    setItineraryLoading(false);
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: history }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || 'Sorry, something went wrong.';
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  }

  const PENDING_KEY = 'juzgo_pending_itinerary';

  /* ── Load a saved itinerary by ID ── */
  async function loadSavedItinerary(id) {
    const { data, error } = await supabase
      .from('saved_itineraries')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return;
    setDestination(data.destination || '');
    setFinalPlaces(data.selected_places || []);
    setMessages([{ role: 'assistant', content: data.trip_data || '' }]);
    setStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Update an existing saved itinerary ── */
  async function updateSavedItinerary() {
    if (!savedId) { saveItinerary(); return; }
    const itinText = messages.find((m) => m.role === 'assistant' && m.content.length > 100)?.content || '';
    const { error } = await supabase
      .from('saved_itineraries')
      .update({ trip_data: itinText, selected_places: finalPlaces, created_at: new Date() })
      .eq('id', savedId);
    if (error) { alert(`Update failed: ${error.message}`); return; }
    alert('Itinerary updated!');
  }

  /* ── Share itinerary ── */
  async function shareItinerary() {
    const url = savedId
      ? `${window.location.origin}/itinerary?saved=${savedId}`
      : window.location.href;
    const title = `${destination} Itinerary — Juzgo`;
    const text = `Check out my ${destination} itinerary planned with Juzgo!`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  }

  async function saveItinerary() {
    const itinText = messages.find((m) => m.role === 'assistant' && m.content.length > 100)?.content || '';
    if (!user) {
      // Persist everything needed to resume after login/register
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        destination, content: itinText, step, finalPlaces, dates, travelers, budget,
      }));
      navigate('/login?redirect=itinerary');
      return;
    }
    const { error: saveErr } = await supabase.from('saved_itineraries').insert({ user_id: user.id, destination, trip_data: itinText, selected_places: finalPlaces, created_at: new Date() });
    if (saveErr) { alert(`Save failed: ${saveErr.message}`); return; }
    sessionStorage.removeItem(PENDING_KEY);
    alert('Itinerary saved!');
  }

  // Restore a pending itinerary (e.g. after returning from login/register) and auto-save once authenticated
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) return;
    try {
      const data = JSON.parse(pending);
      setDestination(data.destination || '');
      setFinalPlaces(data.finalPlaces || []);
      setDates(data.dates || { from: '', to: '' });
      setTravelers(data.travelers || 1);
      setBudget(data.budget || 'moderate');
      setMessages([{ role: 'assistant', content: data.content || '' }]);
      setStep(4);
      // Auto-save now that the user is logged in
      supabase.from('saved_itineraries').insert({
        user_id: user.id, destination: data.destination, trip_data: data.content, selected_places: [], created_at: new Date(),
      }).then(() => {
        sessionStorage.removeItem(PENDING_KEY);
        alert('Welcome back! Your itinerary has been saved.');
      });
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
    }
  }, [user]);

  function resetAll() {
    setStep(1);
    setMessages([]);
    setDestination('');
    setMustSee('');
    setRecommendedPlaces([]);
    setFinalPlaces([]);
  }

  const dayCount = tripDayCount();
  const dayNumbers = Array.from({ length: dayCount }, (_, i) => i + 1);

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        {/* ── Step 1: Trip details ── */}
        {step === 1 && (
          <div className={styles.stepWrap}>
            <div className={styles.eyebrow}>AI itinerary</div>
            <h1 className={styles.h1}>Plan My Itinerary</h1>
            <p className={styles.sub}>AI-powered travel plans — verified places, real addresses, optimised routes.</p>

            <div className={styles.formGrid}>
              <div className={styles.formCard}>
                <label className={styles.label}>Where are you going?</label>
                <input
                  type="text"
                  placeholder="e.g. Tokyo, Japan"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.hint}>
                  <span className={styles.hintLink} onClick={() => navigate('/plans')}>💬 Need data while you're there? Browse eSIM plans →</span>
                </p>

                <label className={styles.label}>Any must-see places already on your list? (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mandai Wildlife Reserve, Jurong Bird Park"
                  value={mustSee}
                  onChange={(e) => setMustSee(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.hint}>Separate multiple places with commas — we'll make sure these are included.</p>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Arrival date</label>
                    <input type="date" value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Arrival time</label>
                    <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={styles.input} />
                  </div>
                </div>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Departure date</label>
                    <input type="date" value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Departure time</label>
                    <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className={styles.input} />
                  </div>
                </div>

                <label className={styles.label}>Where are you staying?</label>
                <input
                  type="text"
                  placeholder="e.g. Marina Bay Sands, or a neighbourhood"
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                  className={styles.input}
                  disabled={noAccommodation}
                />
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={noAccommodation}
                    onChange={(e) => { setNoAccommodation(e.target.checked); if (e.target.checked) setAccommodation(''); }}
                    className={styles.checkboxInput}
                  />
                  <span>Nothing booked yet — suggest a good area to stay</span>
                </label>

                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.label}>Travellers</label>
                    <input type="number" min="1" max="20" value={travelers} onChange={(e) => setTravelers(e.target.value)} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Budget</label>
                    <select value={budget} onChange={(e) => setBudget(e.target.value)} className={styles.select}>
                      <option value="budget">Budget</option>
                      <option value="moderate">Moderate</option>
                      <option value="comfort">Comfortable</option>
                      <option value="luxury">Luxury</option>
                    </select>
                  </div>
                </div>

                <label className={styles.label}>Activities per day</label>
                <select value={perDayCount} onChange={(e) => setPerDayCount(parseInt(e.target.value, 10))} className={styles.select}>
                  <option value={2}>Relaxed — 2 per day</option>
                  <option value={3}>Balanced — 3 per day</option>
                  <option value={4}>Packed — 4 per day</option>
                  <option value={5}>Action-packed — 5 per day</option>
                </select>
                <p className={styles.hint} style={{ marginBottom: 18 }}>This helps us research the right number of places and pace your schedule realistically.</p>

                <button
                  className={styles.btnNext}
                  onClick={() => setStep(2)}
                  disabled={!destination.trim()}
                >
                  Personalise my trip →
                </button>
              </div>

              <div className={styles.featurePanel}>
                <h2 className={styles.featureH2}>A trip that<br /><em className={styles.featureEm}>plans itself.</em></h2>
                <ul className={styles.featureList}>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>Verified places and real addresses — never an AI hallucination.</li>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>Routes optimised so you spend less time in transit, more time exploring.</li>
                  <li className={styles.featureItem}><span className={styles.check}>✓</span>A day-by-day plan tuned to your pace, budget and interests.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Interests ── */}
        {step === 2 && (
          <div className={styles.stepWrap}>
            <button className={styles.btnBack} onClick={() => setStep(1)}>← Back</button>
            <div className={styles.eyebrow} style={{ marginTop: 20 }}>Personalise</div>
            <h1 className={styles.h1}>What do you love?</h1>
            <p className={styles.sub}>Select your interests and we'll research places that match.</p>

            <div className={styles.catSection}>
              <div className={styles.catHeading}>Experiences</div>
              <div className={styles.catGrid}>
                {CATEGORIES.map((c) => {
                  const active = interests.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`${styles.catCard} ${active ? styles.catCardActive : ''}`}
                      onClick={() => toggleInterest(c.id)}
                    >
                      <div className={`${styles.catCheckbox} ${active ? styles.catCheckboxActive : ''}`}>{active ? '✓' : ''}</div>
                      <span className={styles.catEmoji}>{c.emoji}</span>
                      <div>
                        <div className={styles.catTitle}>{c.title}</div>
                        <div className={styles.catDesc}>{c.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.catSection}>
              <div className={styles.catHeading}>Unique to Juzgo</div>
              <div className={styles.catGrid}>
                {UNIQUE_CATS.map((c) => {
                  const active = interests.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`${styles.catCard} ${active ? styles.catCardActive : ''}`}
                      onClick={() => toggleInterest(c.id)}
                    >
                      <div className={`${styles.catCheckbox} ${active ? styles.catCheckboxActive : ''}`}>{active ? '✓' : ''}</div>
                      <span className={styles.catEmoji}>{c.emoji}</span>
                      <div>
                        <div className={styles.catTitle}>{c.title}</div>
                        <div className={styles.catDesc}>{c.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button className={styles.btnGenerate} onClick={handleFetchPlaces}>
              Research places to visit →
            </button>
          </div>
        )}

        {/* ── Step 3: Place picker ── */}
        {step === 3 && (
          <>
            {placesLoading ? (
              <div className={styles.placesLoadingWrap}>
                <div className={styles.spinnerBig} />
                <p className={styles.loadingText}>Researching the best places in {destination}…</p>
              </div>
            ) : placesError ? (
              <div className={styles.errorWrap}>
                <p className={styles.errorText}>{placesError}</p>
                <button className={styles.btnGenerate} onClick={handleFetchPlaces}>Try again</button>
              </div>
            ) : (
              <PlacePicker
                destination={destination}
                places={recommendedPlaces}
                onConfirm={handleBuildItinerary}
                onBack={() => setStep(2)}
                loading={itineraryLoading}
              />
            )}
          </>
        )}

        {/* ── Step 4: Itinerary + Map ── */}
        {step === 4 && (
          <div className={styles.chatWrap}>
            <div className={styles.chatHeader}>
              <div>
                <div className={styles.eyebrow}>Your itinerary</div>
                <h1 className={styles.chatH1}>{destination}</h1>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryItem}>📅 {dayCount} days</span>
                  <span className={styles.summaryItem}>👥 {travelers} traveller{travelers > 1 ? 's' : ''}</span>
                  <span className={styles.summaryItem}>💰 {budget}</span>
                  <span className={styles.summaryItem}>📍 {finalPlaces.length} places</span>
                </div>
              </div>
              <div className={styles.chatActions}>
                <button className={styles.btnSave} onClick={savedId ? updateSavedItinerary : saveItinerary}>
                  {savedId ? 'Update' : 'Save itinerary'}
                </button>
                <button className={styles.btnRestart} onClick={resetAll}>New trip</button>
              </div>
            </div>

            {finalPlaces.some((p) => p.lat && p.lng) && (
              <ItineraryMap places={finalPlaces} days={dayNumbers} />
            )}

            <div className={styles.chat} ref={chatRef}>
              {messages.map((m, i) => (
                <div key={i} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgBot}`}>
                  <div className={styles.msgBubble}>
                    {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                  </div>
                </div>
              ))}
              {itineraryLoading && (
                <div className={`${styles.msg} ${styles.msgBot}`}>
                  <div className={styles.msgBubble}>
                    <div className={styles.typingDots}><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChat} className={styles.chatForm}>
              <input
                type="text"
                placeholder="Ask a follow-up question…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className={styles.chatInput}
                disabled={chatLoading}
              />
              <button type="submit" className={styles.chatSend} disabled={chatLoading || !input.trim()}>
                Send →
              </button>
            </form>

            {/* Bottom action bar — decision point after reviewing the itinerary */}
            <div className={styles.bottomActions}>
              <p className={styles.bottomPrompt}>Happy with this plan?</p>
              <div className={styles.bottomBtnRow}>
                <button className={styles.btnSaveBig} onClick={savedId ? updateSavedItinerary : saveItinerary}>
                  {savedId ? '💾 Update itinerary' : '💾 Save itinerary'}
                </button>
                <button className={styles.btnShareBig} onClick={shareItinerary}>🔗 Share</button>
                <button className={styles.btnPrintBig} onClick={() => window.print()}>🖨️ Print</button>
                <button className={styles.btnReplanBig} onClick={() => setStep(3)}>↺ Re-plan places</button>
                <button className={styles.btnRestartBig} onClick={resetAll}>+ New trip</button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
