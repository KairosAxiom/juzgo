import React from 'react';
import styles from './AnimatedGlobe.module.css';

export default function AnimatedGlobe() {
  return (
    <div className={styles.wrap}>
      <div className={styles.scene}>

        {/* ── Globe ── */}
        <div className={styles.globe}>
          {/* Latitude lines */}
          {[-40, -20, 0, 20, 40].map((deg) => (
            <div
              key={deg}
              className={styles.latLine}
              style={{ top: `calc(50% + ${deg * 1.1}px)` }}
            />
          ))}
          {/* Longitude lines */}
          {[0, 36, 72, 108, 144].map((deg) => (
            <div
              key={deg}
              className={styles.lonLine}
              style={{ transform: `rotateY(${deg}deg)` }}
            />
          ))}
          {/* Continents — SVG paths approximated as blobs */}
          <svg className={styles.continents} viewBox="0 0 200 200">
            {/* Americas */}
            <ellipse cx="62" cy="85" rx="18" ry="28" opacity=".55" />
            <ellipse cx="68" cy="128" rx="12" ry="20" opacity=".5" />
            {/* Europe / Africa */}
            <ellipse cx="105" cy="72" rx="12" ry="14" opacity=".55" />
            <ellipse cx="108" cy="108" rx="14" ry="22" opacity=".5" />
            {/* Asia */}
            <ellipse cx="140" cy="70" rx="22" ry="18" opacity=".55" />
            {/* Australia */}
            <ellipse cx="152" cy="128" rx="12" ry="9" opacity=".45" />
          </svg>
          {/* Glow overlay */}
          <div className={styles.globeGlow} />
          {/* Shine */}
          <div className={styles.globeShine} />
        </div>

        {/* ── Orbit ring 1 — eSIM chip ── */}
        <div className={styles.orbit1}>
          <div className={styles.orbitPath} />
          <div className={styles.esimChip}>
            <svg width="38" height="28" viewBox="0 0 38 28" fill="none">
              <rect width="38" height="28" rx="5" fill="#1E8E5E" />
              <rect x="4" y="4" width="30" height="20" rx="3" fill="#15734B" />
              {/* Chip contacts */}
              <rect x="8" y="8" width="8" height="5" rx="1" fill="#2EC97E" opacity=".7" />
              <rect x="22" y="8" width="8" height="5" rx="1" fill="#2EC97E" opacity=".7" />
              <rect x="8" y="15" width="8" height="5" rx="1" fill="#2EC97E" opacity=".7" />
              <rect x="22" y="15" width="8" height="5" rx="1" fill="#2EC97E" opacity=".7" />
              {/* eSIM label */}
              <text x="19" y="16" textAnchor="middle" fill="#fff" fontSize="6" fontFamily="DM Mono, monospace" fontWeight="500" opacity=".9">eSIM</text>
            </svg>
          </div>
        </div>

        {/* ── Orbit ring 2 — signal dot ── */}
        <div className={styles.orbit2}>
          <div className={styles.orbitPath2} />
          <div className={styles.signalDot}>
            <div className={styles.signalPulse} />
            <div className={styles.signalCore} />
          </div>
        </div>

        {/* ── Orbit ring 3 — wifi icon ── */}
        <div className={styles.orbit3}>
          <div className={styles.wifiChip}>
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <circle cx="15" cy="15" r="15" fill="#2A6FDB" opacity=".9" />
              <path d="M8 13.5a9.5 9.5 0 0 1 14 0" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".7"/>
              <path d="M10.5 16.5a6 6 0 0 1 9 0" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".85"/>
              <path d="M13 19.5a3 3 0 0 1 4 0" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
              <circle cx="15" cy="22" r="1.2" fill="#fff"/>
            </svg>
          </div>
        </div>

        {/* ── Connection lines ── */}
        <svg className={styles.connLines} viewBox="0 0 400 400">
          <line x1="200" y1="200" x2="340" y2="80" stroke="#1E8E5E" strokeWidth="1" strokeDasharray="4 4" opacity=".35">
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
          </line>
          <line x1="200" y1="200" x2="60" y2="300" stroke="#2A6FDB" strokeWidth="1" strokeDasharray="4 4" opacity=".3">
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.6s" repeatCount="indefinite" />
          </line>
          <line x1="200" y1="200" x2="350" y2="300" stroke="#1E8E5E" strokeWidth="1" strokeDasharray="4 4" opacity=".25">
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="2s" repeatCount="indefinite" />
          </line>
        </svg>

        {/* ── Floating labels ── */}
        <div className={`${styles.floatLabel} ${styles.floatLabel1}`}>5G</div>
        <div className={`${styles.floatLabel} ${styles.floatLabel2}`}>190+</div>
        <div className={`${styles.floatLabel} ${styles.floatLabel3}`}>60s</div>
      </div>
    </div>
  );
}
