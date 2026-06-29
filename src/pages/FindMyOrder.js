import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Pages.module.css';

export default function FindMyOrder() {
  const [email, setEmail] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFind(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .eq('order_code', orderCode.trim().toUpperCase())
      .eq('customer_email', email.trim().toLowerCase())
      .single();

    setLoading(false);
    if (err || !data) { setError('No order found. Please check your email and order code.'); return; }
    setResult(data);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.eyebrow}>Guest lookup</div>
        <h1 className={styles.h1}>Find My Order</h1>
        <p className={styles.sub}>Retrieve your eSIM QR code using your email and order code.</p>

        <div className={styles.findCard}>
          <h2 className={styles.findH2}>Retrieve your order</h2>
          <p className={styles.findSub}>Your order code was included in your confirmation email.</p>

          <form onSubmit={handleFind}>
            <label className={styles.label}>Email address</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              required
            />

            <label className={styles.label}>Order code</label>
            <input
              type="text"
              placeholder="JZ-XXXXXXXX"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value.toUpperCase())}
              className={styles.input}
              required
              style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '.08em' }}
            />

            {error && <div className={styles.error}>{error}</div>}

            <button
              type="submit"
              className={styles.btnPrimary}
              style={{ marginTop: 22, width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Searching…' : 'Find my order →'}
            </button>
          </form>

          {result && (
            <div className={styles.resultCard}>
              <div className={styles.resultTitle}>{result.package_title || `${result.country_name} eSIM`}</div>
              <div className={styles.resultRow}><span className={styles.resultKey}>Order code</span><span className={styles.resultVal}>{result.order_code}</span></div>
              <div className={styles.resultRow}><span className={styles.resultKey}>Country</span><span className={styles.resultVal}>{result.country_name}</span></div>
              <div className={styles.resultRow}><span className={styles.resultKey}>Data</span><span className={styles.resultVal}>{result.data_amount}</span></div>
              <div className={styles.resultRow}><span className={styles.resultKey}>Validity</span><span className={styles.resultVal}>{result.validity_days} days</span></div>
              <div className={styles.resultRow}><span className={styles.resultKey}>Status</span><span className={styles.resultVal}>{result.status}</span></div>
              {result.qr_url && (
                <a href={result.qr_url} target="_blank" rel="noreferrer" className={styles.btnPrimary} style={{ display: 'block', textAlign: 'center', marginTop: 18 }}>
                  View QR code →
                </a>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
