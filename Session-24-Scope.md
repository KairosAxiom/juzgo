# Session 24 — Scope Brief

Written at the end of Session 23 to make the next session's kickoff fast: read this,
pick a direction, go. Full detail behind every point here lives in `CONTEXT.md`'s
Session 23 log if you want the "why," not just the "what."

---

## Two candidate directions — pick one

### Option A: Real eSIM fulfillment
**What it is:** Wire the Cloudflare Worker's `/airalo/orders` to Airalo's actual
order-submission API, so a purchase produces a real ICCID and a real installable QR
code instead of the current mock.

**Why it matters more than it looks:** every purchase Juzgo has ever processed —
across the entire life of the product, not just this workstream — has resulted in a
fake eSIM. No customer has ever been able to actually install what they paid for. This
is the actual pre-launch blocker, not a nice-to-have.

**What it unlocks:** Step 6 of the Airalo build order (Check/Verify button in My
Purchases) becomes buildable — it needs a real ICCID to check, which doesn't exist
without this.

**Rough shape of the work:**
1. Add `AIRALO_CLIENT_ID` / `AIRALO_CLIENT_SECRET` as Worker secrets (Cloudflare
   dashboard → Worker settings → Variables). Same credentials already in
   `Server/.env`.
2. Replace the mock logic inside `/airalo/orders` (currently: hardcoded
   `MOCK_PACKAGES` lookup → `generateMockIccid()` → `generateMockQrUrl()`) with a real
   `POST` to Airalo's order-submission endpoint. Airalo's docs: same base URL
   (`partners-api.airalo.com`) for sandbox and production, no separate mode switch.
3. Decide the request shape: does the worker take a `package_id` and look up pricing
   itself, or does `server.js` pass everything it already knows (it now has real
   package details via `getActivePlanForCheckout()`)? Leaning toward `server.js`
   passing what it has — the worker shouldn't need its own copy of catalog logic.
4. Wire `Server/server.js`'s three order-creation endpoints (`/order/create`,
   `/order/wallet-pay`, `/order/corp-wallet-pay`) to actually call the worker after
   writing the order row, and update that row with the real `iccid`/`qr_url` that come
   back. Currently nothing sets these columns at all.
5. Send the real QR in a follow-up email — every confirmation email today promises
   "Your eSIM QR code will follow in a separate email shortly," and nothing currently
   fulfills that promise.
6. Test in sandbox: buy a real (sandbox) plan, confirm a real ICCID comes back,
   confirm the QR email sends. Full device-install verification only works once
   switched to Production — sandbox responses use dummy `matching_id`/QR data by
   design, so don't expect a real phone to accept a sandbox QR.
7. **Worth an early empirical test, flagged since Session 22 and still untested:**
   whether topup actually works on an already-expired ICCID — Airalo's own help
   content was inconsistent on this. Buy a short-validity plan, let it lapse, attempt
   a topup, see what actually happens. This directly informs the Check/Verify button's
   three-state logic (Top Up available / Buy New / Expired–Buy New) whenever that gets
   built.

**Then, only after fulfillment is real:** Step 6, the Check/Verify button itself
(admin spec §6.3) — a new `GET /esim/:iccid/check` endpoint calling Airalo's live
usage/package-history endpoint (rate-limited to 1 call per 15 min per ICCID — fine for
a user-tap button, not a background job), returning one of three states, cached in
`orders.esim_status_last_checked`/`esim_status_checked_at` for display only.

---

### Option B: "Your Request" AI search
**What it is:** A free-text search box for when nothing in the curated catalog fits a
customer's trip — reuses the existing `claude-proxy` Worker pattern (same shape as the
itinerary AI planner).

**Design already decided in Session 23** (see `CONTEXT.md` Pre-Launch Checklist for
full detail — summarized here):
- Searches the *full* `airalo_catalog`, not just curated (`is_active = true`) packages.
- **Deliberately a second, parallel purchase channel that bypasses the normal "Sell?"
  curation gate.** Confirmed explicitly by David, not an oversight — a package can be
  shown with a real price and be directly buyable through this flow without ever being
  activated via the Admin Catalog & Pricing tab.
- Auto-price default for anything never priced before: the floor
  (`minimum_selling_price_sgd`) — same default the Admin Portal already uses.
- Needs its own checkout path, since the existing `getActivePlanForCheckout()` helper
  deliberately hard-requires `is_active = true` — that guard is correct for the normal
  storefront and must stay; this needs a parallel variant, not a loosened original.

**Rough shape of the work:**
1. New backend endpoint: takes free text, searches `airalo_catalog` broadly (keyword +
   `country_coverage_index` reverse lookup — same technique already built for Admin/
   storefront search), sends matches + the request to Claude via the worker, gets back
   a natural-language recommendation.
2. New frontend chat-style component (likely on `/plans`).
3. New checkout variant that accepts a package outside the normal curated set,
   auto-creating a `juzgo_selected_plans` row at the floor price if one doesn't exist
   yet (or handling pricing without writing that row at all — worth deciding at build
   time whether "shown once via Your Request" should also make it discoverable via the
   normal `/plans` search afterward, or stay a one-off).
4. Decide and build whatever review/visibility David wants into purchases made this
   way, since they bypass his normal curation review entirely.

---

## Recommendation
Option A first. Real fulfillment is the actual pre-launch blocker — it affects every
customer, not just ones who can't find what they want, and it's been silently broken
since before this workstream even started. "Your Request" is a genuine growth feature,
but it's additive on top of a working foundation; fulfillment is the foundation.

That said, no strong objection to B first if there's a business reason (e.g. a
specific customer need) to prioritize it — just flagging the asymmetry in urgency.

---

## Before starting either
- Read this file, then `CONTEXT.md`'s Session 23 log for full context.
- Confirm current git status matches what Session 23 left (`3be1a874` + the CONTEXT.md
  commit) before making changes, per the usual `ls -la`/`grep -c`/`git status`
  discipline.
