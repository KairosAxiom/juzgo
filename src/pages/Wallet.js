import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import styles from './Wallet.module.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const TOP_UP_AMOUNTS = [10, 20, 50, 100];

function WalletForm({ profile, onTopUpSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState(20);
  const [customAmt, setCustomAmt] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const finalAmount = customAmt ? parseFloat(customAmt) : amount;

  async function handleTopUp(e) {
    e.preventDefault();
    setError('');
    if (!finalAmount || finalAmount < 5) { setError('Minimum top-up is SGD 5.'); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backend = process.env.REACT_APP_BACKEND_URL;
      // /wallet/create-topup-intent never existed — /create-payment-intent
      // is the real endpoint, and the webhook already has full logic to
      // credit profiles.wallet_balance on payment_intent.succeeded.
      const res = await fetch(`${backend}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          amount: Math.round(finalAmount * 100),
          currency: 'sgd',
          userId: session.user.id,
        }),
      });
      const { clientSecret } = await res.json();
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (result.error) throw new Error(result.error.message);
      setSuccess(true);
      // The webhook credits the balance asynchronously (usually within a
      // couple seconds) — give it a moment, then refresh the displayed
      // balance so the person isn't left staring at a stale number.
      setTimeout(() => onTopUpSuccess?.(), 2500);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h3 className={styles.successH3}>Top-up successful!</h3>
        <p className={styles.successSub}>SGD {finalAmount.toFixed(2)} has been added to your Juzgo Wallet.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleTopUp} className={styles.form}>
      <label className={styles.label}>Select amount</label>
      <div className={styles.amountGrid}>
        {TOP_UP_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            className={`${styles.amountBtn} ${amount === a && !customAmt ? styles.amountBtnActive : ''}`}
            onClick={() => { setAmount(a); setCustomAmt(''); }}
          >
            SGD {a}
          </button>
        ))}
      </div>

      <label className={styles.label} style={{ marginTop: 16 }}>Or enter custom amount</label>
      <div className={styles.customRow}>
        <span className={styles.customPrefix}>SGD</span>
        <input
          type="number"
          placeholder="0.00"
          value={customAmt}
          onChange={(e) => setCustomAmt(e.target.value)}
          className={styles.customInput}
          min="5"
          step="0.01"
        />
      </div>

      <hr className={styles.divider} />

      <label className={styles.label}>Card details</label>
      <div className={styles.cardElement}>
        <CardElement options={{ style: { base: { fontFamily: 'Hanken Grotesk, sans-serif', fontSize: '15px', color: '#16271E', '::placeholder': { color: '#9AA89F' } } } }} />
      </div>

      <div className={styles.secureNote}>🔒 Payments are encrypted and secure</div>

      {error && <div className={styles.error}>{error}</div>}

      <button type="submit" className={styles.btnSubmit} disabled={loading || !stripe}>
        {loading ? 'Processing…' : `Top up SGD ${finalAmount > 0 ? finalAmount.toFixed(2) : '—'} →`}
      </button>
    </form>
  );
}

export default function Wallet() {
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();

  function refreshProfile() {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data }) => setProfile(data));
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      supabase.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data }) => setProfile(data));
    });
  }, []);

  // Corp-linked accounts (Session 20) are work-purchasing only — no
  // personal wallet to top up. Redirect rather than showing a form that
  // wouldn't do anything useful for them.
  if (profile?.is_corporate) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.eyebrow}>eWallet</div>
          <h1 className={styles.h1}>Not available</h1>
          <p className={styles.sub}>
            Your account is linked to a corporate wallet — purchases are drawn from
            your company's balance automatically at checkout. For your own personal
            travel plans, register a separate personal account with a non-work email.
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.eyebrow}>eWallet</div>
        <h1 className={styles.h1}>Juzgo Wallet</h1>
        <p className={styles.sub}>Top up your balance and use it instantly at checkout.</p>

        <div className={styles.layout}>
          {/* Balance card */}
          <div className={styles.balanceCard}>
            <div className={styles.balanceLabel}>Current balance</div>
            <div className={styles.balanceAmount}>
              <span className={styles.balanceCurrency}>SGD</span>
              <span className={styles.balanceNum}>{parseFloat(profile?.wallet_balance || 0).toFixed(2)}</span>
            </div>
            <div className={styles.balanceFooter}>Available for checkout</div>
          </div>

          {/* Top up form */}
          <div className={styles.topUpCard}>
            <h2 className={styles.topUpH2}>Add funds</h2>
            <Elements stripe={stripePromise}>
              <WalletForm profile={profile} onTopUpSuccess={refreshProfile} />
            </Elements>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
