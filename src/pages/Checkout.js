import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { useLang, t } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './Checkout.module.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const STEPS = ['Details', 'Review', 'Payment'];

function CheckoutForm({ plan, country, user, walletBalance }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { lang } = useLang();

  const [payMethod, setPayMethod] = useState('card');
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const price = parseFloat(plan?.price_sgd || 0);
  const total = Math.max(0, price - discount).toFixed(2);

  async function applyPromo() {
    if (!promoCode.trim()) return;
    const backend = process.env.REACT_APP_BACKEND_URL;
    const res = await fetch(`${backend}/reseller/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
    });
    const data = await res.json();
    if (data.valid) {
      setPromoApplied(data);
      setDiscount(data.discount_value || 0);
    } else {
      setError('Invalid or expired code.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const backend = process.env.REACT_APP_BACKEND_URL;
      if (payMethod === 'wallet') {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${backend}/order/wallet-pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ planId: plan.id, promoCode: promoCode || null }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Payment failed');
        navigate('/order-confirmation', { state: { order: data.order } });
      } else {
        const res = await fetch(`${backend}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(parseFloat(total) * 100), currency: 'sgd', planId: plan.id }),
        });
        const { clientSecret } = await res.json();
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: elements.getElement(CardElement), billing_details: { name, email } },
        });
        if (result.error) throw new Error(result.error.message);
        navigate('/order-confirmation', { state: { paymentIntent: result.paymentIntent, plan, country, promoCode } });
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Step indicator */}
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={styles.stepItem}>
              <span className={`${styles.stepDot} ${step > i + 1 ? styles.stepDone : step === i + 1 ? styles.stepActive : ''}`}>
                {step > i + 1 ? '✓' : i + 1}
              </span>
              <span className={`${styles.stepLabel} ${step === i + 1 ? styles.stepLabelActive : ''}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <span className={styles.stepLine} />}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.cols}>
        {/* Order summary */}
        <div className={styles.card}>
          <h2 className={styles.cardH2}>Order summary</h2>
          <p className={styles.cardSub}>Your QR code is emailed instantly after payment.</p>

          {plan && (
            <div className={styles.cartItem}>
              <span className={styles.cartFlag}>{country?.flag_emoji}</span>
              <div className={styles.cartDetails}>
                <div className={styles.cartName}>{plan.plan_name || `${country?.name} eSIM`}</div>
                <div className={styles.cartMeta}>{plan.data_gb >= 100 ? 'Unlimited' : `${plan.data_gb} GB`} · {plan.validity_days} days</div>
              </div>
              <div className={styles.cartPrice}>SGD {price.toFixed(2)}</div>
            </div>
          )}

          {/* Promo code */}
          <div className={styles.promoWrap}>
            <label className={styles.label}>Referral / promo code <span className={styles.optional}>(optional)</span></label>
            <div className={styles.promoRow}>
              <input
                type="text"
                placeholder="SG-JOHN-00001"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className={`${styles.input} ${styles.inputMono}`}
                disabled={!!promoApplied}
              />
              <button type="button" onClick={applyPromo} className={styles.btnApply} disabled={!!promoApplied}>
                {promoApplied ? 'Applied ✓' : 'Apply'}
              </button>
            </div>
          </div>

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span><span>SGD {price.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className={`${styles.totalRow} ${styles.totalDiscount}`}>
                <span>Discount ({promoCode})</span><span>− SGD {discount.toFixed(2)}</span>
              </div>
            )}
            <div className={styles.totalFinal}>
              <span>Total</span>
              <span className={styles.totalAmt}>SGD {total}</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className={styles.card}>
          <h2 className={styles.cardH2}>Payment</h2>

          {/* Card option */}
          <div
            className={`${styles.payOption} ${payMethod === 'card' ? styles.payOptionActive : ''}`}
            onClick={() => setPayMethod('card')}
          >
            <div className={styles.payOptionLeft}>
              <span className={styles.payIcon}>🏦</span>
              <span className={styles.payLabel}>Credit / debit card</span>
            </div>
            <span className={`${styles.radio} ${payMethod === 'card' ? styles.radioActive : ''}`} />
          </div>

          {/* Wallet option */}
          {user && (
            <div
              className={`${styles.payOption} ${payMethod === 'wallet' ? styles.payOptionActive : ''}`}
              onClick={() => setPayMethod('wallet')}
            >
              <div className={styles.payOptionLeft}>
                <span className={styles.payIcon}>💳</span>
                <div>
                  <div className={styles.payLabel}>Juzgo Wallet</div>
                  <div className={styles.payMeta}>Balance: SGD {parseFloat(walletBalance || 0).toFixed(2)}</div>
                </div>
              </div>
              <span className={`${styles.radio} ${payMethod === 'wallet' ? styles.radioActive : ''}`} />
            </div>
          )}

          {/* Card fields */}
          {payMethod === 'card' && (
            <div className={styles.cardFields}>
              <label className={styles.label}>Name on card</label>
              <input type="text" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className={styles.input} required />
              <label className={styles.label}>Email</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} required />
              <label className={styles.label}>Card details</label>
              <div className={styles.cardElement}>
                <CardElement options={{ style: { base: { fontFamily: 'Hanken Grotesk, sans-serif', fontSize: '15px', color: '#16271E', '::placeholder': { color: '#9AA89F' } } } }} />
              </div>
            </div>
          )}

          {payMethod === 'wallet' && (
            <div className={styles.walletInfo}>
              Paying with your Juzgo Wallet. <strong>SGD {total}</strong> will be deducted, leaving <strong>SGD {(parseFloat(walletBalance || 0) - parseFloat(total)).toFixed(2)}</strong>.
            </div>
          )}

          <div className={styles.secureNote}>🔒 Payments are encrypted and secure</div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btnSubmit} disabled={loading || !stripe}>
            {loading ? 'Processing…' : `Get my eSIM · SGD ${total} →`}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, country } = location.state || {};
  const [user, setUser] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    if (!plan) navigate('/plans');
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchWallet(session.user.id);
    });
  }, []);

  async function fetchWallet(userId) {
    const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single();
    if (data) setWalletBalance(data.wallet_balance);
  }

  if (!plan) return null;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Elements stripe={stripePromise}>
          <CheckoutForm plan={plan} country={country} user={user} walletBalance={walletBalance} />
        </Elements>
      </main>
      <Footer />
    </div>
  );
}
