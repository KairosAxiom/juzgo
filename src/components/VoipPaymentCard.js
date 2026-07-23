import React, { useState, useEffect, useCallback } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { stripePromise } from '../lib/stripe';
import styles from './VoipPaymentCard.module.css';

/* ------------------------------------------------------------------
   VoipPaymentCard

   Self-contained, self-fetching card-on-file component. Brings its own
   <Elements> wrapper because the app has no app-level provider —
   Wallet.js, Checkout.js and CorporateDashboard.js each wrap their own.

   Talks to Server/routes/payment-methods.js:
     POST /payment-methods/setup-intent  -> { client_secret }
     POST /payment-methods/attach        -> { success, card }
     GET  /payment-methods               -> { has_card, card }
     DELETE /payment-methods             -> refuses while a live VOIP
                                            number is held

   Card details never touch our server: confirmCardSetup() is
   client-side only, and we post nothing but the resulting
   payment_method id. Keeps Juzgo outside PCI scope.
   ------------------------------------------------------------------ */

const BACKEND =
  process.env.REACT_APP_BACKEND_URL || 'https://esimconnect-backend.onrender.com';

// hidePostalCode: true is required — Singapore/HK cards have no ZIP and
// Stripe's postal field blocks submission otherwise.
const CARD_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      fontSize: '15px',
      color: '#0f1720',
      fontFamily: 'inherit',
      '::placeholder': { color: '#9aa5b1' },
    },
    invalid: { color: '#a01b1b' },
  },
};

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// Warn ~60 days out. A card that expires mid-rental means a failed
// renewal charge, which starts the dunning cascade for no good reason.
function isExpiringSoon(month, year) {
  if (!month || !year) return false;
  const now = new Date();
  const exp = new Date(year, month, 0); // last day of expiry month
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  return days > 0 && days < 60;
}

function CardForm() {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch(`${BACKEND}/payment-methods`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load payment card');
      setCard(json.has_card ? json.card : null);
      setShowForm(!json.has_card);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const handleSave = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const headers = await authHeaders();

      // Step 1 — SetupIntent (usage: off_session, set server-side).
      const siRes = await fetch(`${BACKEND}/payment-methods/setup-intent`, {
        method: 'POST',
        headers,
      });
      const siJson = await siRes.json();
      if (!siRes.ok) throw new Error(siJson.error || 'Could not start card setup');

      // Step 2 — confirm client-side. Card data goes straight to Stripe.
      const result = await stripe.confirmCardSetup(siJson.client_secret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (result.error) throw new Error(result.error.message);

      // Step 3 — tell the backend which PaymentMethod to make default.
      // The backend re-fetches it from Stripe and checks ownership, so
      // it does not trust anything we send beyond the id.
      const attachRes = await fetch(`${BACKEND}/payment-methods/attach`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ payment_method_id: result.setupIntent.payment_method }),
      });
      const attachJson = await attachRes.json();
      if (!attachRes.ok) throw new Error(attachJson.error || 'Could not save card');

      setCard(attachJson.card);
      setShowForm(false);
      setSuccess('Card saved.');
      elements.getElement(CardElement)?.clear();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const headers = await authHeaders();
      const res = await fetch(`${BACKEND}/payment-methods`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        // Expected case, not a bug: the backend refuses removal while a
        // live VOIP number is held. Surface its message rather than a
        // generic failure toast.
        throw new Error(
          json.error ||
            'This card cannot be removed while you are renting a number. Release the number first.'
        );
      }
      setCard(null);
      setShowForm(true);
      setSuccess('Card removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading payment card…</div>;
  }

  const expiring = card && isExpiringSoon(card.exp_month, card.exp_year);

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {card && (
        <div className={styles.cardOnFile}>
          <span className={styles.brandBadge}>{card.brand || 'card'}</span>
          <div className={styles.cardMeta}>
            <div className={styles.cardNumber}>•••• •••• •••• {card.last4}</div>
            <div className={`${styles.cardExpiry} ${expiring ? styles.expiring : ''}`}>
              Expires {String(card.exp_month).padStart(2, '0')}/{card.exp_year}
              {expiring && ' — expiring soon, replace it to avoid a failed renewal'}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className={styles.cardInputWrap}>
          <CardElement options={CARD_OPTIONS} />
        </div>
      )}

      <div className={styles.actions}>
        {showForm ? (
          <>
            <button
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={busy || !stripe}
            >
              {busy ? 'Saving…' : card ? 'Replace card' : 'Save card'}
            </button>
            {card && (
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setShowForm(false);
                  setError('');
                }}
                disabled={busy}
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            {/* Replace is attach-then-overwrite: /attach updates
                default_payment_method_id unconditionally, so the user is
                never briefly without a card on file. */}
            <button
              className={styles.btnSecondary}
              onClick={() => {
                setShowForm(true);
                setSuccess('');
              }}
              disabled={busy}
            >
              Replace card
            </button>
            <button className={styles.btnDanger} onClick={handleRemove} disabled={busy}>
              {busy ? 'Removing…' : 'Remove card'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function VoipPaymentCard() {
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Payment card for VOIP rental</h3>
      </div>
      <p className={styles.subtitle}>
        Renting a virtual number is a monthly subscription, so a card must be kept on file
        to renew it each month.
      </p>
      <p className={styles.note}>
        This is separate from your wallet balance. Your wallet pays for eSIM data plans and
        can pay for your first month of number rental — but monthly renewals are charged to
        this card, not the wallet.
      </p>
      <Elements stripe={stripePromise}>
        <CardForm />
      </Elements>
    </div>
  );
}
