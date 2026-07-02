# Juzgo — Decisions Log

This file tracks architectural / design decisions that aren't obvious from the code alone — the "why," not just the "what." CONTEXT.md tracks state and session history; this file tracks reasoning that should survive even if the code around it changes.

---

## Open — Card-payment order-fulfillment + email flow (raised Session 17)

**Problem:** Checkout.js's card-payment branch confirms payment with Stripe client-side, then navigates to `/order-confirmation` with local React state. No order row is created, no QR/eSIM is provisioned, no confirmation email is sent. This was only discovered because the email genuinely never arrived in a real test purchase — the UI shows a convincing success page regardless, since it renders from local state that's populated the moment Stripe returns success, independent of any backend fulfillment.

**Decision needed:** where should order creation + fulfillment + email actually be triggered from? Two real options:

1. **Stripe webhook (`/webhook`, `payment_intent.succeeded`)** — server-side, reliable even if the user closes the tab immediately after paying. Would need a new branch in the webhook handler (today it only handles `corp_wallet_topup` and personal wallet top-up metadata types) that creates the `orders` row, calls the worker for QR/eSIM provisioning, and sends the email. Requires `/create-payment-intent` to pass enough metadata (at minimum `planId`, and something like `source: 'plan_purchase'`) so the webhook can tell a plan purchase apart from a wallet top-up — today `/create-payment-intent`'s metadata always hardcodes `source: 'wallet_topup'` regardless of caller, which is itself a latent bug once two different flows share one endpoint.

2. **Client-side call after `stripe.confirmCardPayment()` resolves** — simpler to build, matches the existing (broken) pattern of the wallet branch calling `/order/wallet-pay`. Faster to ship but fragile: if the user closes the tab, loses connection, or the request fails silently between payment success and the fulfillment call, the customer has paid but has no order, no QR, and no email — with no server-side record that anything went wrong.

**Leaning:** webhook-based is the more correct answer for anything handling real money, since it doesn't depend on the client staying alive or the network cooperating after the charge already succeeded. Client-side is tempting only because `/order/wallet-pay` already assumes that pattern for wallet payments — but that route doesn't exist yet either (confirmed 404 in Session 17), so nothing is actually locked in by precedent. Worth deciding once, consistently, for both payment methods rather than solving it twice.

**Blocking this decision:** haven't yet reviewed the Cloudflare Worker's current `/airalo/orders` code (dashboard-managed, no wrangler.toml in repo) to see what it already expects as input for QR/eSIM provisioning — that shapes what the webhook (or client-side call) needs to send it.

**Also needs resolving alongside this:** `/order/wallet-pay` is called by Checkout.js but doesn't exist in server.js at all. Whatever pattern gets chosen for card payments should probably be mirrored for wallet payments rather than building two different fulfillment mechanisms.

---
