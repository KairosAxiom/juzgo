import { useMemo, useState, useEffect } from 'react';
import styles from './PlanSliders.module.css';

/**
 * PlanSliders — two notched sliders (Data needed / Trip length) that report the
 * selected values up to the host page, which uses them to filter its own plan grid.
 *
 * This is the /plans "narrow by size + duration" control. It renders NO result cards
 * and NO destination picker — the page owns those. (For the standalone hero widget with
 * its own result list, see PlanMatcher.)
 *
 * Props:
 *   plans    : Array<{ data:number, days:number }>  — adapted rows; used only to derive
 *              the notch values. Unlimited → data = Infinity.
 *   onChange : ({ needData, needDays }) => void      — fired whenever a slider moves (and
 *              once on mount / when notches change), so the page can filter its grid.
 *   thumbRadiusPx : number — matches the styled thumb for tick alignment (≈9).
 */
export default function PlanSliders({ plans = [], onChange, thumbRadiusPx = 9 }) {
  const dataStops = useMemo(() => distinctSorted(plans, 'data'), [plans]);
  const dayStops = useMemo(() => distinctSorted(plans, 'days'), [plans]);

  // Default to the lowest notch so the grid starts unfiltered-feeling (everything ≥ min shows).
  const [dataIdx, setDataIdx] = useState(0);
  const [daysIdx, setDaysIdx] = useState(0);

  // Re-clamp when the notch arrays resize (new destination searched).
  useEffect(() => { setDataIdx((i) => clampIndex(i, dataStops.length)); }, [dataStops.length]);
  useEffect(() => { setDaysIdx((i) => clampIndex(i, dayStops.length)); }, [dayStops.length]);

  const needData = dataStops.length ? dataStops[dataIdx] : null;
  const needDays = dayStops.length ? dayStops[daysIdx] : null;

  // Report up whenever the selected values change.
  useEffect(() => {
    onChange?.({ needData, needDays });
  }, [needData, needDays, onChange]);

  if (!dataStops.length || !dayStops.length) return null;

  const dataReadout = needData == null ? '—' : formatData(plans, needData);
  const daysReadout = needDays == null ? '—' : `${needDays} ${needDays === 1 ? 'day' : 'days'}`;

  return (
    <div className={styles.sliders}>
      <Ruler
        id="plansliders-data"
        title="Data needed"
        readout={dataReadout}
        stops={dataStops}
        index={dataIdx}
        onChange={setDataIdx}
        formatStop={(v) => formatData(plans, v)}
        thumbRadiusPx={thumbRadiusPx}
      />
      <Ruler
        id="plansliders-days"
        title="Trip length"
        readout={daysReadout}
        stops={dayStops}
        index={daysIdx}
        onChange={setDaysIdx}
        formatStop={(v) => `${v}`}
        thumbRadiusPx={thumbRadiusPx}
      />
    </div>
  );
}

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

      {/* Evenly-spaced ticks with thumb-radius compensation */}
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

/* ── pure helpers ── */

export function distinctSorted(plans, key) {
  return Array.from(new Set(plans.map((p) => p[key])))
    .filter((v) => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
}

function clampIndex(i, len) {
  if (!len) return 0;
  return Math.min(Math.max(i, 0), len - 1);
}

// Show "Unlimited" for the Infinity sentinel, else "N GB".
function formatData(plans, value) {
  if (value === Number.POSITIVE_INFINITY) return 'Unlimited';
  return `${value} GB`;
}
