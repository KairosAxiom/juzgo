# Juzgo — Living Project Context
Last updated: July 2, 2026
Latest commit: a2ae07ea

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
⚠️ Check .env is NOT tracked by Git (secrets exposure risk)

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
id, name, iso_code, flag_emoji

### esim_plans
id, plan_name, country_id, data_gb, validity_days, price_sgd, is_active

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

---

## Remaining Work

### Immediate (Next Session)
- [ ] **Purchases page — live eSIM status via Airalo API** (show active/expired/data remaining per eSIM)
- [ ] **Airalo API integration** — replace mock data in plans with live Airalo packages
- [ ] **REACT_APP_ADMIN_EMAIL** — update from davidlim@esimconnect.world to davidlim@juzgo.world in Cloudflare Pages env vars
- [ ] **server.js ADMIN_EMAIL** — update from esimconnect.world to juzgo.world sender (Render env var)
- [ ] **Corporate registration bug** — is_corporate/corp_id/corp_role not always set on signup
- [ ] **Password strength enforcement** — on registration forms
- [ ] **Check .env Git tracking** — confirm .env is in .gitignore (secrets exposure risk)

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
