import React from 'react';
import { Link } from 'react-router-dom';
import { useLang, t } from '../lib/i18n';
import styles from './Footer.module.css';

export default function Footer() {
  const { lang } = useLang();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>

          {/* Brand column */}
          <div className={styles.brand}>
            <div className={styles.logo}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2A6FDB" strokeWidth="1.4">
                <circle cx="12" cy="12" r="9.5" />
                <ellipse cx="12" cy="12" rx="4" ry="9.5" />
                <line x1="2.5" y1="12" x2="21.5" y2="12" />
              </svg>
              <span className={styles.logoText}>Juzgo</span>
            </div>
            <p className={styles.tagline}>
              Travel data and AI trip planning for 190+ countries. One app, activated in 60 seconds.
            </p>
          </div>

          {/* Product */}
          <div className={styles.col}>
            <div className={styles.colHeading}>Product</div>
            <Link to="/plans" className={styles.colLink}>eSIM Plans</Link>
            <Link to="/itinerary" className={styles.colLink}>Plan My Itinerary</Link>
            <Link to="/wallet" className={styles.colLink}>Juzgo Wallet</Link>
            <Link to="/find-order" className={styles.colLink}>Find My Order</Link>
          </div>

          {/* Company */}
          <div className={styles.col}>
            <div className={styles.colHeading}>Company</div>
            <span className={styles.colLink}>About</span>
            <span className={styles.colLink}>Careers</span>
            <span className={styles.colLink}>Partners</span>
          </div>

          {/* Support */}
          <div className={styles.col}>
            <div className={styles.colHeading}>Support</div>
            <span className={styles.colLink}>Help Centre</span>
            <Link to="/terms" className={styles.colLink}>Terms &amp; Conditions</Link>
            <span className={styles.colLink}>Privacy</span>
            <a href="mailto:hello@juzgo.world" className={styles.colLink}>Contact</a>
          </div>
        </div>

        <div className={styles.bottom}>
          <span className={styles.copy}>© 2026 juzgo.world — all rights reserved.</span>
          <span className={styles.social}>Instagram · TikTok · X</span>
        </div>
      </div>
    </footer>
  );
}
