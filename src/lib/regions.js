/*
 * Region derivation for the itinerary card view (Session 29, multi-region).
 *
 * A "region" is a run of consecutive days whose geographic centres sit close
 * together. Because the day-clustering upstream (clusterPlacesByDay →
 * orderClustersByCentroidPath in Itinerary.js) already orders days as a
 * nearest-neighbour path, consecutive day numbers are geographically
 * adjacent — so walking the days in order and starting a new region whenever
 * the next day's centre jumps more than THRESHOLD_KM away yields sensible
 * contiguous regions. A distant day-trip (Mount Fuji, Nara) naturally lands
 * in its own region.
 *
 * Everything here is PURE (no React, no network) so it can be unit-tested
 * directly and reused by both Itinerary.js and RegionCards.js.
 */

// Cities are typically far more than this apart, while intra-city hops
// (e.g. two neighbourhoods) stay well under it — so this cleanly separates
// a real day-trip from ordinary in-town movement. Heuristic; tunable.
export const THRESHOLD_KM = 25;

const R_EARTH_KM = 6371;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n;
}
function validCoord(v) {
  const n = num(v);
  return typeof n === 'number' && !isNaN(n) && n !== 0;
}

/* Mean lat/lng of a day's coordinate-bearing places. Returns null if the day
   has no place with usable coordinates (that day can't anchor a region on
   its own — see deriveRegions for how it's folded in). */
export function dayCentroid(places, day) {
  const pts = places.filter(
    (p) => Number(p.day) === Number(day) && validCoord(p.lat) && validCoord(p.lng)
  );
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, p) => s + num(p.lat), 0) / pts.length;
  const lng = pts.reduce((s, p) => s + num(p.lng), 0) / pts.length;
  return { lat, lng };
}

/* Sorted unique day numbers present in the places array. */
export function dayNumbersOf(places) {
  return [...new Set(places.map((p) => Number(p.day)).filter((d) => d >= 1))].sort(
    (a, b) => a - b
  );
}

/*
 * B3 — group consecutive days into regions by centroid proximity.
 *
 * Walk day numbers in order. Maintain a running region centroid (mean of the
 * days added so far). For each next day: if its centroid is within
 * thresholdKm of the running centroid, it joins the current region; else it
 * starts a new one. Days with no coordinates at all attach to the current
 * region (they can't anchor their own and have nowhere better to go); if
 * there's no current region yet, they seed one that the first coordinate-
 * bearing day will define.
 *
 * Returns an ordered array of regions:
 *   { key, days:[...], centroid:{lat,lng}|null, placeCount }
 * in day order (not yet main-first — see orderRegions for that).
 */
export function deriveRegions(places, thresholdKm = THRESHOLD_KM) {
  const days = dayNumbersOf(places);
  if (days.length === 0) return [];

  const regions = [];
  let current = null; // { days, sumLat, sumLng, nCoordDays }

  const flush = () => {
    if (!current) return;
    const centroid =
      current.nCoordDays > 0
        ? { lat: current.sumLat / current.nCoordDays, lng: current.sumLng / current.nCoordDays }
        : null;
    const dayList = current.days.slice();
    regions.push({
      key: `d${dayList[0]}-${dayList[dayList.length - 1]}`,
      days: dayList,
      centroid,
      placeCount: places.filter((p) => dayList.includes(Number(p.day))).length,
    });
    current = null;
  };

  for (const day of days) {
    const c = dayCentroid(places, day);

    if (!current) {
      current = {
        days: [day],
        sumLat: c ? c.lat : 0,
        sumLng: c ? c.lng : 0,
        nCoordDays: c ? 1 : 0,
      };
      continue;
    }

    // No coordinates for this day — can't measure a jump, so keep it with the
    // current region rather than spuriously splitting.
    if (!c) {
      current.days.push(day);
      continue;
    }

    // Current region has no centroid yet (only no-coord days so far) — adopt
    // this day's centre as the region's anchor.
    if (current.nCoordDays === 0) {
      current.days.push(day);
      current.sumLat = c.lat;
      current.sumLng = c.lng;
      current.nCoordDays = 1;
      continue;
    }

    const runningCentroid = { lat: current.sumLat / current.nCoordDays, lng: current.sumLng / current.nCoordDays };
    const jump = haversineKm(runningCentroid.lat, runningCentroid.lng, c.lat, c.lng);

    if (jump <= thresholdKm) {
      current.days.push(day);
      current.sumLat += c.lat;
      current.sumLng += c.lng;
      current.nCoordDays += 1;
    } else {
      flush();
      current = { days: [day], sumLat: c.lat, sumLng: c.lng, nCoordDays: 1 };
    }
  }
  flush();
  return regions;
}

/*
 * B4 — order regions main-first, then nearest-neighbour from the main
 * region's centre.
 *
 * "Main" = most days; ties broken by most places, then earliest first day —
 * fully deterministic. The remaining regions are laid out as a nearest-
 * neighbour path starting from the main region's centroid, so the closer
 * day-trip comes before the farther one. Regions without a centroid (no
 * coordinates at all) are appended last, in day order.
 */
export function orderRegions(regions) {
  if (regions.length <= 1) return regions.slice();

  const withCentroid = regions.filter((r) => r.centroid);
  const withoutCentroid = regions.filter((r) => !r.centroid);

  const pickMain = (list) =>
    list.reduce((best, r) => {
      if (!best) return r;
      if (r.days.length !== best.days.length) return r.days.length > best.days.length ? r : best;
      if (r.placeCount !== best.placeCount) return r.placeCount > best.placeCount ? r : best;
      return r.days[0] < best.days[0] ? r : best;
    }, null);

  // If nothing has a centroid, we can't path — just main-first by the same rule.
  if (withCentroid.length === 0) {
    const main = pickMain(regions);
    return [main, ...regions.filter((r) => r !== main)];
  }

  const main = pickMain(withCentroid);
  const ordered = [main];
  const remaining = withCentroid.filter((r) => r !== main);

  let anchor = main.centroid;
  while (remaining.length) {
    let bestI = 0;
    let bestD = Infinity;
    remaining.forEach((r, i) => {
      const d = haversineKm(anchor.lat, anchor.lng, r.centroid.lat, r.centroid.lng);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const next = remaining.splice(bestI, 1)[0];
    ordered.push(next);
    anchor = next.centroid;
  }

  return [...ordered, ...withoutCentroid];
}

/*
 * B5 — grounded inter-region connector between two consecutive ordered
 * regions. Straight-line distance via haversine between centroids, plus a
 * rough duration and a HEDGED mode hint. Deliberately avoids fabricating a
 * specific taxi-minute, train line, or fare: estimateTravelMinutes' taxi
 * framing breaks down past ~80km, and the model has no live schedule data.
 *
 * Returns null if either region lacks a centroid (nothing grounded to say).
 * Shape: { km, hint } where hint is a short verify-this phrasing.
 */
export function interRegionConnector(fromRegion, toRegion) {
  if (!fromRegion?.centroid || !toRegion?.centroid) return null;
  const km = haversineKm(
    fromRegion.centroid.lat, fromRegion.centroid.lng,
    toRegion.centroid.lat, toRegion.centroid.lng
  );
  const kmRounded = Math.round(km);

  let hint;
  if (km <= 15) {
    const mins = Math.max(5, Math.round((km / 22) * 60));
    hint = `about ${kmRounded} km apart — roughly ${mins} min by taxi or local transit`;
  } else if (km <= 80) {
    const lo = Math.max(10, Math.round((km / 45) * 60));
    const hi = Math.round((km / 25) * 60);
    hint = `about ${kmRounded} km apart — typically 30–90 min by road or local train (roughly ${lo}–${hi} min); check current options`;
  } else {
    const hours = km / 70; // deliberately coarse — intercity average incl. access
    const roughHours = hours < 1.5 ? '1–2 hours' : `about ${Math.round(hours)} hours`;
    hint = `about ${kmRounded} km apart — usually reached by train or bus, ${roughHours}; check current schedules and routes`;
  }
  return { km: kmRounded, hint };
}
