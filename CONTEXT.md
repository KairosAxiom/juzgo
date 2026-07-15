# Juzgo — Living Project Context
Last updated: July 9, 2026 (Session 21)
Latest commit: 18e5ef4f — "Pin typescript to 4.9.5 (react-scripts peer range) to fix npm ci lockfile drift" (confirmed live in Cloudflare Pages Production, build succeeded)

---

## ⚠️ Pre-Launch Checklist (do NOT go live without these)
- **Wire up real eSIM QR provisioning.** Confirmation emails (card, wallet, and corp-wallet purchases) still say "Your eSIM QR code will follow in a separate email shortly" — nothing sends that follow-up yet. `qr_url` is left null on every order. Safe while only testers are using the site; needs the Cloudflare worker's `/airalo/orders` endpoint reviewed and wired in before real launch. **No longer blocked on registration** — Airalo company registration is complete, sandbox API access confirmed working, API credentials (client_id/client_secret) obtained from the Partner Platform. Sandbox order flow reportedly works end-to-end except real QR code activation on a physical device, which is expected sandbox behavior (dummy/test values in sandbox responses) rather than a bug — full device-install verification only happens once switched to Production. **Now the one real remaining pre-launch blocker is actual coding/integration work, not registration status.** See `Context-Airalo-Integration.md` for the full scope, schema design, and open items before starting this build.
- ~~Build the Admin Corporate approval tab.~~ — **DONE + fully live-tested Session 21**, including Suspend/Reactivate (David tested directly). Registration → pending → Approve → Suspend → Reactivate, all confirmed working end to end.
- ~~Password strength enforcement on registration forms~~ — **DONE Session 21.** `Register.js` now also requires at least one letter and one number in addition to the existing ≥8 char minimum.
- ~~Old orphaned test data cleanup~~ — **DONE Session 21.** `migrations/cleanup-session21.sql` run + a follow-up one-off fix for `davidlim@juzgo.world` (see Session 21 log Part 3). `corporates` test rows gone, profile fully cleared.
- ~~Insufficient-corp-wallet-balance path~~ — **DONE + live-tested Session 21.** Reviewed clean, then extended per David's request with a self-pay-by-card fallback (Part 7) — live-tested working end to end on `corptest@juzgo.world`.
- ~~Corp Portal wallet vs. self-paid spend accounting~~ — **DONE Session 21** (Part 8). Staff self-pay-by-card orders were already visible in the Corp Portal (backend returns all staff orders regardless of payment method) but were silently inflating "Total Spend." Now split into Wallet Spend / Staff Self-Paid with a Payment column badge, live-tested.
- ~~Downloadable purchase receipts~~ — **DONE Session 21** (Part 9). PDF receipts on OrderConfirmation + Purchases, live-tested. Uncovered and fixed a real `npm ci` / TypeScript peer-dependency lockfile bug along the way (see Part 9 — worth reading if any future `npm install` work hits build failures).
- ~~Fix or remove `/order/wallet-pay` (404)~~ — DONE Session 18.
- ~~Confirm Render `ADMIN_EMAIL`~~ — confirmed correct, `davidlim@juzgo.world`.
- **Old orders have blank destinations.** Cosmetic, test data only (unchanged from Session 19).
- **Open decision (Session 21, still unresolved):** whether to build the full `organizations`/`org_links` schema from `ORG-UNIFICATION-SPEC.md` (tour agency support) now, or keep the current corporate-only domain-lock and revisit tour agencies once there's an actual prospect. See Session 21 log Part 4 for the reasoning — leaning toward deferring, not yet finalized. This is the only open item besides QR provisioning.

---

## Repository
- Repo: https://github.com/KairosAxiom/juzgo
- Live: https://juzgo.world
- Local: D:\Kairos\juzgo (USB Drive D:)
- Cloudflare Pages project name: esimconnect (internal — cannot rename; confirmed Session 21, Cloudflare Pages project names are permanent post-creation, this is a platform limitation not specific to this project)
- Branch: main
- **Build environment note (Session 21):** Cloudflare's build image runs npm 10.9.2 / node 22.16.0. If regenerating `package-lock.json` locally, match this exactly first (`npm install -g npm@10.9.2`) or `npm ci` can pass locally and still fail the actual Cloudflare deploy — this happened this session, see Session 21 Part 9.

## Supabase
- Project: esimconnect (emsovpcmdnuxrhbyvnvb.supabase.co)
- Org: Kairos Axiom (otrgxsjnnxogpcaydpni)
- Account email: dlimyk@gmail.com
- Tables: corp_invites, corporates, countries, esim_plans, esims, orders, profiles, push_subscriptions, resellers, saved_itineraries, usage_logs, users, voip_calls, waitlist, wallet_topups
- RLS: profiles, wallet_topups, voip_calls, push_subscriptions, resellers, saved_itineraries all have RLS enabled
- saved_itineraries RLS: INSERT + SELECT + DELETE policies for authenticated users (added July 2026)
- Currency: SGD primary, GST 9% applied at checkout
- SMTP: Custom via Resend — host smtp.resend.com, port 465, username resend, sender hello@juzgo.world, sender name Juzgo.World
- Auth: Email confirmation ON — reset password redirects to https://juzgo.world/reset-password

## Resend
- Account: kairos venture (kairosventure.io@gmail.com)
- Domain: juzgo.world — Verified ✓ (Tokyo ap-northeast-1)
- API Key: "juzgo" key (created July 2026 — stored as Supabase SMTP password)
- Sender: hello@juzgo.world

## Stripe
- Account: Kairos Axiom (acct_1TBAKEBOsstkemgx)
- Sandbox: esimconnect sandbox (keys start pk_test_ / sk_test_)
- Live keys: available under Kairos Axiom (sk_live_ — for production later)
- Currency: SGD
- Top-up: one-off PaymentIntent (not subscription)
- Webhook: juzgo-webhook (Active) — payment_intent.succeeded
- Webhook URL: https://juzgo-backend.onrender.com/webhook

## Cloudflare
- Account: kairosventure.io@gmail.com
- Pages project: esimconnect (esimconnect-9dx.pages.dev)
- Domains: juzgo.world + www.juzgo.world (Active, SSL enabled)
- Auto-deploys: Yes — every push to main triggers build
- Build command: npm run build
- Output directory: build
- Worker: claude-proxy.kairosventure-io.workers.dev
  - Forwards to Anthropic Claude API (model: claude-sonnet-4-6)
  - Includes scheduled keep-alive cron for Supabase (every 3 days 09:00 UTC)
  - IMPORTANT: Always include `model` field in fetch calls or Anthropic returns "field required" error
- Email Routing: davidlim@juzgo.world → kairosventure.io@gmail.com — confirmed live July 8, 2026 (Session 20). Check this inbox, not a separate esimconnect.com address, when testing any flow that emails ADMIN_EMAIL (corp registration, admin notifications, etc). Two more rules added Session 20 for corp testing, same destination: corptest@juzgo.world, staff1@juzgo.world.

## Render (Backend)
- Service: juzgo-backend
- URL: https://juzgo-backend.onrender.com
- Region: Singapore
- Plan: Free (cold starts on login — upgrade to Starter $7/mo for production)
- Root directory: Server
- Start command: node server.js

## Environment Variables

### Frontend (.env in repo root)
```
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_[esimconnect sandbox key]
REACT_APP_SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_yDr3YTcsErOPthkWXjjRRw_R4AaB3zA
REACT_APP_BACKEND_URL=https://juzgo-backend.onrender.com
REACT_APP_VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
REACT_APP_ADMIN_EMAIL=davidlim@juzgo.world
```
✅ Frontend .env untracked from Git (Session 16, commit adf80730). All 6 REACT_APP_* vars confirmed present in Cloudflare Pages env. Values are public-facing (publishable/anon/VAPID-public) so no rotation needed. Server/.env was never tracked.

### Backend (Server/.env)
```
STRIPE_SECRET_KEY=sk_test_[esimconnect sandbox key]
STRIPE_WEBHOOK_SECRET=whsec_[esimconnect webhook signing secret]
SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[supabase service role key]
VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
VAPID_PRIVATE_KEY=Or2S1ilMhCMjwsBuU3-55tuFXonU87lmSgZW5XmPqnU
ADMIN_EMAIL=davidlim@juzgo.world
PORT=4000
RESEND_API_KEY=[resend api key]
```

---

## What Juzgo Does
A travel tech platform for tourists and business travellers:
- **eSIM data plans** — browse, buy and activate eSIM plans for 190+ countries
- **AI Itinerary Planner** — 4-stage flow with place picker, trust badges, day-coloured map
- **eWallet** — top-up balance via Stripe for purchases
- **Saved Itineraries** — full experience restore with map, chat and share
- **Corporate accounts** — team wallet, invite system, admin/member roles
- **Reseller system** — referral codes, commission, attribution
- **VoIP calling** — in-app calling via Twilio (post-launch)

---

## Tech Stack
| Layer       | Technology                                        |
|-------------|---------------------------------------------------|
| Frontend    | React (Create React App)                          |
| Routing     | React Router v6                                   |
| Styling     | CSS Modules + global.css (Juzgo design system)    |
| Auth + DB   | Supabase                                          |
| Payments    | Stripe (Stripe.js + CardElement)                  |
| Email       | Resend (SMTP via Supabase auth + backend)         |
| Maps        | Leaflet.js via CDN + OpenStreetMap tiles          |
| AI          | Claude API (claude-sonnet-4-6) via CF Worker      |
| Hosting     | Cloudflare Pages                                  |
| Backend     | Node.js (Express) on Render                       |
| Push        | Web Push API + VAPID + web-push npm               |
| Emoji       | Twemoji (cross-platform flag/emoji rendering)     |
| VoIP        | Twilio (TBC — post-launch)                        |

---

## Design System (Juzgo Refresh — June/July 2026)
**Fonts:** Newsreader (serif display) · Hanken Grotesk (body) · DM Mono (labels/mono) · Outfit (logo)
**Colors:**
- Background: #FBFDFC · Subtle: #F1F6F3 · Input: #F4F8F6
- Text: #16271E · Mid: #3A4A41 · Muted: #5B6B62 · Faint: #6A7A70
- Border: #E2E9E5 · Border-mid: #E8EEEB
- Green primary: #1E8E5E · Dark: #15734B · Light: #F0F7F3 · Tint: #EAF4EE · Ring: #CDE6D8
- Blue accent: #2A6FDB · Light: #EAF1FB · Border: #CFE0F7

**Radius:** sm 8px · md 12px · lg 16px · xl 20px · 2xl 24px · pill 999px
**Logo:** Pure blue spinning globe SVG (ocean radial gradient, white meridians) + "Juzgo" in Outfit 700 blue + green orbiting dot
**Navbar:** Frosted glass (rgba white .88 + blur 14px), 74px height, sticky
**Buttons:** Pill-radius; green primary → hover dark green; blue accent; outline variants

---

## Pages & Routes (App.js)
| Route                  | Component           | Notes                              |
|------------------------|---------------------|------------------------------------|
| /                      | Home                | Hero, stats, destinations, AI teaser |
| /plans                 | Plans               | Country selector, plan cards       |
| /login                 | Login               | Split card, forgot password wired  |
| /register              | Register            | Nickname field, password strength  |
| /reset-password        | ResetPassword       | Supabase recovery token handler    |
| /login-success         | LoginSuccess        | Email verify prompt, redirect-aware |
| /dashboard             | Dashboard           | Overview/Referral/Reseller tabs    |
| /checkout              | Checkout            | Card + wallet, promo codes         |
| /order-confirmation    | OrderConfirmation   | Post-purchase                      |
| /itinerary             | Itinerary           | 4-stage AI planner + map           |
| /purchases             | Purchases           | Order history, QR link             |
| /find-order            | FindMyOrder         | Guest order lookup                 |
| /saved-itineraries     | SavedItineraries    | Open/Share/Delete saved trips      |
| /terms                 | TermsAndConditions  | T&C prose                          |
| /wallet                | Wallet              | Top-up, preset amounts, Stripe     |
| /admin                 | Admin               | 7-tab admin panel                  |
| /corporate/register    | CorporateRegister   | Corp signup, free domain block     |
| /corporate/accept      | CorporateAccept     | Invite token accept                |

---

## Components
| File                        | Purpose                                      |
|-----------------------------|----------------------------------------------|
| Navbar.js/.module.css       | Animated globe, frosted glass, mobile drawer |
| Footer.js/.module.css       | 4-col grid footer                            |
| GlobeLogo.js                | Reusable coloured globe SVG (colour/white)   |
| AnimatedGlobe.js/.module.css| Large hero globe with orbiting eSIM chip     |
| PlacePicker.js/.module.css  | Stage 3: place cards, checkboxes, trust badges, add-own |
| ItineraryMap.js/.module.css | Leaflet map, day-coloured pins, day tabs     |
| AffiliateBar.js/.module.css | Affiliate partner pill bar                   |
| TrustBadge.js/.module.css   | 4-pill trust signal strip                    |
| LanguageToggle.js/.module.css | EN/中文/日本語/한국어 dropdown              |

---

## Supabase Schema (Key Tables)

### profiles
id, full_name, nickname, phone, wallet_balance, preferred_reseller_code,
reseller_linked_at, reseller_last_purchase_at, referral_code, referred_by,
referral_credit_earned, created_at, updated_at
- nickname: added July 2026 — used in Dashboard greeting (falls back to first name)
- RLS: own row read + update + insert
- Trigger: handle_new_user auto-creates profile on signup

### saved_itineraries
id (uuid), user_id (uuid → auth.users), destination (text),
trip_data (jsonb) ← itinerary text, selected_places (jsonb) ← places array with lat/lng/day,
created_at, stage (text)
- IMPORTANT: column is `trip_data` NOT `content`
- RLS: INSERT + SELECT + DELETE for authenticated users (added July 2026)
- Loaded in Itinerary.js via `?saved=[id]` query param → full step 4 restore

### orders
id, user_id, guest_email, package_id, package_title, country_code, country_name,
validity_days, data_amount, price_sgd, order_code, iccid, qr_code, qr_url,
customer_email, customer_name, session_id, status, payment_method,
reseller_code, discount_sgd, referral_code, created_at
- IMPORTANT: price_sgd (not total_sgd), order_code (not order_number), status (not payment_status)

### resellers
id, name, short_name, country_iso, code, commission_pct, discount_value,
discount_type, attribution_months, start_date, is_active

### countries
id (uuid), name, code (iso2, e.g. SG), flag_emoji, region, created_at
- Columns renamed in Session 16: flag → flag_emoji
- RLS: public read SELECT policy "Public read countries" USING (true)
- Seeded with 45 destinations (42 countries + 3 regional/global: ASIA, EURO, GLOBAL)

### esim_plans
id (uuid), country_id (→ countries), plan_name, data_gb, validity_days, price_sgd,
provider, is_active (bool default true), package_id (text unique), created_at
- Columns renamed in Session 16: name → plan_name, duration_days → validity_days, price_usd → price_sgd
- Added Session 16: is_active, package_id (links to worker MOCK_PACKAGES / future Airalo package id)
- RLS: public read SELECT policy "Public read esim_plans" USING (true)
- Seeded with 187 dummy plans (3–4 per country; ladder 1/3/5/10 GB + Unlimited for 10 premium countries)
- Prices SGD, market-scaled; operator names are plausible placeholders (no real carrier brands)
- Plans.js reads these tables DIRECTLY (not the worker); RLS with no SELECT policy = silently empty

---

## Itinerary Feature (4-Stage Flow)
**Stage 1 — Info gathering:**
- Destination, arrival date+time, departure date+time
- Accommodation (text field + "nothing booked yet" checkbox)
- Travellers, budget (Budget/Moderate/Comfortable/Luxury)
- Activities per day (2/3/4/5 — controls number of places researched)

**Stage 2 — Interests:**
- 10 experience categories + 3 Juzgo-unique (Hidden Gems, Seasonal, Food Crawls)

**Stage 3 — Place Picker:**
- Claude returns exactly `days × perDayCount` places as JSON (max 30, min 6)
- Each place: id, name, type, description (≤20 words), trust badge, lat, lng, day
- Trust badges: michelin / unesco / tourism / tripadvisor / gem / ai
- Cards with checkboxes, Select All/Deselect All, add-your-own free text
- Custom places tagged as "Your pick", merged into final list

**Stage 4 — Itinerary + Map:**
- Claude builds itinerary from selected places only
- Travel time between stops (not dwell time — user decides)
- Markdown rendered: ## headers, **bold**, blockquotes, lists, --- rules
- Leaflet/OpenStreetMap map, day-coloured pins (red/green/blue/orange/purple...)
- Day filter tabs (All days default, then Day 1, Day 2 etc)
- Traveller summary strip (days, travellers, budget, place count)
- Pins use plain global class names (juzgo-marker-pin) — NOT CSS Modules hashed names
- Coordinates coerced via toNum()/isValidCoord() before Leaflet render
- Bottom action bar: Save/Update · Share · Print · Re-plan · New Trip
- Share: Web Share API on mobile, clipboard fallback on desktop

**Saving:**
- Insert to saved_itineraries: trip_data (text) + selected_places (jsonb array)
- Loading: ?saved=[id] → fetch row → restore state → jump to step 4
- Pending itinerary persisted to sessionStorage before login redirect, auto-saved on return
- Update: overwrites existing row when viewing via ?saved=

**Claude API calls:**
- Place research: max_tokens 2500
- Itinerary build: max_tokens 3000
- Chat follow-up: max_tokens 4096
- Always include `model: 'claude-sonnet-4-6'` in body

---

## Auth Flow
- Register: full_name, nickname (optional), email, phone (optional), password
- Nickname stored in user_metadata → profiles on signup
- Forgot password: enter email in login page → Supabase sends reset email → lands on /reset-password
- Reset password: detects PASSWORD_RECOVERY auth event → updateUser({ password })
- Supabase redirect URL allowlist includes: https://juzgo.world/reset-password
- Login post-success: honours ?redirect= param (e.g. ?redirect=itinerary restores pending itinerary)

---

## Navbar (Logged In)
Plan My Itinerary → Plans → Terms & Conditions → My Purchases → Saved Itinerary → Dashboard → Logout → Language Toggle
Admin link (⚙️ Admin) appears between Dashboard and Logout for admin email only.

## Navbar (Logged Out)
Plan My Itinerary → Plans → Terms & Conditions → Register → Login → Language Toggle

---

## Key Technical Gotchas
- **i18n:** Always destructure `{ lang, t }` from `useLang()` — `t` is NOT a standalone named export
- **Leaflet divIcon:** Use plain global class names in HTML strings (juzgo-marker-pin), NOT CSS Modules hashed names — CSS Modules scoping breaks Leaflet's injected HTML
- **Leaflet coordinates:** Coerce with toNum()/isValidCoord() before L.marker() — Claude may return lat/lng as strings
- **Claude proxy:** Always include `model` field in fetch body — Anthropic returns "field required" without it
- **Cloudflare Worker exports:** Never add a second `export default {}` — merge all handlers as siblings
- **Supabase saved_itineraries:** Column is `trip_data` (not `content`); RLS policies must be explicitly added
- **CSS Modules + Leaflet:** Global styles must use `:global(.classname)` or plain injected class names
- **Twemoji:** Loaded via CDN in public/index.html with MutationObserver for React re-renders
- **Git path:** Use Git Bash with forward slashes `/d/Kairos/juzgo`; safe.directory may need setting on new machines
- **Plans data source:** Plans.js reads Supabase countries + esim_plans DIRECTLY. Worker MOCK_PACKAGES only feeds /airalo/packages + /airalo/orders (fulfilment/QR/email), NOT the Plans page
- **RLS silent empty:** A table with RLS enabled but no SELECT policy returns empty results (not an error) to the anon key. Public-catalogue tables need explicit `USING (true)` SELECT policies
- **Resend single domain:** Free plan = 1 verified domain. Any email sent from an address on a deleted/unverified domain fails SILENTLY. All senders must be @juzgo.world
- **gitignore vs tracked:** .gitignore does not untrack already-committed files — use `git rm --cached <file>`
- **Cloudflare Worker editor paste:** Clipboard-read is browser-permission gated; grant clipboard permission for dash.cloudflare.com, then Ctrl+V works
- **Worker mock prices are SGD:** /airalo/orders must NOT multiply price (old code had a stray *1.35 conversion — removed Session 16)
- **Render service URL was never renamed:** like the Cloudflare Pages project (internal name `esimconnect`), the Render backend's real hostname is still `esimconnect-backend.onrender.com` — NOT `juzgo-backend.onrender.com`. The dashboard sidebar shows it labelled "juzgo-backend" (service nickname only). Any env var or code referencing `juzgo-backend.onrender.com` will silently fail (404 `x-render-routing: no-server`, which browsers report as a CORS error). Always verify against the actual URL shown in Render's Logs/Events tab ("Available at your primary URL...") before assuming a rename took effect.
- **Card checkout has no fulfillment step:** Checkout.js's card-payment branch only calls Stripe client-side then navigates to /order-confirmation with local state — no order row, no email, no QR. Confirmed Session 17. Do not assume a successful Stripe charge means an order/email happened; check for a corresponding `orders` row.

---

## Admin Dashboard (/admin)
7 tabs: Orders · Users · Wallet · Logs · Resellers · Sales (+ USR- Referrals) · Analytics
- Email lookup to create resellers
- CSV export on Orders, Users, Wallet, Analytics tabs

---

## Completed Work (Cumulative)
- [x] Full React app — all pages, routes, CSS Modules design system
- [x] Juzgo UI refresh — Newsreader/Hanken Grotesk/DM Mono/Outfit fonts, green/blue design tokens
- [x] Animated globe logo with orbiting dot and spinning meridians
- [x] Stripe card + eWallet checkout with promo/reseller codes
- [x] Supabase auth — register, login, forgot password, reset password page
- [x] Nickname field in registration + warmer greeting in Dashboard
- [x] PWA + push notifications (order confirmed, wallet top-up)
- [x] i18n EN/中文/日本語/한국어
- [x] AI Itinerary — 4-stage flow, place picker, trust badges, OSM map, day pins
- [x] Saved itineraries — full experience restore, share, update
- [x] Reseller system — codes, attribution, commission, checkout integration
- [x] USR- user referral codes — wallet credit, admin tracking
- [x] Corporate accounts — registration, invite, dashboard
- [x] Admin dashboard — 7 tabs, CSV export, reseller management
- [x] Resend email (sender hello@juzgo.world, domain verified)
- [x] Twemoji for cross-platform flag/emoji rendering
- [x] index.html rebranded to Juzgo
- [x] RLS policies on saved_itineraries
- [x] ResetPassword page (/reset-password)
- [x] Plans page dummy catalogue — 45 destinations, 187 plans seeded (Session 16)
- [x] Worker sender fixed + rebranded to Juzgo (Session 16) — NOTE: Session 17 found this fix targets a path Checkout.js never calls for card payments; see Session 17 log
- [x] Frontend .env untracked from Git (Session 16)

---

## Remaining Work

### Immediate (Next Session)
- [ ] **Build the card-payment order-fulfillment + email flow (NEW — top priority, see Session 17)** — Checkout.js's card branch calls Stripe confirmCardPayment() client-side then navigates straight to /order-confirmation with local state. No order row is ever created, no QR/eSIM is provisioned, no email is sent. Needs a server-side trigger (webhook is the reliable option — client can close tab post-payment) that: (1) creates an `orders` row, (2) calls the worker to provision QR/eSIM (worker already fixed for sender in Session 16), (3) sends the confirmation email. Also decide whether `/create-payment-intent` should pass `planId` through in Stripe metadata so the webhook's `payment_intent.succeeded` handler can distinguish a plan purchase from a wallet top-up (currently Checkout.js's card branch omits `source`, but /create-payment-intent's metadata always writes `source: 'wallet_topup'` regardless of caller — the webhook has no branch for a real purchase today). Need worker's current /airalo/orders code (dashboard Edit Code view) to see what it already expects as input before designing the trigger.
- [ ] **Fix or remove /order/wallet-pay** — Checkout.js's wallet branch calls `POST {backend}/order/wallet-pay`, but this route does not exist in server.js (confirmed Session 17 — only /create-payment-intent, /order/complete, /webhook exist). Wallet checkout will 404 until this is built or the call is redirected.
- [ ] **Corporate registration bug** — is_corporate/corp_id/corp_role not always set on signup (needs CorporateRegister.js + server.js; server.js's /corporate/register handler itself looks correct on inspection — profile update is synchronous with error throwing — so root cause is likely in CorporateRegister.js or the Supabase signup trigger, not a race in server.js)
- [ ] **Password strength enforcement** — on registration forms
- [x] ~~Confirm ADMIN_EMAIL both sides~~ — DONE (Session 17): Cloudflare Production REACT_APP_ADMIN_EMAIL confirmed = davidlim@juzgo.world via dashboard screenshot. Render ADMIN_EMAIL still not visually re-confirmed this session but was set correctly per Session 16 env dump.
- [ ] **Purchases page — live eSIM status via Airalo API** — no longer blocked on registration (complete, sandbox access confirmed). Full scope now designed: catalog sync, Admin Portal catalog/pricing tab, storefront search/coverage UX, and the "Check/Verify" eSIM status button. See `Context-Airalo-Integration.md` before starting.
- [x] ~~Airalo API integration~~ — registration complete, sandbox API credentials obtained, design/spec work done (see `Context-Airalo-Integration.md`). Actual coding not yet started. Dummy 45-destination catalogue (Session 16) still in place as stand-in until real catalog sync is built.
- [x] ~~Check .env Git tracking~~ — DONE (Session 16): frontend .env untracked, commit adf80730; Server/.env was never tracked
- [x] ~~server.js stale esimconnect.world references~~ — DONE (Session 17): sender address, all URLs, all branding copy fixed (commit e5dce523)
- [x] ~~REACT_APP_BACKEND_URL wrong in Cloudflare Production~~ — DONE (Session 17): was set to https://juzgo-backend.onrender.com (does not exist — Render service was never renamed, same as Cloudflare Pages project name situation). Corrected to https://esimconnect-backend.onrender.com in both Production and Preview.

### Phase 3 — Growth
- [ ] Guest checkout improvements
- [ ] Multi-currency support
- [ ] Render upgrade to Starter $7/mo (eliminate cold start delays)
- [ ] Loyalty rollover (unused data → wallet credits at plan expiry)

### Phase 4 — Expansion
- [ ] Plan tier grouping (cost/GB tiers)
- [ ] Reseller mini-sites (/r/:slug)
- [ ] Wholesale pricing tier
- [ ] Self-serve reseller signup
- [ ] Twilio VoIP dialler
- [ ] Admin image upload (Supabase Storage → site_config table for hero images)

---

## Session Log

### Sessions 1–10 (Apr 15 – Apr 29, 2026)
Core platform built: auth, Stripe, Supabase, PWA, i18n, admin, reseller system, USR- referrals.
Final commit of that period: 425f85c5

### Session 11 — June 29, 2026 (UI/UX Refresh)
Full design system refresh from HTML mockups. Rewrote all 39 pages/components.
New design tokens, fonts, Navbar, Footer, Home, Plans, Auth, Checkout, Dashboard, Wallet, Purchases, Itinerary, Admin, Corporate pages, shared Pages.module.css.
Commits: 8dc3b853 → e0eebb26

### Session 12 — June 29–30, 2026 (Itinerary Rebuild + Fixes)
- Fixed i18n import error (t not standalone export from i18n.js)
- Added Navbar to App.js, removed double Footer
- Hero image added (public/images/hero.png — connectivity collage)
- Itinerary rebuilt as 4-stage flow (place picker, trust badges, OSM map, day pins)
- Added arrival/departure date+time and accommodation fields to info gathering
- Activities-per-day selector
- Fixed Leaflet CSS Modules class hashing bug (plain global class names for divIcon)
- Fixed lat/lng string coercion for map pins
- Bottom action bar: Save/Print/Re-plan/New Trip
- Fixed claude-proxy model field error
- Removed dwell-time suggestions, only travel time between stops
Commits: 59c35d4c → 4afefeea

### Session 13 — July 2, 2026 (Auth, Globe, Saved Itineraries)
- Fixed Supabase SMTP sender (resend@esimconnect.world → hello@juzgo.world)
- Fresh Resend API key, juzgo.world domain verified
- Forgot password wired to Supabase resetPasswordForEmail
- ResetPassword page built (/reset-password)
- Supabase redirect URL allowlist updated
- Coloured world globe logo (blue ocean, spinning meridians, green orbiting dot)
- GlobeLogo.js shared component (colour + white variants)
- nav_saved fixed to "Saved Itinerary"
- Dashboard greeting: nickname > first name in title case
- Nickname field added to registration
- Dashboard tab moved to last position in navbar
- Twemoji added to public/index.html for cross-platform flag rendering
- index.html rebranded to Juzgo
- Destinations cards: country name + flag only (no city names)
- Saved itineraries RLS policies added (INSERT + SELECT + DELETE)
- saved_itineraries column fix: content → trip_data
- SavedItineraries page: Open/Share/Delete buttons, text preview
- Itinerary: loads saved itinerary via ?saved=[id], full step 4 restore
- Share button (Web Share API + clipboard fallback)
- Update button (overwrites existing saved row)
- Scroll to top on every step change
- Pending itinerary persisted through login/register flow via sessionStorage
Commits: ba35a876 → a2ae07ea

### Session 16 — July 2, 2026 (Plans dummy data + worker email fix + .env untrack)
Diagnosed empty Plans page: countries/esim_plans tables were empty AND columns didn't match Plans.js queries (flag vs flag_emoji, name vs plan_name, price_usd vs price_sgd, missing is_active).

Completed:
- Supabase migration + seed (SQL Editor, one-time):
  - Renamed columns to match frontend; added is_active + package_id to esim_plans
  - Enabled RLS + public-read SELECT policies on both tables (were returning empty silently)
  - Seeded 45 destinations (42 countries + Asia/Europe/Global bundles) and 187 dummy plans
  - Ladder 1/3/5/10 GB (+Unlimited for JP KR TH AU GB FR US CA TW AE); SGD prices market-scaled
  - Plausible placeholder operator names (no real carriers); package_id matches worker 1:1
  - Verified: 45 rows, correct plan counts; live on juzgo.world/plans (dropdown fills, cards render)
- claude-proxy worker rewrite (deployed via dashboard Edit Code, version b3319b5e):
  - Expanded MOCK_PACKAGES to all 45 destinations / 187 packages (IDs match esim_plans.package_id)
  - FIXED broken order confirmation email — was sending from orders@esimconnect.world (domain deleted
    from Resend during rename → every send silently failing). Now "Juzgo <hello@juzgo.world>", full
    Juzgo rebrand (green/blue, correct fonts, juzgo.world links)
  - Removed price*1.35 SGD double-conversion bug (mock prices already SGD); order code EC- → JZ-
  - scheduled() keep-alive preserved as sibling of fetch() (single index_default export intact)
- Frontend .env untracked from Git (was tracked despite .gitignore): git rm --cached .env → commit adf80730 → push
  - Server/.env was NOT tracked (verified) — no real secrets exposed; frontend .env held only public values
  - All 6 REACT_APP_* vars confirmed present in Cloudflare Pages env (build never depended on committed .env)

Files changed:
- Supabase schema + data (via SQL Editor — not in repo)
- claude-proxy worker (Cloudflare dashboard — not in repo)
- .env removed from Git tracking
Commits: adf80730 (untrack .env)

Verified: Plans page live (Hong Kong 4 plans, correct SGD pricing); worker deployed (b3319b5e, replaced 44-day-old bca5e186)

NOT verified / flagged:
- Real-purchase confirmation email path goes through server.js (not the worker) — server.js may still have
  old esimconnect.world sender. NEEDS test purchase + fix in server.js if email fails.
- Render ADMIN_EMAIL + Cloudflare REACT_APP_ADMIN_EMAIL values not visually confirmed as davidlim@juzgo.world

Next session should:
- Test purchase end-to-end → confirm confirmation email lands + correct sender (check server.js sender)
- Fix corp registration profile bug (needs CorporateRegister.js + server.js)
- Password strength enforcement on registration forms
- Confirm Render + Cloudflare ADMIN_EMAIL both = davidlim@juzgo.world
- (Later this month) Airalo onboarding → swap worker /airalo/* from MOCK_PACKAGES to live API;
  re-seed esim_plans from real Airalo data; then Purchases page live eSIM status

### Session 17 — July 2, 2026 (server.js rebrand cleanup + backend URL bug hunt)
Set out to test purchase end-to-end (Session 16's #1 flagged item). Found and fixed two real bugs, then discovered the actual purchase-fulfillment flow doesn't exist yet for card payments.

Completed:
- **server.js stale branding cleanup** (commit e5dce523, pushed to main): fixed `sendEmail()`'s hardcoded `from: 'eSIMConnect <hello@esimconnect.world>'` → `'Juzgo <hello@juzgo.world>'` (dead domain — every email through this function was failing silently: corp registration admin/applicant notices, corp approval notice). Also fixed all stale `esimconnect.world` URLs (redirect fallback, reseller/referral share links, corp invite link, admin panel link, login links) and all "eSIMConnect" branding copy in email subjects/bodies/sign-offs, health-check string, startup log. 20 lines changed, syntax-checked clean, isolated diff.
- **First real test purchase attempt** — hit a wall: checkout failed with `Failed to fetch` / CORS preflight block on `/create-payment-intent`.
- **Diagnosed the CORS failure** — NOT a code bug. `curl -i -X OPTIONS` against `juzgo-backend.onrender.com` returned `404` with header `x-render-routing: no-server`, meaning that hostname has no live service behind it at all (browsers report this as a CORS error since no CORS headers come back either way).
- **Root cause found:** the Render service's real URL was never renamed during the rebrand — same situation as the Cloudflare Pages project (`esimconnect` internal name). Actual live URL is `esimconnect-backend.onrender.com`. Confirmed via Render's own Events/Logs: "Available at your primary URL https://esimconnect-backend.onrender.com".
- **Fixed:** Cloudflare Pages Production env var `REACT_APP_BACKEND_URL` was set to the non-existent `juzgo-backend.onrender.com` — corrected to `esimconnect-backend.onrender.com`. (Preview was already correct — only Production had drifted, likely during earlier rebrand cleanup.) Also confirmed `REACT_APP_ADMIN_EMAIL` = `davidlim@juzgo.world` in Production while in there.
- Triggered Cloudflare redeploy via empty commit (`44bc0b18`) since env var changes don't apply retroactively to an existing build.
- **Second test purchase: succeeded.** Stripe sandbox card payment went through, order confirmation page rendered correctly (destination, data, validity, price all correct).
- **Checked inbox for confirmation email: did not arrive.** Only old Supabase Auth emails present (password reset, signup confirm) from a prior day — nothing from this purchase.
- **Traced the real cause by reading Checkout.js + OrderConfirmation.js:** the card-payment branch of `handleSubmit()` in Checkout.js calls `stripe.confirmCardPayment()` client-side, then navigates straight to `/order-confirmation` with local React state (`paymentIntent`, `plan`, `country`, `promoCode`). **There is no fetch call to create an order, provision a QR/eSIM, or send an email anywhere in this path.** OrderConfirmation.js only reads and renders `location.state` — it never calls anything either. The Session 16 worker/sender fix was real and correct, but the current checkout flow never invokes that code path for card payments.
- Also noticed in passing: Checkout.js's wallet-payment branch calls `POST {backend}/order/wallet-pay`, but this route does not exist in server.js (confirmed against the full route list — only /create-payment-intent, /order/complete, /webhook exist). Wallet checkout is separately broken (404) whenever it's attempted.
- Also noticed: `/create-payment-intent`'s Stripe metadata always sets `source: 'wallet_topup'` regardless of caller, and Checkout.js's card branch doesn't pass a `planId` through to Stripe metadata either — so even the webhook's existing `payment_intent.succeeded` handler has no way to distinguish a real plan purchase from a wallet top-up today, and has no branch that would create an order/send an email even if it could tell.

Files changed:
- Server/server.js (branding/URL fixes only — commit e5dce523)
- Cloudflare Pages Production environment variables (REACT_APP_BACKEND_URL corrected — dashboard change, not in repo)
- Empty commit to trigger redeploy (44bc0b18)

Verified: server.js patch is live on Render (logs show `juzgo backend running on port 4000` + confirmed primary URL); Cloudflare Production redeployed and live; test purchase completes successfully through Stripe sandbox; confirmation email does NOT arrive (root cause identified, not yet fixed — see Next Session).

NOT verified / flagged:
- Render ADMIN_EMAIL value — not re-checked this session (was correct per Session 16 env dump, no reason to suspect drift, but not visually re-confirmed)
- Worker's current /airalo/orders code was not reviewed this session — need to open Cloudflare dashboard Edit Code view to see what it currently expects, before designing the fulfillment trigger

Next session should:
- **Design and build the card-payment order-fulfillment + email flow** (see Remaining Work → Immediate, top item — this is the actual, corrected version of "test purchase end-to-end")
- Fix or remove /order/wallet-pay (404 today)
- Fix corp registration profile bug (needs CorporateRegister.js + server.js — server.js's own handler already inspected and looks correct)
- Password strength enforcement on registration forms
- (Later this month) Airalo onboarding → swap worker /airalo/* from MOCK_PACKAGES to live API; re-seed esim_plans from real Airalo data; then Purchases page live eSIM status

---

### Session 18 — July 3, 2026 (corp registration fix + card-payment order fulfillment)

Completed:
- **Corp registration bug fixed** (commit 2b457c88). Root cause was NOT the trigger-timing race originally suspected — `CorporateRegister.js` never called `supabase.auth.signUp()` at all. It collected a password but sent the raw form straight to `/corporate/register`, which requires `user_id` and had none, so the request should have 400'd outright. On top of that, `server.js`'s profile-upgrade `.update().eq('id', user_id)` silently no-ops on zero matched rows (Supabase doesn't error), which is the real source of "is_corporate not always set" if a user_id ever *was* present. Fixed both: `CorporateRegister.js` now calls `auth.signUp()` client-side and passes the resulting `user_id`; `server.js`'s profile update now retries up to 5x (400ms apart), confirms via `.select('id')` that a row was actually updated, and rolls back the orphaned `corporates` row if it never succeeds.
- **Card-payment order fulfillment built** (commit a4e314c7) — the actual fix for Session 17's "test purchase end-to-end" item. Added `POST /order/create` in `server.js`: verifies the PaymentIntent server-side via `stripe.paymentIntents.retrieve()` (never trusts the client), pulls plan details from `esim_plans`, writes the `orders` row, sends the confirmation email via `sendEmail()`, idempotent against a new `stripe_payment_intent_id` column. Also fixed `/create-payment-intent` metadata bug flagged Session 17 (was hardcoded `source: 'wallet_topup'` for everything, didn't accept `planId`). `Checkout.js`'s card branch now calls `/order/create` right after `confirmCardPayment()` succeeds and navigates with the real `order` object; if order creation fails post-payment, it does NOT show an error (card's already charged) — logs it and falls back to plan/country state so the confirmation page still renders coherently.
- **Required migration run** (Supabase SQL Editor, `esimconnect`/Juzgo project): `ALTER TABLE orders ADD COLUMN stripe_payment_intent_id text` + unique index. Confirmed via `information_schema.tables` that `orders` lives in `public` schema on the correct project (there was a brief mix-up checking the wrong Supabase project — AxiomAnare instead of Juzgo — resolved).
- **End-to-end verified**: real Stripe sandbox test purchase → order appears in `/purchases` (JZ-4P8AXCEL, COMPLETED, SGD 16.00) → confirmation email received at hello@juzgo.world sender, correct order details.

Files changed:
- src/pages/CorporateRegister.js (commit 2b457c88)
- Server/server.js (commits 2b457c88, a4e314c7)
- src/pages/Checkout.js (commit a4e314c7)
- Supabase schema: orders.stripe_payment_intent_id column + index (SQL Editor — not in repo)

Verified: corp registration flow not re-tested this session (fix pushed, live-tested registration still pending); card-payment purchase → order → email fully verified end-to-end.

NOT verified / flagged:
- Corp registration fix (2b457c88) not yet tested with a real signup — do that before relying on it
- **eSIM QR provisioning still does not exist.** Confirmation email says "Your eSIM QR code will follow in a separate email shortly" but nothing sends it — `qr_url` is left null on every order. Intentionally deferred (no real customers yet, testers only) but MUST be wired up before real launch — see Pre-Launch Checklist at top of this doc. Needs the Cloudflare worker's `/airalo/orders` request/response contract reviewed (not available this session).
- `/order/wallet-pay` still 404 — untouched this session
- Render `ADMIN_EMAIL` still not re-confirmed (was correct per Session 16 dump)

Next session should:
- Test corp registration end-to-end with a real signup
- Wire up eSIM QR provisioning ahead of real launch (see Pre-Launch Checklist)
- Fix or remove /order/wallet-pay (404 today)
- Password strength enforcement on registration forms
- Confirm Render ADMIN_EMAIL = davidlim@juzgo.world
- (Later this month) Airalo onboarding → swap worker /airalo/* from MOCK_PACKAGES to live API; re-seed esim_plans from real Airalo data; then Purchases page live eSIM status

---

### Session 19 — July 3, 2026 (eWallet fully wired + Stripe webhook fix + destination bug fix + logo refresh)

Completed:
- **eWallet top-up fixed** — `Wallet.js` was calling `/wallet/create-topup-intent`, a route that never existed anywhere in `server.js` (confirmed by the classic "Unexpected token '<'" error — Express's default 404 page is HTML, not JSON). Fixed by pointing it at `/create-payment-intent` (already existed, already had full webhook-side crediting logic sitting unused) and passing `userId` so the webhook credits the right profile. Added a ~2.5s delayed balance refetch after a successful top-up.
- **eWallet spend fixed** — added the missing `POST /order/wallet-pay` endpoint (mirrors `/order/create`'s logic: resolve promo code, write order, email receipt — but deducts `wallet_balance` instead of going through Stripe). Order is written before the balance is touched, so a DB failure can't deduct money for nothing.
- **Promo/referral routing bug found and fixed** — refactored `/reseller/validate`'s inline logic into a shared `resolvePromoCode()` helper, used by both `/order/create` and `/order/wallet-pay`. Previously (Session 18's `/order/create`) every promo code was written to `orders.referral_code` regardless of type — would have silently broken reseller commission tracking, since `reseller/my-stats` reads `orders.reseller_code` specifically. Now correctly splits: USR- codes → `referral_code`, reseller codes → `reseller_code` + `discount_sgd`. Referral credit (`processReferralCredit`) now actually fires on both card and wallet purchases — previously it was defined but never called from either purchase path.
- **Stripe webhook found completely misconfigured** — the `juzgo-webhook` endpoint in Stripe (esimconnect sandbox) was still pointed at the dead `juzgo-backend.onrender.com` (same stale-hostname issue Session 17 fixed on the Cloudflare side, but nobody had touched the Stripe side). 100% failure rate on `payment_intent.succeeded` deliveries — this is *why* wallet top-ups were never crediting even before the endpoint-name bug above. Fixed by editing the destination URL in Stripe Workbench → Webhooks to `https://esimconnect-backend.onrender.com/webhook`. Signing secret was unchanged by the edit (confirmed character-for-character match against Render's `STRIPE_WEBHOOK_SECRET`, no action needed there). Verified via a fresh top-up crediting automatically with no manual resend required (Render logs: `Wallet credited: ... amount=SGD10 new_balance=SGD60`).
- **Order destination bug found and fixed** — `esim_plans` has no `country_name`/`country_code` columns at all; country data lives in a separate `countries` table joined via `esim_plans.country_id`. Both `/order/create` and `/order/wallet-pay` were reading nonexistent flat columns (always `undefined`), which is why one wallet-purchase order showed a blank "Destination". Fixed by adding `.select('*, countries(name, code, flag_emoji)')` to both plan lookups and reading `plan.countries?.name` / `plan.countries?.code`. No migration needed — verified via a fresh Egypt purchase showing the destination correctly everywhere (email + Purchases).
- **Logo refreshed** — replaced the old blue clip-art globe (which was already off-brand — all blue, when the actual "Juzgo Refresh" design system below defines green `#1E8E5E` as primary and blue `#2A6FDB` as a secondary accent only) with a new pin mark: a location-pin head standing on a small ground disc, blue accent dot for the eSIM "signal." Iterated through a few concepts (orbit-signal globe, network-dot globe, pin) before settling on the pin — most ownable/distinctive, holds up better at small sizes like a favicon than fine globe linework would. `GlobeLogo.js` rewritten in place (same `size`/`variant` prop interface, so any other usage site picks up the change automatically — only confirmed usage site is `Navbar.js`, which previously had its own separately-duplicated inline copy of the globe SVG plus a CSS-animated orbiting dot; both replaced by importing the shared component). Wordmark sized up 30% (52px→68px, mobile 42px→55px) and pulled tight against the icon per feedback. Dead animation CSS removed from `Navbar.module.css` (`.globeSvg`, `.globeLon`, `.globeLat`, `.globeOrbit`, `.globeDot`, `.globeLands`, `.globeLon2`, and the `spinLon`/`spinLat`/`orbitDot`/`rotateGlobe` keyframes — none of it applies to a static icon).

Files changed:
- src/pages/Wallet.js
- Server/server.js (order/wallet-pay endpoint, resolvePromoCode refactor, countries join fix)
- src/components/GlobeLogo.js (full rewrite)
- src/components/Navbar.js (now imports GlobeLogo instead of duplicating it)
- src/components/Navbar.module.css (sizing + dead CSS removal)
- Stripe dashboard: juzgo-webhook destination URL corrected (not in repo)

Verified: wallet top-up → webhook → balance credit, fully working (fresh top-up, no manual intervention). Wallet spend → order → email, fully working (Egypt test purchase, SGD 4.00, correct destination throughout). Logo live on production, confirmed via screenshot — renders correctly in navbar at real size against the hero.

NOT verified / flagged:
- Corp registration fix (Session 18, commit 2b457c88) still not tested with a real signup
- Two pre-Session-19 test orders (JZ-4P8AXCEL, JZ-V4ZFXQC8) have blank destinations from the countries-join bug — cosmetic, test data, not worth backfilling
- Exact commit hash for the logo push wasn't captured in this session's log — run `git log --oneline -5` next session to confirm what actually landed
- The ground-disc's outline ring is quite subtle at real navbar size (~66px) — noted as acceptable, not revisited

Next session should:
- Test corp registration end-to-end with a real signup (carried over from Session 18, still not done)
- Wire up eSIM QR provisioning ahead of real launch (see Pre-Launch Checklist)
- Password strength enforcement on registration forms
- Confirm Render ADMIN_EMAIL = davidlim@juzgo.world
- Generate favicon files from the new pin mark (public/ static assets — separate from the React component work done this session)
- (Later this month) Airalo onboarding → swap worker /airalo/* from MOCK_PACKAGES to live API; re-seed esim_plans from real Airalo data; then Purchases page live eSIM status

---

### Session 20 — July 8, 2026 (Corp registration live-testing, org unification design, domain-locked staff creation, corp wallet checkout)

**This was a long session that shifted scope mid-way** — started as "test corp registration end-to-end" (carried over from Sessions 18/19), surfaced that several corporate features described as built in earlier CONTEXT.md entries do not actually exist in the live code, then expanded into a full redesign of how corporate (and future tour-agency) staff accounts work, ending with a rebuilt corp checkout flow. Everything below actually happened and was live-tested unless marked otherwise.

**Part 1 — Live-testing corp registration surfaced real regressions:**
- `/corporate/dashboard` had **no route at all** in `App.js` — fixed.
- The staff invite email linked to `/corporate/invite/:token`, but `App.js` only routed `/corporate/accept`, and that routed component (`CorporateAccept.js`) turned out to be an incomplete/broken stand-in anyway (never called `auth.signUp()`, posted to a nonexistent endpoint). The correct, matching component (`CorporateInvite.js`) existed in the repo but was never routed. This whole flow has since been replaced entirely (see Part 3), so this fix was superseded within the same session — not wasted, just short-lived.
- **The Navbar's "🏢 Corp Portal" link for logged-in corp users was missing** — added back in Session 12 per old CONTEXT.md notes, silently dropped during Session 19's logo-refresh Navbar rewrite. Restored, plus added a new "Corporate ▾" dropdown (Register/Login) for logged-out users, since `/corporate/register` had zero discoverability from the nav before this.
- **Admin panel has NO Corporate approval tab at all** — confirmed via full-file grep, zero references to "corporate" anywhere in `Admin.js`, despite the backend endpoints (`GET /admin/corporates`, `POST /admin/corporates/:id/approve`) existing and working. This is now the top item on the Pre-Launch Checklist. Approvals this session were done via raw SQL (`UPDATE corporates SET is_active=true, approval_status='approved' WHERE ...`) as a workaround — Supabase Table Editor's boolean-cell click-to-toggle proved unreliable in testing; SQL Editor with an explicit `UPDATE ... RETURNING` is the reliable path.
- **Checkout.js had NO corp wallet payment option at all** — zero references to `corp_wallet`, despite CONTEXT.md describing it as built. This is fixed as of this session (see Part 4).

**Part 2 — Org unification design (planning only, not built):**
Discussed a second target customer — tour agencies wanting to gift/discount eSIMs to tour group members, who should keep their account afterward as ordinary personal users. This doesn't fit the current rigid one-org-per-user `corporates`/`profiles.corp_id` model. Designed a unified `organizations`/`org_links`/`org_packages`/`org_codes`/`org_redemptions` schema covering both corporate and tour-agency account types, with corporate staying org-first (admin creates staff) and tour agency being member-first (traveler registers personally, then redeems a voucher). Full spec, including a pooled monthly-free-credit + prepaid-topup funding model for tour agencies, written to **`ORG-UNIFICATION-SPEC.md`** and uploaded to Project Knowledge. **This is a genuine future rebuild, not started this session** — what actually got built (Part 3) is a domain-lock/admin-created-staff redesign applied to the EXISTING `corporates`/`profiles.corp_id` schema, not the new `organizations` schema from the spec. The spec's tour-agency half (packages, vouchers, free-credit pool) remains entirely unbuilt.

**Part 3 — Domain-locked, admin-created staff accounts (built + live-tested, replaces the old invite/accept flow):**
Rationale: protect corporate customers from a colleague riding the company wallet on a personal email address, and simplify the flow (admin's action of creating the account IS the approval — no separate invite/accept round-trip).
- **Supabase migration** (`migrations/session20_staff_creation.sql`, run in SQL Editor): `corporates.email_domain` (text, backfilled from `contact_email` for existing rows), `profiles.must_change_password` (boolean, default false).
- **`server.js`**: `contact_email`'s domain now captured into `email_domain` at registration. New `POST /corporate/staff/create` — validates requester is an approved admin, validates the new staff email's domain matches `corp.email_domain` exactly (rejects anything else), creates the auth user directly via `supabase.auth.admin.createUser()` with a system-generated password and `email_confirm: true`, sets `must_change_password: true` on the profile (same retry-and-verify pattern as the Session 18 corp-registration fix), emails login credentials. Old `/corporate/invite*` endpoints left in place, commented as deprecated, unused by the frontend.
- **`App.js`**: removed the `/corporate/invite/:token` route and `CorporateInvite` import (that whole flow is retired); added `/force-password-change`.
- **`CorporateDashboard.js`** + `.module.css`: "Invite a Staff Member" (single email field) replaced with "Create a Staff Account" (name + domain-locked email, with the required domain shown inline); button relabeled "+ Create Staff Account". CSS updated for the two-input layout (`flex-wrap`).
- **`Login.js`**: after successful sign-in, checks `profiles.must_change_password` and redirects to `/force-password-change` instead of the dashboard if set.
- **`ForcePasswordChange.js`** (new page): forces a new password via `supabase.auth.updateUser()`, clears the flag, then proceeds to `/dashboard`.
- **Live-tested end to end** using a fresh test company ("Juzgo Test Corp", domain `juzgo.world`, admin `corptest@juzgo.world`) with real Cloudflare Email Routing rules added for `corptest@juzgo.world` and `staff1@juzgo.world` (both → `kairosventure.io@gmail.com`, alongside the existing `davidlim@juzgo.world` rule). Confirmed: off-domain email correctly rejected; on-domain creation succeeded; credentials email delivered; first login forced the password-change screen; subsequent logins skipped it.
- **Known gotcha hit during testing, worth remembering:** deleting a `corporates`/`profiles` row in Table Editor does NOT delete the underlying `auth.users` row — re-registering the same email then fails silently (auth.signUp() sees an existing user, the profile-creation trigger never fires, backend retry-and-verify fails with "Could not finish setting up your corporate account"). Fix is Supabase → Authentication → Users → delete the orphaned auth user directly, separate from Table Editor.

**Part 4 — Corp wallet checkout (built + live-tested):**
Per direction discussed: corp-linked accounts (staff AND admin) are **work-purchasing only** — no card, no personal wallet, ever. Every plan purchase auto-deducts from the org's pooled wallet. Personal use requires a separate personal account.
- **`server.js`**: new `GET /corporate/wallet-balance` (any corp-linked user can read their org's balance — `corporates` table RLS is service-role-only, so the client can't query it directly). New `POST /order/corp-wallet-pay` — validates corp-linked + org active, checks balance covers the plan price; if not, **blocks the purchase AND emails the corp's `contact_email`** ("wallet low, top up needed") automatically; if covered, creates the order (`payment_method='corp_wallet'`) and deducts atomically via the same `increment_corp_wallet` RPC the top-up webhook already uses (called with a negative amount) rather than fetch-then-update.
- **`Checkout.js`**: corp-linked accounts see no payment method selector at all — no `CardElement`, no personal-wallet toggle. Added a genuine **two-step review/confirm**: first submit only reveals a "Confirm this purchase? SGD X will be deducted... cannot be undone" state (nothing charged yet) plus a "← Back, I'm not ready" link; second submit actually calls the endpoint. This was added specifically to prevent a one-click purchase being mistaken for "just show me my selections" when clicking through to "My Purchases" afterward.
- **`Dashboard.js`**: corp-linked accounts see "🏢 [Company] wallet — SGD X.XX" instead of a personal wallet, in both the header badge and the Overview stat card; no Top Up button/link shown anywhere.
- **`Wallet.js`**: corp-linked accounts hitting `/wallet` directly (bypassing the hidden nav link) get a plain explanation instead of a top-up form, pointing them to register a separate personal account for personal use.
- **Live-tested end to end**: `staff1@juzgo.world` purchased a Germany 1GB/7-day plan (SGD 5.50) from the corp wallet; balance correctly dropped SGD 50.00 → SGD 44.50; confirmation email and order-confirmation page rendered correctly; **admin's Corp Portal → Orders tab correctly showed the staff purchase** (order code, staff name, plan, amount, status, date) — confirming that view was already reading live data correctly, unrelated to anything touched this session.
- **Not yet tested:** the insufficient-balance block + admin notification email path (never hit it in testing since the wallet always had funds).

**Part 5 — Misc:**
- **Removed the postal/zip code field from all three Stripe `CardElement` instances** (`Checkout.js`, `Wallet.js`, `CorporateDashboard.js`, via `hidePostalCode: true`) — Juzgo's user base is global (Hong Kong has no postal codes at all; Singapore's are 6 digits vs. the US's 5), so a fixed-format field was actively wrong for a large share of users. Minor tradeoff: loses Stripe's AVS postal-code fraud signal, judged acceptable.
- Noticed but not fixed: `twemoji.min.js` 404 in browser console (CDN script failing to load, site-wide) — flagged for a future session, unrelated to anything touched this session.
- Confirmed Cloudflare Email Routing: `davidlim@juzgo.world` → `kairosventure.io@gmail.com` (this was already true; explicitly re-verified and noted in the Cloudflare section above per user request).

**Files changed this session:**
- `src/App.js`, `src/components/Navbar.js` + `.module.css`
- `Server/server.js` (staff creation, wallet-balance read, corp-wallet-pay, email_domain capture at registration)
- `src/pages/CorporateDashboard.js` + `.module.css`
- `src/pages/Login.js`, `src/pages/ForcePasswordChange.js` (new)
- `src/pages/Checkout.js`, `src/pages/Dashboard.js`, `src/pages/Wallet.js`
- `migrations/session20_staff_creation.sql` (new — run manually in Supabase SQL Editor, not an auto-migration)
- `ORG-UNIFICATION-SPEC.md` (new, uploaded to Project Knowledge — design doc, not code)

**Test data created this session (needs cleanup before launch — see Pre-Launch Checklist):**
- `corporates` rows: "Worldwide Pte Ltd" / renamed-on-re-registration "eSimConnect World Pte Ltd" (domain `esimconnect.world`, messy history — deleted and recreated once, orphaned auth user issue hit and resolved), "Juzgo Test Corp" (domain `juzgo.world` — the one used for the successful end-to-end tests)
- `profiles` rows: `davidlim@juzgo.world` has `is_corporate=true` with a `corp_id` pointing at a deleted corp (harmless — doesn't affect admin login — but should be cleaned up before launch); `corptest@juzgo.world` (admin), `staff1@juzgo.world` (staff, password already changed from temporary)
- Cloudflare Email Routing rules added: `corptest@juzgo.world`, `staff1@juzgo.world` (both → `kairosventure.io@gmail.com`) — fine to leave in place, or remove if you want to tidy up

Next session should:
- **Build the Admin Corporate approval tab** — now the single biggest blocker to real launch in this feature area; backend is ready, just needs the UI.
- Test the insufficient-corp-wallet-balance block + admin notification email path (never triggered this session).
- Clean up test data listed above.
- Decide whether to proceed with the full `organizations`/`org_links` rebuild from `ORG-UNIFICATION-SPEC.md` (tour agency support) or leave the current domain-locked corporate flow as-is for now and revisit tour agencies later.
- Wire up eSIM QR provisioning ahead of real launch (carried over, still not started).
- Password strength enforcement on `Register.js` (personal accounts) — corp/staff flows already enforce ≥8 chars, personal registration does not.
- Investigate `twemoji.min.js` 404 in console (site-wide, low priority).

---

### Session 21 — July 8–9, 2026 (Admin Corporate tab, password strength, cleanup SQL, org-schema decision, self-pay-by-card fallback, PDF receipts, npm ci lockfile fix)

**Part 1 — Admin Corporate approval tab (built + deployed + partially live-tested):**
- `src/pages/Admin.js`: added `'Corporate'` to `TABS`, a data-fetch branch calling `GET /admin/corporates` (already existed, unchanged), a new tab-content block, and a new `CorporateManager` sub-component (mirrors the existing `ResellerManager` pattern).
- `CorporateManager` renders two sections:
  - **⏳ Awaiting Approval** — company, country, contact email, domain, applied date, and a **✓ Approve** button per row → `POST /admin/corporates/:id/approve`.
  - **Approved Accounts** — company, country, domain, wallet balance, staff count, status badge, and a **Suspend**/**Reactivate** toggle → `PATCH /admin/corporates/:id` with `{ is_active }`.
- Both actions update local state optimistically from the API response so the UI reflects the change without a full tab reload; per-row `busyId` disables just that row's button mid-request; a shared error banner surfaces failures.
- `src/pages/Admin.module.css`: added `.btnApprove` (solid green) and `.btnSuspend` (outlined red) button styles; reused existing `.badge_completed`/`.badge_failed` for Active/Suspended, `.table`/`.tableRow`/`.subH3`/`.emptyState` for layout — no new layout primitives needed.
- **Deployed** (commit `7fd5ca28`, Cloudflare Pages Production, confirmed live at `/admin`). **Live-tested:** re-registered `corptest@juzgo.world` fresh (see Part 3 for why a clean re-registration was needed), confirmed the new row appeared correctly in ⏳ Awaiting Approval, clicked **✓ Approve**, confirmed it moved to Approved Accounts with correct wallet ($0.00) / staff (0) / status (Active). Went smoothly, no issues. **Not yet tested: the Suspend/Reactivate toggle** on an approved row — do this next time you're in there (the `corptest@juzgo.world` row now sitting in Approved Accounts is ready-made for it).

**Part 2 — Insufficient corp-wallet-balance path (code-reviewed, not live-tested — no Supabase/Stripe access from this session's sandbox):**
Reviewed `POST /order/corp-wallet-pay` (`server.js`) and the corp branch of `handleSubmit` in `Checkout.js`. Found no bugs:
- Backend compares `corp.wallet_balance` to the plan price, and on shortfall sends the corp's `contact_email` a low-balance notification, then returns `402` with `{ error: '...' }` — no order row and no wallet deduction happen on this path.
- Frontend's `if (!data.success) throw new Error(data.error || 'Payment failed')` correctly catches this (402 responses still parse fine via `res.json()`; `data.success` is simply absent), and the existing `catch` block sets `error` state, which renders via `{error && <div className={styles.error}>{error}</div>}`.
- To actually trigger and confirm this live: temporarily set a corp's `wallet_balance` below a plan's `price_sgd` in Supabase (e.g. `UPDATE corporates SET wallet_balance = 1.00 WHERE company_name = 'Juzgo Test Corp';`), then attempt a purchase as a linked staff/admin account. Expect: purchase blocked with the balance message on screen, a low-balance email to the corp's `contact_email`, and no new `orders` row. Restore the real balance afterward.

**Part 3 — Test data cleanup SQL (written, run — with two follow-up fixes):**
Wrote `migrations/cleanup-session21.sql` — a single transaction that (a) clears `is_corporate`/`corp_id`/`corp_role` on any profile pointing at one of the three named test corps *or already orphaned* (covers `davidlim@juzgo.world` plus catches any other stray orphan automatically, not just the known one), (b) deletes any leftover `corp_invites` rows tied to those corps, then (c) deletes the `corporates` rows themselves (Worldwide Pte Ltd / eSimConnect World Pte Ltd / Juzgo Test Corp). **Run successfully** — `corporates` table confirmed empty of test rows, `corp_invites` cleared.
- **Fix 1 — orphan check gap:** the script's `WHERE corp_id IN (...) OR (corp_id IS NOT NULL AND corp_id NOT IN (...))` clause assumed an orphaned profile still has a (dangling) `corp_id`. `davidlim@juzgo.world`'s `corp_id` was already `NULL` from an earlier partial cleanup, so `is_corporate=true`/`corp_role='admin'` slipped past both conditions untouched. Fixed with a targeted one-off:
  ```sql
  UPDATE profiles SET is_corporate = false, corp_role = NULL
  WHERE id = (SELECT id FROM auth.users WHERE email = 'davidlim@juzgo.world')
    AND is_corporate = true;
  ```
  Verified after: `is_corporate=false`, `corp_id=NULL`, `corp_role=NULL`. **Lesson for any future cleanup script in this codebase: check for `is_corporate=true` independently of `corp_id`'s null-ness — the two can already be out of sync before the script runs, not just as a result of the delete it's performing.**
- **Fix 2 — needed a fresh pending row to smoke-test the new Admin tab, hit the known `auth.users` gotcha again:** after the cleanup deleted the `corporates` row, `corptest@juzgo.world`'s old `profiles` row (and any `corp_invites`) needed clearing too before re-registering — but per the Session 20 note, SQL/Table Editor deletes never touch `auth.users`, so a plain SQL delete would leave `corptest@juzgo.world` "already registered" from Supabase Auth's perspective and silently break re-registration. Correct sequence used: (1) delete the `auth.users` row via **Authentication → Users** in the Dashboard (cascades to `profiles` automatically since it's `ON DELETE CASCADE`), (2) `DELETE FROM corp_invites WHERE email = 'corptest@juzgo.world';` for anything not tied by FK, (3) verify 0 rows via a join query, (4) re-register fresh. Worked cleanly — see Part 1 for the live-test result.

**Part 4 — organizations/org_links schema: build now vs. defer (decision, not yet finalized):**
Leaning toward **defer** — reasoning discussed:
- No signed/committed tour-agency customer yet; `ORG-UNIFICATION-SPEC.md` is design-only, driven by a hypothetical second customer type, not a live request.
- The pre-launch list still has real open items (QR provisioning, this session's cleanup, live-testing the new Admin tab) — a schema rebuild (5 new tables, migration script, rewritten `/corporate/*` endpoints, rebuilt `CorporateDashboard.js` and `Checkout.js`) is a multi-session effort that would delay actually launching the corporate feature that already works.
- Nothing built this session forecloses the option later — Session 20's domain-lock/admin-created-staff design was explicitly noted as compatible scaffolding either way.
- Recommendation: ship corporate-only as-is, revisit `ORG-UNIFICATION-SPEC.md` when an actual tour-agency prospect exists. **Not yet confirmed as final — flagging for your decision, not deciding on your behalf.**

**Part 5 — Password strength on `Register.js` (done):**
Added a second check alongside the existing ≥8-char rule: password must contain at least one letter and one number (`/[A-Za-z]/` and `/[0-9]/`), matching the bar already implied by the existing strength meter's "fair" tier. Error message: "Password must include at least one letter and one number." `CorporateRegister.js` and the staff-creation flow were already at parity with this bar per Session 20 notes — no changes needed there.

**Part 6 — Suspend/Reactivate live-tested (closes out the Part 1 gap):**
Tested directly by David on the live Admin Corporate tab against `corptest@juzgo.world`: Suspend flipped the row to "Suspended" correctly, Reactivate flipped it back to "Active." No issues. The Admin Corporate approval tab (Part 1) is now **fully live-tested end to end** — registration → pending → approve → suspend → reactivate, all confirmed working.

**Part 7 — Self-pay-by-card fallback on insufficient corp wallet balance (new feature, David's request, built + live-tested):**
While live-testing the insufficient-balance path from Part 2, David asked for a way to let a corp-linked user pay for the purchase themselves by card rather than just being blocked. **This reopens the Session 20 "work-purchasing only — no card, ever" design decision**, deliberately — flagged to David at the time, he confirmed he wants it anyway.
- `src/pages/Checkout.js`: added `insufficientBalance` and `corpFallbackCard` state. On a `402` from `/order/corp-wallet-pay` (or proactively, if the known corp balance is already below the plan price), a button appears: **"Would you like to pay by Credit Card? · SGD X →"** (copy specifically requested by David). Clicking it swaps the panel to a normal name/email/card (`CardElement`) form, with a "← Back to company wallet" link to return.
- This routes through the **existing personal-card checkout path** (same `create-payment-intent` → `confirmCardPayment` → `order/create` flow non-corp users use) — books as an ordinary `payment_method: 'card'` order tied to the person, **not** the corp wallet.
- `src/pages/Checkout.module.css`: added `.btnFallback` and `.btnBackLink`.
- **Live-tested:** `corptest@juzgo.world` (wallet at SGD 6.00) attempted a SGD 16.00 purchase, got blocked, clicked through the fallback, completed a real card charge, landed on order confirmation normally. Worked cleanly.

**Part 8 — Corp Portal: split wallet spend from staff self-paid spend (accounting fix, prompted by Part 7):**
Once self-pay-by-card was live, David asked for those purchases to be visible in the Corp Portal for reimbursement/accounting purposes. Turned out they already were — `/corporate/dashboard` (backend) already returns every order placed by corp staff regardless of `payment_method`, so self-paid orders were **already landing in the Staff Orders table**. The real gap: nothing distinguished them from actual wallet spend, and the old "Total Spend" stat was **silently summing both together**, overstating what the company itself had actually paid. No backend changes needed — purely a `CorporateDashboard.js`/`.module.css` display/aggregation fix:
- Staff Orders table: new **Payment** column, blue "Corp Wallet" badge vs. amber "Card (self-paid)" badge.
- Overview stats: split into **Wallet Spend** and **Staff Self-Paid**, plus a callout line pointing admins to the badge when there's outstanding self-paid spend.
- Wallet tab's "Total Spent"/"Completed Orders" sidebar stats: now wallet-only too (same conflation existed there, fixed for consistency — this section is specifically about the corp wallet balance).
- CSV export: added a "Payment Method" column.
- **Live-tested:** confirmed in the Corp Portal as `corptest@juzgo.world` (admin) — the Part 7 self-paid order shows the amber badge and counts toward "Staff Self-Paid," not "Wallet Spend."

**Part 9 — Downloadable PDF receipts (David's request, built + live-tested) + a real `npm ci` lockfile bug found and fixed along the way:**
David asked whether staff could print/save a receipt for expense claims. Nothing like this existed anywhere in the codebase before this. Built:
- `src/lib/generateReceipt.js` (new) — shared `generateReceiptPDF(order)` using `jspdf` (added to `package.json`). Renders order code, date, billed-to name/email, item + destination + data/validity, subtotal/discount/total, payment method, status, and a reimbursement-oriented footer note. Deliberately does **not** show a GST/tax breakdown — the `orders` table doesn't actually store one anywhere in the code despite an earlier CONTEXT.md mention of "GST 9% applied at checkout," so a fabricated tax line would've been inaccurate on a document meant for expense claims.
- `src/pages/OrderConfirmation.js` — "Download receipt (PDF)" button right after purchase (only when a real order row exists).
- `src/pages/Purchases.js` — a "Receipt (PDF)" button on every past order.
- **Deploy hit a real, unrelated build failure along the way** — worth documenting in detail since it's a systemic risk, not a one-off:
  1. First push (`6a1333ce`) failed Cloudflare's build: `npm ci` errored `Missing: yaml@2.9.0 from lock file`. Traced this to David's local machine running **npm 11.9.0 / node 24.14.0**, ahead of Cloudflare's build image (**npm 10.9.2 / node 22.16.0**) — npm 11 writes/resolves lockfiles in a way npm 10's stricter `ci` validation doesn't accept, even though the content itself wasn't "wrong." A plain local `npm install` regenerating the lockfile didn't fix it (produced a byte-identical file, since it was already using npm 11 both times).
  2. **Fix:** downgraded local npm to match Cloudflare exactly — `npm install -g npm@10.9.2` — then regenerated `node_modules`/`package-lock.json` from scratch under that version. This surfaced a **second, genuinely real bug**, unrelated to receipts entirely: `typescript` isn't a direct dependency anywhere in this project (plain JS/JSX throughout, confirmed via `grep`), it's only an *optional peer* of `react-scripts@5.0.1` (wants `^3.2.1 || ^4`). With nothing pinning it, npm had silently resolved the latest published TypeScript at some past install — which has since moved to a `7.x` major, outside what `react-scripts` supports, and `npm ci` (correctly) refused to proceed once that drift got flagged under npm 10's stricter checks.
  3. **Final fix, now committed:** `npm install typescript@4.9.5 --save-dev` — pins TypeScript explicitly as a devDependency so it stops silently drifting on future installs. `npm ci` now passes clean locally under npm 10.9.2, matching Cloudflare exactly. Pushed as `18e5ef4f`; Cloudflare build succeeded.
- **Live-tested:** receipt buttons render correctly on both `OrderConfirmation.js` and `Purchases.js` (confirmed on `staff1`'s account, screenshot showed correct PDF — Juzgo branding, order details, "Suitable for expense claims" footer).
- **Lesson for next session, and any future `npm install`/lockfile work in this codebase: always match the local npm version to Cloudflare's build image (currently npm 10.9.2 / node 22.16.0) before regenerating `package-lock.json`, or the lockfile can pass locally and still fail the actual deploy.** Worth periodically checking Cloudflare's current default Node/npm version in case it's moved since.

**Files changed this session (full session, Parts 1–9):**
- `src/pages/Admin.js`, `src/pages/Admin.module.css` (Corporate tab)
- `src/pages/Register.js` (password strength)
- `migrations/cleanup-session21.sql` (run, plus a targeted follow-up fix for `davidlim@juzgo.world`, see Part 3)
- `src/pages/Checkout.js`, `src/pages/Checkout.module.css` (self-pay-by-card fallback)
- `src/pages/CorporateDashboard.js`, `src/pages/CorporateDashboard.module.css` (wallet vs. self-paid spend split)
- `src/lib/generateReceipt.js` (new), `src/pages/OrderConfirmation.js`, `src/pages/Purchases.js` (PDF receipts)
- `package.json`, `package-lock.json` (jspdf added; typescript pinned to 4.9.5; lockfile regenerated under npm 10.9.2 to match Cloudflare)

**Not touched this session (explicitly deferred, see checklist):** eSIM QR provisioning (still blocked on Airalo company registration), `organizations` schema build (pending David's decision, see Part 4 — still open).

Next session should:
- Confirm the organizations-schema decision from Part 4, or revisit if circumstances changed — the one open decision still carrying over.
- Continue chasing eSIM QR provisioning readiness (Airalo company registration status) — the one real remaining pre-launch blocker.
- Spot-check the self-pay-by-card fallback (Part 7) doesn't get accidentally over-used — it's meant as a last-resort, not a preferred path; worth watching whether "Staff Self-Paid" in the Corp Portal grows unexpectedly large over time, which would suggest the corp wallet isn't being topped up often enough rather than the fallback being misused.
- If any further `npm install`/`package-lock.json` work comes up, start from `npm install -g npm@10.9.2` first (see Part 9 lesson) rather than rediscovering the version-mismatch issue again.

---


## Files In This Project (Key Files)
```
src/App.js                           Routes + ?ref= capture + LanguageProvider
src/index.js                         React root + SW + LanguageProvider
public/index.html                    Juzgo branding + Twemoji CDN + MutationObserver
public/images/hero.png               Hero image (connectivity collage)
src/lib/supabase.js                  Supabase client
src/lib/i18n.js                      i18n context (useLang hook — t is NOT standalone export)
src/styles/global.css                Design tokens + reset + utility classes
src/components/Navbar.js             Animated globe, frosted glass, mobile drawer
src/components/Navbar.module.css     Navbar styles + globe animations
src/components/GlobeLogo.js          Reusable globe SVG (colour/white variants)
src/components/Footer.js             4-col footer
src/components/PlacePicker.js        Stage 3: place cards, checkboxes, trust badges
src/components/ItineraryMap.js       Leaflet map, day-coloured pins, day tabs
src/components/AffiliateBar.js       Affiliate partner pill bar
src/components/TrustBadge.js         Trust signal strip
src/components/LanguageToggle.js     Language dropdown
src/pages/Home.js                    Landing page
src/pages/Plans.js                   eSIM plan browser
src/pages/Login.js                   Login + forgot password + must_change_password redirect (Session 20)
src/pages/Register.js                Register + nickname field; password requires ≥8 chars + letter + number (Session 21)
src/pages/ResetPassword.js           Password reset (Supabase recovery token)
src/pages/ForcePasswordChange.js     Forced password change for admin-created staff accounts (new, Session 20)
src/pages/LoginSuccess.js            Email verify prompt (redirect-aware)
src/pages/Dashboard.js               Overview/Referral/Reseller tabs — shows corp wallet for corp-linked accounts (Session 20)
src/pages/Checkout.js                Card + wallet + promo codes; corp-linked accounts get corp-wallet checkout with two-step confirm, plus a self-pay-by-card fallback on insufficient balance (Session 20 + 21)
src/pages/OrderConfirmation.js       Post-purchase; "Download receipt (PDF)" button (Session 21)
src/pages/Wallet.js                  eWallet top-up; blocked entirely for corp-linked accounts (Session 20)
src/pages/Itinerary.js               4-stage AI planner + map + save/share/update
src/pages/SavedItineraries.js        Saved trips list: Open/Share/Delete
src/pages/Purchases.js               Order history; "Receipt (PDF)" button per order (Session 21)
src/pages/FindMyOrder.js             Guest order lookup
src/pages/Admin.js                   8-tab admin panel, incl. Corporate tab — fully live-tested Session 21 (Approve/Suspend/Reactivate all confirmed working)
src/pages/CorporateRegister.js       Corporate signup — now captures email_domain (Session 20)
src/pages/CorporateDashboard.js      Corp admin dashboard — "Create a Staff Account" (Session 20); Staff Orders split into Wallet Spend vs. Staff Self-Paid (Session 21)
src/lib/generateReceipt.js           NEW Session 21 — shared jsPDF receipt generator, used by OrderConfirmation.js + Purchases.js
src/pages/CorporateInvite.js         DEPRECATED Session 20 — unrouted, kept for reference only
src/pages/CorporateAccept.js         DEPRECATED — was routed but broken; removed from routing Session 20
src/pages/TermsAndConditions.js      T&C
src/pages/Pages.module.css           Shared styles (SavedItineraries, FindMyOrder etc)
Server/server.js                     Express backend — all API endpoints, incl. /corporate/staff/create, /corporate/wallet-balance, /order/corp-wallet-pay (Session 20)
Server/.env                          Backend env vars (not tracked by Git)
migrations/session20_staff_creation.sql  Manual SQL migration — corporates.email_domain, profiles.must_change_password (Session 20, not auto-applied)
migrations/cleanup-session21.sql     Manual SQL migration — orphaned test corp/profile cleanup (Session 21, not auto-applied)
migrations/airalo-integration-migration.sql  Manual SQL migration — airalo_catalog, country_coverage_index, juzgo_selected_plans, orders extension (Session 22, not yet run)
ORG-UNIFICATION-SPEC.md              Design spec for future organizations/org_links rebuild (Session 20, Project Knowledge — not code)
Context-Airalo-Integration.md        Airalo integration workstream primer (Session 22, Project Knowledge — not code)
juzgo-airalo-catalog-admin-spec.md   Airalo integration build spec — schema, sync job, Admin Portal, storefront UX (Session 22, Project Knowledge — not code)
```

---

## Git Commands
```bash
cd /d/Kairos/juzgo
git add [files]
git commit -m "description"
git push origin main
# If safe.directory error:
git config --global --add safe.directory /d/Kairos/juzgo
```

### Session 22 — July 14, 2026 (Airalo Integration — Design & Sandbox Access)
Airalo company registration confirmed complete; sandbox API access obtained and
confirmed working (API credentials from Partner Platform → API Integration menu).
No coding done this session — this was entirely design/planning work, done in a Claude
chat session (not Claude Code, not against this repo directly), producing three
companion documents now committed to the repo root:
- `Context-Airalo-Integration.md` — full workstream primer: status, source data, credential
  handling, sandbox/production distinction (account-level switch, not per-request; same
  credentials for both; switching to Production is irreversible and deletes sandbox
  products), suggested next coding steps
- `DECISIONS.md` — updated with 7 new entries: pricing floor enforcement (Airalo's
  "Recommended retail price" is actually a legally-binding minimum selling price, shared
  by all Airalo partners — not just Juzgo), no custom-bundle-creation via the API,
  coverage-curation display rules, sim-before-topup v1 scope, Check/Verify must always be
  a live Airalo call, search UX design, competitive positioning notes
- `juzgo-airalo-catalog-admin-spec.md` — full build spec: 4 Supabase tables
  (`airalo_catalog`, `country_coverage_index`, `juzgo_selected_plans`, extended `orders`),
  catalog sync job design, Admin Portal Catalog & Pricing tab spec, storefront
  search/coverage UX, Check/Verify button logic, P&L dashboard design, suggested build order
- `juzgo-faq-draft.md` — draft customer-facing FAQ copy: what "Unlimited" data means
  (Airalo default fair-use: 3GB/day high-speed then throttle to ~1Mbps, reset every 24hr
  from activation — affects ~38% of the catalog, 1,465 of 3,872 packages), topup
  mechanics, Check button's three states, country-coverage search
- `juzgo_airalo_catalog_template.xlsx` — working Excel tool: full 3,872-package catalog
  with tickable "Sell?" selection, editable pricing (floor-violation flagged in red),
  and a P&L dashboard (catalog-projected economics + actual-sales tab). Standalone tool
  for now, not wired to the live backend — that wiring is the actual coding task ahead.

**Key facts worth knowing before starting the real build:**
- Sandbox vs Production is an account-level state, switched once (irreversibly) by
  contacting the Airalo account manager once all sandbox testing is done — not a
  per-request parameter. No risk of an errant flag hitting production accidentally.
- The CSV pricing export (`report_api_with_net_prices_2026-07-14_ALL_Unlimited.csv`,
  3,872 packages) has commercial fields only — rechargeability, coverage breakdown, and
  fair-use terms only come from the live `GET /v2/packages` API response and must be
  merged in during catalog sync.
- No API endpoint exists for creating custom bundles — Airalo's catalog is entirely
  Airalo-defined; partners resell and reprice only.

**Next session should:**
- Start with the Supabase migration for the 4 new/extended tables (see admin spec §2).
- Then a throwaway script: authenticate, pull one real `GET /v2/packages` response,
  confirm field names/structure match what the spec assumes — before writing the full
  catalog sync job.
- Treat this as a genuinely new coding effort layered on top of the existing dummy
  45-destination catalogue (Session 16) and the still-unbuilt card-payment fulfillment
  flow (Session 17, still open) — these three pieces (fulfillment trigger, QR
  provisioning, and the Airalo catalog integration) are related but distinct, worth not
  conflating when picking up work.

**Addendum (same day):** the Supabase migration for the schema above was drafted —
`migrations/airalo-integration-migration.sql` — creating `airalo_catalog`,
`country_coverage_index`, `juzgo_selected_plans`, and extending `orders`. Not yet run
against Supabase. Contains a flagged open question about whether a `CHECK` constraint
or a trigger is needed to enforce the pricing floor — see the file's inline comments,
test both in the SQL Editor before committing to one. All existing repo-root `.sql`
files were also reorganized into a `migrations/` folder this session for consistency —
`session20_staff_creation.sql` and `juzgo-migration-seed.sql` were discovered to have
never actually been tracked by git despite being referenced as if committed; confirm
both are added and moved before relying on the `migrations/` path for them going forward.
