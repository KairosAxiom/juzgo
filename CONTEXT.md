# Juzgo — Living Project Context
Last updated: July 2, 2026 (Session 17)
Latest commit: 44bc0b18

---

## Repository
- Repo: https://github.com/KairosAxiom/juzgo
- Live: https://juzgo.world
- Local: D:\Kairos\juzgo (USB Drive D:)
- Cloudflare Pages project name: esimconnect (internal — cannot rename)
- Branch: main

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
- [ ] **Purchases page — live eSIM status via Airalo API** (blocked on Airalo onboarding — company registration later this month)
- [x] ~~Airalo API integration~~ — DEFERRED to Airalo onboarding; dummy 45-destination catalogue seeded as stand-in (Session 16)
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
src/pages/Login.js                   Login + forgot password
src/pages/Register.js                Register + nickname field
src/pages/ResetPassword.js           Password reset (Supabase recovery token)
src/pages/LoginSuccess.js            Email verify prompt (redirect-aware)
src/pages/Dashboard.js               Overview/Referral/Reseller tabs
src/pages/Checkout.js                Card + wallet + promo codes
src/pages/OrderConfirmation.js       Post-purchase
src/pages/Wallet.js                  eWallet top-up
src/pages/Itinerary.js               4-stage AI planner + map + save/share/update
src/pages/SavedItineraries.js        Saved trips list: Open/Share/Delete
src/pages/Purchases.js               Order history
src/pages/FindMyOrder.js             Guest order lookup
src/pages/Admin.js                   7-tab admin panel
src/pages/CorporateRegister.js       Corporate signup
src/pages/CorporateAccept.js         Invite token accept
src/pages/TermsAndConditions.js      T&C
src/pages/Pages.module.css           Shared styles (SavedItineraries, FindMyOrder etc)
Server/server.js                     Express backend — all API endpoints
Server/.env                          Backend env vars (not tracked by Git)
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
