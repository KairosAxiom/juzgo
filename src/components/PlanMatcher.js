import { useMemo, useState, useEffect } from 'react';
import styles from './PlanMatcher.module.css';

/**
 * PlanMatcher — slider-driven eSIM selector (HERO widget, build-once/mount-twice).
 *
 * This component is PRESENTATIONAL and self-contained: it owns the settled prototype
 * logic (notch derivation, stepped sliders, evenly-spaced ruler ticks with thumb-radius
 * compensation, the "covers at least what you asked for" matching rule, price-ascending
 * sort, three-field cards + carrier tags, actionable empty state). It does NOT talk to
 * Supabase, fetch anything, or know about the order pipeline. Those are wired at the two
 * INTEGRATION SEAMS documented below, so the same component mounts identically on the
 * Home page and the Data Plans page.
 *
 * ── DATA CONTRACT (normalise at the call site, verified against live schema at Phase 0) ──
 *   props.plans : Array<{
 *     id        : string        // package_id — passed straight to onBuy
 *     data      : number        // NUMERIC GB for comparison/sort. NOTE: the catalog stores
 *                               //   a pre-formatted string (data_amount, e.g. "3 GB"); the
 *                               //   adapter must parse it to a number. Unlimited → see note.
 *     days      : number        // NUMERIC validity days
 *     priceSgd  : number        // NUMERIC retail price in SGD (your_price / floor default)
 *     carriers  : string[]      // resolved operator names from country_coverage_index.networks
 *     label     : string        // optional human data label to DISPLAY ("3 GB", "Unlimited")
 *     raw       : object        // the original plan object, handed back untouched via onBuy
 *   }>
 *
 *   props.destinations : Array<{ value: string, label: string }>   // for the picker
 *   props.destination  : string | null                            // controlled selection
 *   props.onDestinationChange : (value: string) => void           // SEAM 1: triggers the
 *                               //   parent's scoped catalog query (country_coverage_index →
 *                               //   airalo_catalog). The parent passes the fetched, normalised
 *                               //   result back in via `plans`. Matcher never fetches.
 *   props.loading      : boolean                                  // parent-owned fetch state
 *   props.onBuy        : (rawPlan) => void                        // SEAM 2: existing eWallet /
 *                               //   order pipeline. Reuse, don't rebuild.
 *   props.onBrowseAll  : () => void | undefined                   // "See all plans" affordance.
 *                               //   Home page: route to /plans. Plans page: scroll to the list.
 *
 * UNLIMITED HANDLING: packages with fair-use "unlimited" data have no finite GB. The adapter
 * should map them to a large sentinel (e.g. Number.POSITIVE_INFINITY) for `data` so they always
 * satisfy `data >= needData`, while `label` shows "Unlimited". Sort still works (Infinity sorts
 * high, but ranking is by price, not data, so it's a non-issue).
 */
export default function PlanMatcher({
  plans = [],
  destinations = [],
  destination = null,
  onDestinationChange,
  showDestinationPicker = true, // false when the host page already owns destination selection
  loading = false,
  onBuy,
  onBrowseAll,
  thumbRadiusPx = 9, // match to the real styled thumb; prototype ≈ 9px
}) {
  // Notch derivation from the scoped catalog (build note §3): distinct values, ascending.

  // ── Notch derivation: DERIVED from the scoped catalog, never hardcoded (build note §3) ──
  const dataStops = useMemo(() => distinctSorted(plans, 'data'), [plans]);
  const dayStops = useMemo(() => distinctSorted(plans, 'days'), [plans]);

  // Slider indices. Default to the middle notch so the widget opens on a sensible pick,
  // not the cheapest-tiny or most-expensive-huge extreme.
  const [dataIdx, setDataIdx] = useState(() => midIndex(dataStops.length));
  const [daysIdx, setDaysIdx] = useState(() => midIndex(dayStops.length));

  // Re-clamp indices when the destination changes and the stop arrays resize.
  useEffect(() => {
    setDataIdx((i) => clampIndex(i, dataStops.length));
  }, [dataStops.length]);
  useEffect(() => {
    setDaysIdx((i) => clampIndex(i, dayStops.length));
  }, [dayStops.length]);

  const needData = dataStops.length ? dataStops[dataIdx] : null;
  const needDays = dayStops.length ? dayStops[daysIdx] : null;

  // Human labels for the live readout. Prefer a matching plan's display label so
  // "Unlimited" shows as text rather than "Infinity GB".
  const dataReadout = useMemo(
    () => stopLabel(plans, 'data', needData, (v) => `${v} GB`),
    [plans, needData]
  );
  const daysReadout = needDays == null ? '—' : `${needDays} ${needDays === 1 ? 'day' : 'days'}`;

  // ── Matching rule: "covers at least what you asked for", cheapest first (build note §4/§5) ──
  const matches = useMemo(() => {
    if (needData == null || needDays == null) return [];
    return plans
      .filter((p) => p.data >= needData && p.days >= needDays)
      .sort((a, b) => a.priceSgd - b.priceSgd);
  }, [plans, needData, needDays]);

  const hasDestination = Boolean(destination);
  const hasStops = dataStops.length > 0 && dayStops.length > 0;

  return (
    <section className={styles.matcher} aria-label={'Find your eSIM'}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{'Find your plan'}</p>
          <h2 className={styles.title}>
            {'Tell us the trip. We’ll match the plan.'}
          </h2>
        </header>

        {/* Destination — SEAM 1. Hidden when the host page owns destination selection. */}
        {showDestinationPicker && (
          <label className={styles.field}>
            <span className={styles.label}>{'Destination'}</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={destination || ''}
                onChange={(e) => onDestinationChange?.(e.target.value)}
              >
                <option value="" disabled>
                  {'Where are you going?'}
                </option>
                {destinations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Chevron className={styles.chevron} />
            </div>
            <span className={styles.hint}>
              {'Options adjust to what’s available for your destination'}
            </span>
          </label>
        )}

        {/* Sliders */}
        {loading && (
          <p className={styles.stateMsg} role="status">
            {'Loading plans…'}
          </p>
        )}

        {!loading && hasDestination && hasStops && (
          <div className={styles.sliders}>
            <Ruler
              id="matcher-data"
              title={'Data needed'}
              readout={dataReadout}
              stops={dataStops}
              index={dataIdx}
              onChange={setDataIdx}
              formatStop={(v) => stopLabel(plans, 'data', v, (n) => `${n}`)}
              thumbRadiusPx={thumbRadiusPx}
            />
            <Ruler
              id="matcher-days"
              title={'Trip length'}
              readout={daysReadout}
              stops={dayStops}
              index={daysIdx}
              onChange={setDaysIdx}
              formatStop={(v) => `${v}`}
              thumbRadiusPx={thumbRadiusPx}
            />
          </div>
        )}

        {/* Results */}
        {!loading && hasDestination && hasStops && (
          <div className={styles.results}>
            {matches.length > 0 ? (
              <ul className={styles.cards}>
                {matches.map((p) => (
                  <ResultCard key={p.id} plan={p} onBuy={onBuy} />
                ))}
              </ul>
            ) : (
              <div className={styles.empty} role="status">
                <p className={styles.emptyTitle}>
                  {'No plan covers that much just yet.'}
                </p>
                <p className={styles.emptyBody}>
                  {'Try adjusting a slider down — nudge the data or the trip length lower to see plans that fit.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Browse-all affordance */}
        {onBrowseAll && (
          <button type="button" className={styles.browseAll} onClick={onBrowseAll}>
            {'See all plans'}
          </button>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────── Ruler subcomponent ────────────────────────────── */

function Ruler({ id, title, readout, stops, index, onChange, formatStop, thumbRadiusPx }) {
  const max = Math.max(stops.length - 1, 0);
  return (
    <div className={styles.ruler}>
      <div className={styles.rulerHead}>
        <span className={styles.label}>{title}</span>
        <span className={styles.readout}>{readout}</span>
      </div>

      <div className={styles.track}>
        <input
          id={id}
          className={styles.range}
          type="range"
          min={0}
          max={max}
          step={1}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={readout}
          aria-label={title}
        />
      </div>

      {/* Evenly-spaced ticks with thumb-radius compensation (build note gotcha §122) */}
      <div className={styles.ticks} aria-hidden="true">
        {stops.map((v, i) => {
          const pct = max === 0 ? 50 : (i / max) * 100;
          const left = `calc(${pct}% - ${((pct - 50) / 50) * thumbRadiusPx}px)`;
          const active = i === index;
          return (
            <span key={i} className={styles.tick} style={{ left }}>
              <span className={styles.tickMark} />
              <span className={`${styles.tickLabel} ${active ? styles.tickLabelActive : ''}`}>
                {formatStop(v)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────── Result card ────────────────────────────── */

function ResultCard({ plan, onBuy }) {
  const dataLabel = plan.label || `${plan.data} GB`;
  return (
    <li className={styles.card}>
      <div className={styles.cardMain}>
        <p className={styles.cardPlan}>
          {dataLabel} <span className={styles.dot}>·</span> {plan.days} {plan.days === 1 ? 'day' : 'days'}
        </p>
        {plan.carriers && plan.carriers.length > 0 && (
          <p className={styles.carriers}>
            <span className={styles.carriersLabel}>{'Runs on'}:</span>{' '}
            {plan.carriers.map((c, i) => (
              <span key={i} className={styles.carrierTag}>
                {c}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className={styles.cardBuy}>
        <span className={styles.price}>S${Number(plan.priceSgd).toFixed(2)}</span>
        <button
          type="button"
          className={styles.buyBtn}
          onClick={() => onBuy?.(plan.raw ?? plan)}
        >
          {'Get this plan'}
        </button>
      </div>
    </li>
  );
}

/* ────────────────────────────── Pure helpers ────────────────────────────── */

// Distinct, ascending values of `key` across the plan set. (Prototype logic, unchanged.)
export function distinctSorted(plans, key) {
  return Array.from(new Set(plans.map((p) => p[key])))
    .filter((v) => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
}

function midIndex(len) {
  return len ? Math.floor((len - 1) / 2) : 0;
}

function clampIndex(i, len) {
  if (!len) return 0;
  return Math.min(Math.max(i, 0), len - 1);
}

// Prefer a display label from a plan whose numeric value matches (so Unlimited shows as text).
function stopLabel(plans, key, value, fallbackFmt) {
  if (value == null) return '—';
  const hit = plans.find((p) => p[key] === value && p.label);
  if (hit && key === 'data') return hit.label;
  return fallbackFmt(value);
}

function Chevron({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
