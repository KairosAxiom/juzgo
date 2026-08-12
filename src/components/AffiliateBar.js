import React from 'react';
import styles from './AffiliateBar.module.css';

// Single shared source of affiliate partners (previously duplicated in Plans.js and Home.js).
const AFFILIATES = [
  { name: 'Klook',   url: 'https://affiliate.klook.com/redirect?aid=127608&aff_adid=1341474&k_site=https%3A%2F%2Fwww.klook.com%2F' },
  { name: 'Expedia', url: 'https://expedia.com/affiliate/IidJRn7' },
];

// Global affiliate strip, pinned top-right below the main nav on every page.
export default function AffiliateBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.label}>Complete your trip:</span>
        <div className={styles.pills}>
          {AFFILIATES.map((a) => (
            <a
              key={a.name}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pill}
            >
              {a.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
