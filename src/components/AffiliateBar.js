import React from 'react';
import styles from './AffiliateBar.module.css';

const AFFILIATES = [
  { name: 'Tiqets',       url: 'https://www.tiqets.com' },
  { name: 'Booking.com',  url: 'https://www.booking.com' },
  { name: 'Klook',        url: 'https://www.klook.com' },
  { name: 'Expedia',      url: 'https://www.expedia.com' },
];

export default function AffiliateBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.label}>Complete your trip — book hotels, flights &amp; activities:</span>
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
