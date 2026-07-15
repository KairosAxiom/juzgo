import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { useLang } from '../lib/i18n';
import Footer from '../components/Footer';
import styles from './Checkout.module.css';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const STEPS = ['Details', 'Review', 'Payment'];

function CheckoutForm({ plan, country, user, walletBalance, isCorporate, corpWallet }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { lang, t } = useLang();

  const [payMethod, setPayMethod] = useState('card');
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const [corpFallbackCard, setCorpFallbackCard] = useState(false);

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
      if (isCorporate && !corpFallbackCard) {
        // Corp-linked accounts (Session 20): default path draws from the
        // org's pooled wallet automatically. If the balance can't cover it,
        // offer a one-off self-pay-by-card fallback (Session 21) rather
        // than leaving the person stuck — this does NOT touch the corp
        // wallet at all; it's routed through the normal personal card flow
        // below (see corpFallbackCard branch), so it books as an ordinary
        // personal card purchase, not a corp transaction.
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${backend}/order/corp-wallet-pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ planId: plan.id }),
        });
        const data = await res.json();
        if (!data.success) {
          if (res.status === 402) setInsufficientBalance(true);
          throw new Error(data.error || 'Payment failed');
        }
        navigate('/order-confirmation', { state: { order: data.order } });
      } else if (!isCorporate && payMethod === 'wallet') {
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
          body: JSON.stringify({
            amount: Math.round(parseFloat(total) * 100),
            currency: 'sgd',
            planId: plan.id,
            userId: user?.id || null,
            type: 'plan_purchase',
          }),
        });
        const { clientSecret } = await res.json();
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: elements.getElement(CardElement), billing_details: { name, email } },
        });
        if (result.error) throw new Error(result.error.message);

        // Payment has succeeded at this point — the card has been charged.
        // Now create the actual order record and trigger the confirmation
        // email. If this step fails, we do NOT show the person an error
        // (they were already charged); we log it for follow-up and still
        // take them to the confirmation page, which falls back to the plan/
        // country details it already has so they still see what they bought.
        let order = null;
        try {
          const orderRes = await fetch(`${backend}/order/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId: result.paymentIntent.id,
              planId: plan.id,
              countryName: country?.name,
              countryCode: country?.code || country?.country_code || null,
              customerEmail: email,
              customerName: name,
              userId: user?.id || null,
              promoCode: promoApplied ? promoCode : null,
              priceSgd: total,
            }),
          });
          const orderData = await orderRes.json();
          if (orderRes.ok) {
            order = orderData.order;
          } else {
            console.error('Order creation failed:', orderData.error);
          }
        } catch (orderErr) {
          console.error('Order creation request failed:', orderErr);
        }

        navigate('/order-confirmation', { state: { order, paymentIntent: result.paymentIntent, plan, country, promoCode } });
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
                <div className={styles.cartMeta}>{plan.data_amount} · {plan.validity_days} days</div>
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

          {isCorporate && !corpFallbackCard ? (
            // Corp-linked accounts: default view — no payment choice, every
            // purchase draws from the org's wallet automatically. If the
            // balance looks short (client-side check) or an attempt just
            // came back insufficient (402), offer a self-pay-by-card
            // fallback instead of leaving the person stuck (Session 21).
            <div className={styles.walletInfo}>
              Paying from your <strong>corporate wallet</strong>. <strong>SGD {total}</strong> will
              be deducted from your company's balance
              {corpWallet != null && (
                <> (currently <strong>SGD {parseFloat(corpWallet).toFixed(2)}</strong>)</>
              )}.
              {corpWallet != null && parseFloat(corpWallet) < parseFloat(total) && (
                <div className={styles.error} style={{ marginTop: 10 }}>
                  Your company's wallet balance may not cover this — contact your admin if the purchase fails.
                </div>
              )}
              {(insufficientBalance || (corpWallet != null && parseFloat(corpWallet) < parseFloat(total))) && (
                <button
                  type="button"
                  className={styles.btnFallback}
                  onClick={() => { setError(''); setInsufficientBalance(false); setCorpFallbackCard(true); }}
                >
                  Would you like to pay by Credit Card? · SGD {total} →
                </button>
              )}
            </div>
          ) : isCorporate && corpFallbackCard ? (
            // Corp-linked account, self-paying by personal card. This is a
            // plain personal card purchase — the corp wallet isn't touched
            // at all, and it doesn't show up in the org's spend.
            <>
              <div className={styles.walletInfo} style={{ marginBottom: 16 }}>
                Paying <strong>yourself</strong> by card — this won't touch {corpWallet != null ? "your company's" : 'the corporate'} wallet.
              </div>
              <div className={styles.cardFields} style={{ marginTop: 0 }}>
                <label className={styles.label}>Name on card</label>
                <input type="text" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className={styles.input} required />
                <label className={styles.label}>Email</label>
                <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} required />
                <label className={styles.label}>Card details</label>
                <div className={styles.cardElement}>
                  <CardElement options={{ hidePostalCode: true, style: { base: { fontFamily: 'Hanken Grotesk, sans-serif', fontSize: '15px', color: '#16271E', '::placeholder': { color: '#9AA89F' } } } }} />
                </div>
              </div>
              <button type="button" className={styles.btnBackLink} onClick={() => { setError(''); setCorpFallbackCard(false); }}>
                ← Back to company wallet
              </button>
            </>
          ) : (
            <>
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
                    <CardElement options={{ hidePostalCode: true, style: { base: { fontFamily: 'Hanken Grotesk, sans-serif', fontSize: '15px', color: '#16271E', '::placeholder': { color: '#9AA89F' } } } }} />
                  </div>
                </div>
              )}

              {payMethod === 'wallet' && (
                <div className={styles.walletInfo}>
                  Paying with your Juzgo Wallet. <strong>SGD {total}</strong> will be deducted, leaving <strong>SGD {(parseFloat(walletBalance || 0) - parseFloat(total)).toFixed(2)}</strong>.
                </div>
              )}
            </>
          )}

          <div className={styles.secureNote}>🔒 Payments are encrypted and secure</div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btnSubmit} disabled={loading || ((!isCorporate || corpFallbackCard) && !stripe)}>
            {loading ? 'Processing…' : isCorporate && !corpFallbackCard ? `Confirm purchase · SGD ${total} →` : `Get my eSIM · SGD ${total} →`}
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
  const [isCorporate, setIsCorporate] = useState(false);
  const [corpWallet, setCorpWallet] = useState(null);

  useEffect(() => {
    if (!plan) navigate('/plans');
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchWallet(session.user.id, session.access_token);
    });
  }, []);

  async function fetchWallet(userId, accessToken) {
    const { data } = await supabase.from('profiles').select('wallet_balance, is_corporate').eq('id', userId).single();
    if (data) {
      setWalletBalance(data.wallet_balance);
      setIsCorporate(!!data.is_corporate);
      if (data.is_corporate) {
        const backend = process.env.REACT_APP_BACKEND_URL;
        const res = await fetch(`${backend}/corporate/wallet-balance`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const corpData = await res.json();
        if (res.ok) setCorpWallet(corpData.wallet_balance);
      }
    }
  }

  if (!plan) return null;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Elements stripe={stripePromise}>
          <CheckoutForm plan={plan} country={country} user={user} walletBalance={walletBalance} isCorporate={isCorporate} corpWallet={corpWallet} />
        </Elements>
      </main>
      <Footer />
    </div>
  );
}
