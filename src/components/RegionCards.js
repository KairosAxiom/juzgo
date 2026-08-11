import React from 'react';
import styles from './RegionCards.module.css';
import { DAY_COLORS } from '../constants/dayColors';

/*
 * RegionCards (Session 29) — presents a confirmed itinerary as one card per
 * geographic region, an alternate view to the map + day list. Pure renderer:
 * every input is computed by the parent (Itinerary.js) and passed in, so this
 * component holds no derivation logic and makes no network calls.
 *
 * Props:
 *   regions      — ordered regions from orderRegions(deriveRegions(finalPlaces)):
 *                  [{ key, days:[...], centroid, placeCount }]
 *   places       — finalPlaces (the single source of truth for structure)
 *   enrichment   — { byRegion: { [key]: {name,eat,stay,gettingHere} },
 *                    priceById: { [id]: priceString } } or null (fail-open)
 *   segments     — buildTravelSegments(finalPlaces): intra-region same-day hops
 *   connectorFor — (fromRegion, toRegion) => { km, hint } | null
 *   loading      — true while enrichment is being fetched
 *
 * Fail-open by construction: if enrichment is null every enrichment-derived
 * line is simply omitted; the card still shows places, days, and hops.
 */

function isMain(region, regions) {
  return regions.length > 0 && region.key === regions[0].key;
}

export default function RegionCards({ regions, places, enrichment, segments, connectorFor, loading }) {
  if (!regions || regions.length === 0) return null;

  const byRegion = enrichment?.byRegion || {};
  const priceById = enrichment?.priceById || {};

  // Look up the pre-computed hop from this stop to the next same-day stop.
  const hopAfter = (fromName, day) => {
    const s = (segments || []).find((seg) => seg.from === fromName && Number(seg.day) === Number(day));
    if (!s) return null;
    if (s.mode === 'walk') return `${s.mins} min walk`;
    return `~${s.taxiMins} min taxi · ~${s.transitMins} min transit`;
  };

  return (
    <div className={styles.wrap}>
      {loading && (
        <div className={styles.loadingRow}>
          <span className={styles.spinner} />
          Gathering local details…
        </div>
      )}

      {regions.map((region, ri) => {
        const meta = byRegion[region.key] || null;
        const regionPlaces = places.filter((p) => region.days.includes(Number(p.day)));
        const regionName = meta?.name || (isMain(region, regions) ? 'Main area' : 'Day trip');
        const prevRegion = ri > 0 ? regions[ri - 1] : null;
        const connector = prevRegion ? connectorFor(prevRegion, region) : null;
        const gettingHere = meta?.gettingHere || null;

        return (
          <React.Fragment key={region.key}>
            {/* Inter-region connector (grounded distance + hedged mode) */}
            {ri > 0 && (connector || gettingHere) && (
              <div className={styles.connector}>
                <span className={styles.connectorRule} />
                <div className={styles.connectorBody}>
                  <span className={styles.connectorIcon}>↓</span>
                  <div>
                    {connector && <div className={styles.connectorMain}>{connector.hint}</div>}
                    {gettingHere && <div className={styles.connectorHedge}>{gettingHere}</div>}
                  </div>
                </div>
              </div>
            )}

            <section className={styles.card}>
              <header className={styles.cardHead}>
                <div>
                  <div className={styles.regionEyebrow}>
                    {isMain(region, regions) ? 'Base' : 'Day trip'} · Day{region.days.length > 1 ? 's' : ''} {region.days.join(', ')}
                  </div>
                  <h3 className={styles.regionName}>{regionName}</h3>
                </div>
                <span className={styles.placeCount}>{regionPlaces.length} {regionPlaces.length === 1 ? 'stop' : 'stops'}</span>
              </header>

              {/* Day-coloured sub-sections: one block per day in the region */}
              {region.days.map((day) => {
                const dayStops = regionPlaces.filter((p) => Number(p.day) === day);
                if (dayStops.length === 0) return null;
                const color = DAY_COLORS[(day - 1) % DAY_COLORS.length];
                return (
                  <div key={day} className={styles.dayBlock}>
                    <div className={styles.dayLabel}>
                      <span className={styles.dayDot} style={{ background: color }} />
                      Day {day}
                    </div>
                    <ol className={styles.stopList}>
                      {dayStops.map((p) => {
                        const price = priceById[p.id] || null;
                        const hop = hopAfter(p.name, day);
                        const noCoord = !(p.lat && p.lng);
                        return (
                          <li key={p.id} className={styles.stop}>
                            <div className={styles.stopMain}>
                              <span className={styles.stopName}>{p.name}</span>
                              {price && <span className={styles.price}>{price}</span>}
                            </div>
                            {p.whyVisit && <div className={styles.whyLine}>{p.whyVisit}</div>}
                            {hop && !noCoord && (
                              <div className={styles.hop}><span className={styles.hopArrow}>→</span> {hop} to next</div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}

              {/* Per-region eat / stay (hidden when enrichment absent) */}
              {meta && (meta.eat?.length > 0 || meta.stay) && (
                <div className={styles.localRow}>
                  {meta.eat?.length > 0 && (
                    <div className={styles.localItem}>
                      <span className={styles.localMark}>吃</span>
                      <div>
                        <div className={styles.localLabel}>Eat</div>
                        <div className={styles.localText}>{meta.eat.join(' · ')}</div>
                      </div>
                    </div>
                  )}
                  {meta.stay && (
                    <div className={styles.localItem}>
                      <span className={styles.localMark}>住</span>
                      <div>
                        <div className={styles.localLabel}>Stay</div>
                        <div className={styles.localText}>{meta.stay}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </React.Fragment>
        );
      })}
    </div>
  );
}
