import { loadStripe } from '@stripe/stripe-js';

// Single shared Stripe.js promise.
//
// Wallet.js, Checkout.js and CorporateDashboard.js each still call
// loadStripe() themselves at module scope. Those can migrate to this
// import later — a one-line change each, low risk, but not required
// for anything to work today.
//
// The point of centralising is that loadStripe() injects Stripe.js into
// the page; calling it N times is wasteful and can behave oddly.
export const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
