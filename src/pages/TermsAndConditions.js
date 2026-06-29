import React from 'react';
import Footer from '../components/Footer';
import styles from './Pages.module.css';

export default function TermsAndConditions() {
  return (
    <div className={styles.page}>
      <main className={styles.termsMain}>
        <div className={styles.eyebrow}>Legal</div>
        <h1 className={styles.h1}>Terms &amp; Conditions</h1>
        <p className={styles.sub} style={{ marginBottom: 48 }}>
          Last updated: June 2026. Please read these terms carefully before using Juzgo.
        </p>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>1. Acceptance of Terms</h2>
          <p className={styles.termsPara}>
            By accessing or using juzgo.world, you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, please do not use the platform.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>2. eSIM Plans</h2>
          <p className={styles.termsPara}>
            All eSIM plans are sold as described. Coverage depends on local carrier availability. Juzgo is not responsible for network outages or coverage gaps outside our direct control.
          </p>
          <ul className={styles.termsList}>
            <li>Plans are non-refundable once the QR code has been scanned and activated.</li>
            <li>Data validity begins on the date of first activation, not purchase.</li>
            <li>Unused data does not carry over after plan expiry unless a rollover option is purchased.</li>
          </ul>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>3. Wallet &amp; Payments</h2>
          <p className={styles.termsPara}>
            Wallet balances are non-refundable and non-transferable. All prices are in Singapore Dollars (SGD) and include 9% GST where applicable. Juzgo uses Stripe for secure payment processing.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>4. Referral &amp; Reseller Programme</h2>
          <p className={styles.termsPara}>
            Referral credits are awarded as wallet credit upon a referred user's first completed purchase. Juzgo reserves the right to modify or discontinue the referral programme at any time. Abuse of the referral system will result in account suspension.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>5. AI Itinerary Service</h2>
          <p className={styles.termsPara}>
            The AI itinerary planner is provided as a convenience. While we strive for accuracy, Juzgo does not guarantee the correctness of AI-generated recommendations. Always verify opening hours, prices, and access requirements with official sources before travel.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>6. Privacy</h2>
          <p className={styles.termsPara}>
            We collect only the data necessary to provide our services. We do not sell your personal information to third parties. See our full Privacy Policy for details.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>7. Limitation of Liability</h2>
          <p className={styles.termsPara}>
            To the maximum extent permitted by law, Juzgo shall not be liable for any indirect, incidental, or consequential damages arising from use of the platform or eSIM services.
          </p>
        </div>

        <div className={styles.termsSection}>
          <h2 className={styles.termsH2}>8. Contact</h2>
          <p className={styles.termsPara}>
            For questions regarding these terms, please contact us at <a href="mailto:hello@juzgo.world" style={{ color: '#1E8E5E', fontWeight: 600 }}>hello@juzgo.world</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
