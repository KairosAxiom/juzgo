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

---

## Plan-finder on /plans: sliders filter the grid, not a separate result list (Session 31)
The slider plan-finder went through three iterations before landing. Original design was a
standalone widget (PlanMatcher) with its own destination dropdown AND its own result cards.
Mounted on /plans that produced two competing result lists — the matcher's cards and
the page's existing catalog grid — showing overlapping plans in two card styles, which was
confusing and duplicative.

Decision: on /plans, the sliders (Data needed / Trip length) are a filter control
over the existing grid, not a second list. Dragging a slider narrows the grid cards to
plans that "cover at least" the requested data AND days. The page already owns destination
search + scope pills + good labelled cards; the sliders add a size/duration narrowing on
top. One result list, reusing working cards.

Trigger: sliders appear only when a destination search is active (search box has text);
empty search shows the plain browsable grid with no sliders. A "See all plans" button
bypasses the slider filter to show the full catalog regardless of slider position.

## Two components, not one over-configurable one: PlanMatcher vs PlanSliders (Session 31)
Rather than make one component do both jobs via flags, split into two:
- PlanSliders — sliders-only, reports values up, filters a host grid. Used on /plans.
- PlanMatcher — standalone hero with own dropdown + own result cards. Built, committed,
  intact, but NOT currently mounted; reserved for a possible Home-page hero ("tell us
  the trip, we'll match a plan" -> links to /plans) where there's no existing grid to filter.

Reasoning: /plans and Home have genuinely different needs (one has a grid already, one
doesn't). A single over-configurable component accumulates prop-driven branches that fight
each other; two focused components each stay simple. Cost is a small amount of duplicated
slider/ruler code, accepted deliberately.

## Slider notch spacing: equal-but-capped, never proportional-by-value (Session 31)
Notches are spaced evenly (equal pixels between each), with the gap capped (~92px) so
few-notch sliders render tight/left-aligned rather than stretching a handful of notches
across the full panel width. Sliders with more notches naturally render wider — the two
sliders may differ in width, which is fine.

Rejected: true proportional-by-value spacing (notch position = its data value). Two
reasons it's unusable here: (1) "Unlimited" is Infinity and has no position on a value
axis — it literally cannot be placed proportionally; (2) proportional spacing crams the
common small tiers (1/2/3/5 GB) into a tiny left segment and leaves a huge gap to 50 GB,
making the most-used plans the hardest to select. Equal spacing gives every notch an equal
click target regardless of value gaps — the whole point of a notched selector. This
matches the original prototype's "spacing is the same" annotation.
