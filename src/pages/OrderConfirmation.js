import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import Footer from '../components/Footer';
import { generateReceiptPDF } from '../lib/generateReceipt';
import styles from './Pages.module.css';

export default function OrderConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const order = state?.order;
  const plan = state?.plan;
  const country = state?.country;

  const displayPlan = order || plan;
  const displayCountry = order?.country_name || country?.name;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.confirmCenter}>
          <div className={styles.confirmIcon}>✓</div>
          <h1 className={styles.confirmH1}>You're connected.</h1>
          <p className={styles.confirmSub}>
            Your eSIM is ready. Check your email for the QR code — scan it before you land.
          </p>

          {displayPlan && (
            <div className={styles.confirmCard}>
              <h3 className={styles.confirmCardH3}>Order details</h3>
              {order?.order_code && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowKey}>Order code</span>
                  <span className={styles.confirmRowVal} style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '.06em' }}>{order.order_code}</span>
                </div>
              )}
              {displayCountry && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowKey}>Destination</span>
                  <span className={styles.confirmRowVal}>{displayCountry}</span>
                </div>
              )}
              {(order?.data_amount || plan?.data_gb) && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowKey}>Data</span>
                  <span className={styles.confirmRowVal}>{order?.data_amount || `${plan?.data_gb} GB`}</span>
                </div>
              )}
              {(order?.validity_days || plan?.validity_days) && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowKey}>Validity</span>
                  <span className={styles.confirmRowVal}>{order?.validity_days || plan?.validity_days} days</span>
                </div>
              )}
              {(order?.price_sgd || plan?.price_sgd) && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowKey}>Paid</span>
                  <span className={styles.confirmRowVal}>SGD {parseFloat(order?.price_sgd || plan?.price_sgd).toFixed(2)}</span>
                </div>
              )}
              {order?.qr_url && (
                <a href={order.qr_url} target="_blank" rel="noreferrer" className={styles.btnPrimary} style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>
                  View QR code →
                </a>
              )}
              {order?.order_code && (
                <button
                  type="button"
                  onClick={() => generateReceiptPDF(order)}
                  className={styles.btnOutline}
                  style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 10 }}
                >
                  Download receipt (PDF) ⬇
                </button>
              )}
            </div>
          )}

          <div className={styles.confirmBtns}>
            <button className={styles.btnPrimary} onClick={() => navigate('/purchases')}>
              View all purchases
            </button>
            <button className={styles.btnOutline} onClick={() => navigate('/itinerary')}>
              Plan my itinerary
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
