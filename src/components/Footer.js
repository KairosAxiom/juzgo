import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import styles from './Footer.module.css';

export default function Footer() {
  const { lang, t } = useLang();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>

          {/* Brand column */}
          <div className={styles.brand}>
            <div className={styles.logo}>
              <svg width="26" height="30" viewBox="0 0 38 44" fill="none">
                <path d="M19 2C11.268 2 5 8.268 5 16c0 10 14 26 14 26S33 26 33 16C33 8.268 26.732 2 19 2z" fill="#1E8E5E" />
                <circle cx="19" cy="16" r="6" fill="white" opacity="0.9" />
                <ellipse cx="19" cy="41" rx="8" ry="3" fill="#1E8E5E" opacity="0.25" />
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
