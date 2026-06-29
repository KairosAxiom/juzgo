import React from 'react';
import styles from './TrustBadge.module.css';

const BADGES = [
  { icon: '🔒', text: 'Secure payments via Stripe' },
  { icon: '⚡', text: 'Instant eSIM delivery' },
  { icon: '🌍', text: '190+ countries covered' },
  { icon: '💬', text: '24/7 customer support' },
];

export default function TrustBadge() {
  return (
    <div className={styles.wrap}>
      {BADGES.map((b) => (
        <div key={b.text} className={styles.badge}>
          <span className={styles.icon}>{b.icon}</span>
          <span className={styles.text}>{b.text}</span>
        </div>
      ))}
    </div>
  );
}
