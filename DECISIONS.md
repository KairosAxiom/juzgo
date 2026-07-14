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

# Decisions — Airalo integration (append to DECISIONS.md)

## Pricing floor is a hard constraint, shared across all Airalo partners
Airalo's "Recommended retail price" field is, despite the name, the enforced **minimum
selling price** — confirmed via Airalo's own FAQ. No partner (Juzgo included) can sell
below it. Since every Airalo reseller shares the same floor, undercutting on price alone
cannot be a durable competitive edge for identical packages. `your_price` in
`juzgo_selected_plans` must be validated >= `minimum_selling_price` at both the Admin
Portal UI layer and the database layer (CHECK constraint), not just client-side.

## No custom bundle creation via the Airalo API
Confirmed no endpoint exists to create new packages or custom country combinations.
Partners resell Airalo's pre-defined catalog only, with pricing control above the floor.
Decision: do not pursue "build your own bundle" as a feature — it isn't supported by the
underlying API.

## Coverage curation is display-only, must not misrepresent technical coverage
Showing a subset of a bundle's countries (e.g. highlighting fewer countries than the real
Asia bundle actually covers) is a legitimate Juzgo-side presentation choice, but the
underlying eSIM's real network coverage is unchanged — the eSIM will likely still connect
in "excluded" countries. Decision: any curated display must be framed as a
recommendation/highlight ("Popular for: ..."), never as a coverage claim, and the full
accurate country list must remain one click away via "View all countries."

## v1 scope: sim (new purchase) flow before topup
Topup requires tracking which ICCID a recharge applies to and checking rechargeability +
grace-window state — meaningfully more complex than a standalone new-eSIM purchase.
Decision: build and ship the sim/new-purchase flow first; topup is a fast-follow once
that loop (catalog → order → QR delivery) is working end-to-end.

## Check/Verify eSIM status must always be a live Airalo call, never inferred locally
Topup-after-expiry grace-window behavior varies by operator and had conflicting signals
in Airalo's own help content. Decision: the Check button always calls Airalo's live
usage/package-history endpoint on tap; Juzgo never calculates Expired/Top-Up/Buy-New
state from a locally stored date. Cached status may be shown for display only ("last
checked X ago"), never as a substitute for a fresh check.

## Search UX: three scope filters (Country/Region/Global) + cross-scope search
Decision: search by place name returns results grouped by scope (narrowest to broadest),
with filter pills able to narrow to one scope. Requires a reverse-lookup index
(country -> package_ids) built at catalog sync time from exploding each bundle's
`coverages` array — not computed live per search. (Open: whether searching a region name
should also surface nested per-country alternatives — not yet decided.)

## Competitive positioning: UX execution, not any single feature, is the differentiator
Reviewed non-Airalo-partner competitors (Holafly, Saily, Nomad, GigSky, etc.). Top-up and
fair-use-throttled "unlimited" data are both industry-standard, not differentiators.
Decision: do not market Top Up or Check/Verify as headline unique features — treat them
as baseline quality-of-experience work. Juzgo's realistic edge is pricing transparency
(clearly surfacing fair-use terms per package, given ~38% of the catalog is Unlimited-type)
and overall execution polish, not any single capability competitors lack.


---
