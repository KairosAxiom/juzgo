# juzgo — Living Project Context
Last updated: June 29, 2026
Latest commit: d0c83b34

---

## Repository
- Repo: https://github.com/KairosAxiom/juzgo
- Live: https://juzgo.world
- Local: E:\Kairos\juzgo
- Branch: main

## Supabase
- URL: https://emsovpcmdnuxrhbyvnvb.supabase.co
- Account email: dlimyk@gmail.com
- Existing tables: countries, esim_plans, esims, orders, profiles, push_subscriptions, resellers, saved_itineraries, usage_logs, users, voip_calls, waitlist, wallet_topups, corporates, corp_invites
- RLS: profiles, wallet_topups, voip_calls, push_subscriptions, resellers, corporates, corp_invites all have RLS enabled
- Currency: SGD primary, GST 9% applied at checkout
- URL Configuration: Site URL = https://juzgo.world, Redirect URLs = https://juzgo.world/**
- Keep-alive: Cloudflare Worker cron "0 9 */3 * *" via claude-proxy scheduled() handler — prevents 7-day inactivity pause

## Stripe
- Account: Kairos Axiom (acct_1TBAKEBOsstkemgx)
- Sandbox: juzgo sandbox (use this one — keys start with pk_test_ / sk_test_ from juzgo sandbox)
- Live keys: available under Kairos Axiom (sk_live_...05tE created 10 Apr — for production later)
- Currency: SGD
- Top-up: one-off PaymentIntent (not subscription)
- Webhook: juzgo-webhook (Active) — in Workbench → Webhooks, listens for payment_intent.succeeded
- Webhook URL: https://juzgo-backend.onrender.com/webhook

## Resend (Email)
- Account: kairosventure.io@gmail.com
- Domain: juzgo.world (Verified, Tokyo region)
- From address: juzgo <hello@juzgo.world>
- API key: stored in Render + Server/.env as RESEND_API_KEY

## Cloudflare
- Account: kairosventure.io@gmail.com
- Pages project: esimconnect (esimconnect-9dx.pages.dev) — internal name unchanged; juzgo.world is the live domain
- Domains: juzgo.world + www.juzgo.world (both Active, SSL enabled); esimconnect.world + www.esimconnect.world still active (not yet removed)
- Auto-deploys: Yes — every push to main triggers a build
- Build command: npm run build
- Output directory: build
- Worker: claude-proxy.kairosventure-io.workers.dev (bridges frontend → Claude API + Airalo)
- Worker cron: "0 9 */3 * *" — scheduled() handler in claude-proxy pings countries table (Supabase keep-alive, every 3 days @ 09:00 UTC)
- Worker edit mode: dashboard-only (no Wrangler/Git deploy pipeline)
- SPA fallback: public/_redirects — explicit route list → /index.html 200

## Render (Backend Hosting)
- Service: juzgo-backend
- URL: https://juzgo-backend.onrender.com
- Region: Singapore
- Plan: Free (spins down after 15min inactivity — upgrade to Starter $7/mo for production)
- Root directory: Server
- Start command: node server.js

## Environment Variables

### Frontend: E:\Kairos\juzgo\.env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_[juzgo sandbox key]
REACT_APP_SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_yDr3YTcsErOPthkWXjjRRw_R4AaB3zA
REACT_APP_BACKEND_URL=https://juzgo-backend.onrender.com
REACT_APP_VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
REACT_APP_ADMIN_EMAIL=davidlim@juzgo.world
REACT_APP_TWILIO_ACCOUNT_SID=          (TBC)
REACT_APP_TWILIO_AUTH_TOKEN=           (TBC)
REACT_APP_TWILIO_PHONE_NUMBER=         (TBC)

### Backend: E:\Kairos\juzgo\Server\.env
STRIPE_SECRET_KEY=sk_test_[juzgo sandbox key]
STRIPE_WEBHOOK_SECRET=whsec_[juzgo webhook signing secret]
SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[supabase service role key]
VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
VAPID_PRIVATE_KEY=Or2S1ilMhCMjwsBuU3-55tuFXonU87lmSgZW5XmPqnU
ADMIN_EMAIL=davidlim@juzgo.world
RESEND_API_KEY=re_[resend api key]
PORT=4000

### Cloudflare Pages Environment Variables
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_[juzgo sandbox key]
REACT_APP_SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_yDr3YTcsErOPthkWXjjRRw_R4AaB3zA
REACT_APP_BACKEND_URL=https://juzgo-backend.onrender.com
REACT_APP_VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
REACT_APP_ADMIN_EMAIL=davidlim@juzgo.world

### Render Environment Variables
STRIPE_SECRET_KEY=sk_test_[juzgo sandbox key]
STRIPE_WEBHOOK_SECRET=whsec_[juzgo webhook signing secret]
SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[supabase service role key]
VAPID_PUBLIC_KEY=BHWKg9LMTkn1uA9pgQweT2DNyCfNAvMTYqO2QXSN8YJhlxrysfS3Br_iZpGVCbZfslZZ9g_0bfWRnyKncrKHG4k
VAPID_PRIVATE_KEY=Or2S1ilMhCMjwsBuU3-55tuFXonU87lmSgZW5XmPqnU
ADMIN_EMAIL=davidlim@juzgo.world
RESEND_API_KEY=re_[resend api key]
PORT=4000

### Cloudflare Worker (claude-proxy) Secrets
ANTHROPIC_API_KEY=[claude api key]
RESEND_API_KEY=re_[resend api key]
SUPABASE_URL=https://emsovpcmdnuxrhbyvnvb.supabase.co
SUPABASE_ANON_KEY=sb_publishable_yDr3YTcsErOPthkWXjjRRw_R4AaB3zA

---

## What juzgo Does
A travel tech platform for tourists and business travellers targeting:
- eSIM data plans — browse, buy and activate eSIM plans for 190+ countries
- VoIP calling — in-app calling via Twilio floating dialler widget (post-launch)
- MyItinerary — AI-generated travel plans for destinations
- Wallet — top-up balance via Stripe eWallet for calls and data

### Target Users
- Tourists / occasional travellers
- Business travellers (corporate)

---

## Tech Stack
| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React (Create React App)            |
| Routing     | React Router v6                     |
| Styling     | CSS Modules + global.css            |
| Auth + DB   | Supabase                            |
| Payments    | Stripe (Stripe.js + CardElement)    |
| Email       | Resend (transactional email)        |
| VoIP        | Twilio (TBC — post-launch)          |
| Hosting     | Cloudflare Pages                    |
| Backend     | Node.js (Express) on Render         |
| AI          | Claude API via Cloudflare Worker    |
| Maps        | react-leaflet + OpenStreetMap       |
| Geocoding   | Nominatim                           |
| Push        | Web Push API + VAPID + web-push npm |

---

## Pages & Routes (App.js)
| Route                    | Component           | Status       |
|--------------------------|---------------------|--------------|
| /                        | Home                | Built        |
| /plans                   | Plans               | Built        |
| /login                   | Login               | Built        |
| /register                | Register            | Built        |
| /dashboard               | Dashboard           | Built        |
| /checkout                | Checkout            | Built        |
| /order-confirmation      | OrderConfirmation   | Built        |
| /itinerary               | Itinerary           | Built        |
| /purchases               | Purchases           | Built        |
| /find-order              | FindMyOrder         | Built        |
| /saved-itineraries       | SavedItineraries    | Built        |
| /terms                   | TermsAndConditions  | Built        |
| /login-success           | LoginSuccess        | Built        |
| /wallet                  | Wallet              | Built        |
| /admin                   | Admin               | Built        |
| /corporate/register      | CorporateRegister   | Built        |
| /corporate/dashboard     | CorporateDashboard  | Built        |
| /corporate/invite/:token | CorporateInvite     | Built        |

---

## Supabase Schema (All Tables)

### countries
id, name, iso_code, flag_emoji

### esim_plans
id, plan_name, country_id (-> countries), data_gb, validity_days, price_sgd, is_active

### orders
id, user_id (-> auth.users), guest_email,
package_id, package_title, country_code, country_name,
validity_days, data_amount, price_sgd,
order_code, iccid, qr_code, qr_url,
customer_email, customer_name, session_id,
status,           -- completed | pending | failed
payment_method,   -- 'card' | 'wallet' | 'corp_wallet' | 'gifted'
reseller_code,    -- e.g. SG-JOHN-00001 (nullable)
referral_code,    -- e.g. USR-DAVID-00001 (nullable)
discount_sgd,     -- discount applied at checkout (default 0)
created_at

IMPORTANT: orders table uses price_sgd (not total_sgd), order_code (not order_number), status (not payment_status).

### profiles
id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
full_name text,
phone text,
wallet_balance numeric(10,2) DEFAULT 0.00,
preferred_reseller_code text,
reseller_linked_at timestamptz,
reseller_last_purchase_at timestamptz,
referral_code text,           -- USR-NAME-00001 format
referred_by text,             -- referral code of who referred this user
referral_credit_earned numeric(10,2) DEFAULT 0.00,
is_corporate boolean DEFAULT false,
corp_id uuid REFERENCES corporates(id) ON DELETE SET NULL,
corp_role text DEFAULT 'staff',  -- 'admin' | 'staff'
created_at timestamptz DEFAULT now(),
updated_at timestamptz DEFAULT now()

RLS: own row read + update + insert policies
Trigger: auto-created on user signup (handle_new_user)
Trigger: updated_at auto-refresh

### resellers
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
name text NOT NULL,
short_name text NOT NULL,
country_iso text NOT NULL,
code text UNIQUE NOT NULL,
commission_pct numeric(5,2) DEFAULT 10.00,
discount_value numeric(10,2) DEFAULT 0.00,
discount_type text DEFAULT 'percent',
attribution_months integer DEFAULT 0,
start_date date DEFAULT CURRENT_DATE,
is_active boolean DEFAULT true,
notes text,
user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
slug text UNIQUE,
account_type text DEFAULT 'individual',
created_at timestamptz DEFAULT now()

Sequence: reseller_code_seq (global, padded to 5 digits)
RLS: enabled — service role only

### corporates
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
company_name text NOT NULL,
company_country text NOT NULL,
uen text,                          -- Singapore UEN (optional, SG only)
contact_email text NOT NULL,
wallet_balance numeric(10,2) DEFAULT 0.00,
is_active boolean DEFAULT false,   -- false until manually approved
approval_status text DEFAULT 'pending',  -- 'pending' | 'approved' | 'suspended'
created_at timestamptz DEFAULT now()

RLS: enabled — service role + corp member read own row

### corp_invites
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
corp_id uuid REFERENCES corporates(id) ON DELETE CASCADE,
email text NOT NULL,
token text UNIQUE NOT NULL,        -- 48-char hex, crypto.randomBytes(24)
accepted boolean DEFAULT false,
created_at timestamptz DEFAULT now()

RLS: enabled — service role only

### wallet_topups
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
amount_sgd numeric(10,2) NOT NULL,
stripe_payment_intent_id text UNIQUE,
status text DEFAULT 'pending',
created_at timestamptz DEFAULT now()

### voip_calls
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
to_number text NOT NULL,
duration_seconds integer DEFAULT 0,
cost_sgd numeric(10,4) DEFAULT 0.0000,
twilio_call_sid text UNIQUE,
status text DEFAULT 'initiated',
created_at timestamptz DEFAULT now()

### push_subscriptions
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
subscription jsonb NOT NULL,
created_at timestamptz DEFAULT now()

### saved_itineraries
user_id, destination, trip_data (jsonb), stage, selected_places (jsonb), created_at

### Other existing tables
- esims — user eSIM records
- usage_logs — itinerary search tracking
- users — legacy (profiles is active)
- waitlist — waitlist signups

### Sequences
- reseller_code_seq — global reseller code sequence
- referral_code_seq — global USR- referral code sequence

---

## Reseller System

### Code format
[COUNTRY_ISO]-[SHORTNAME]-[SEQUENCE] e.g. SG-JOHN-00001
- Global sequence (reseller_code_seq), padded to 5 digits
- Immutable once created, generated server-side

### Attribution
- ?ref= captured on any page load → localStorage (30 days)
- Auto-fills at checkout from profile (preferred_reseller_code) or localStorage
- First purchase → saved to profiles.preferred_reseller_code
- Lifetime activity-based (dormant after 12 months no purchase)
- attribution_months = 0 (lifetime) | 12 | 24

### Commission
- commission_pct % of net price (after discount)
- Customer discount separate from reseller commission
- Tracked per order in orders.reseller_code + orders.discount_sgd

### Reseller portal
- Resellers log in as normal users
- If user_id linked on resellers table → Reseller tab visible in Dashboard
- Shows: summary cards, shareable link, anonymised orders (first name only)
- Read-only, no copy/export, no right-click on table

---

## User Referral System (USR- codes)

### Code format
USR-[FIRSTNAME]-[SEQUENCE] e.g. USR-DAVID-00001
- Global sequence (referral_code_seq), padded to 5 digits
- Generated on first visit to Dashboard Referral tab
- Stored in profiles.referral_code

### Attribution
- Same ?ref= localStorage capture as reseller codes
- On first purchase by referred user → SGD 2.00 wallet credit to referrer
- No self-referral, first purchase only, push notification fires to referrer
- Stored in profiles.referred_by + profiles.referral_credit_earned

### Admin visibility
- Admin → Reseller Sales → USR- Referrals tab

---

## Corporate Accounts System

### Account Structure
- **Corporate Master Account** — company admin, manages wallet, staff, exports
- **Staff Sub-accounts** — invited via email token, purchases charged to corp wallet

### Registration Flow
1. Company visits /corporate/register
2. Step 1: Company name, country (dropdown), UEN (SG only, optional), contact email (work email required — free domains blocked)
3. Step 2: Admin personal details + password
4. Account created with is_active=false, approval_status='pending'
5. Admin (davidlim@juzgo.world) receives email notification via Resend
6. Applicant receives 48hr review email via Resend
7. Admin approves via Admin → Corporate tab → ✓ Approve
8. Company receives approval email via Resend, account unlocks

### Known Bug
- After registration, profiles.is_corporate / corp_id / corp_role are not always auto-updated
- Workaround: manually set in Supabase → Table Editor → profiles
- Fix planned for next session

### Free Email Domain Block
20+ domains blocked including: gmail, outlook, hotmail, yahoo, icloud, protonmail etc.
Enforced on both frontend (CorporateRegister.js) and backend (server.js).

### Approval Guards
- is_active=false by default (wallet and corp checkout blocked until approved)
- Duplicate contact_email check (server-side)
- Duplicate user_id check (server-side)
- Honeypot field (frontend bot trap)

### Staff Invitation Flow
1. Corp admin sends invite from /corporate/dashboard
2. Backend creates corp_invites row with 48-char hex token
3. Resend delivers invite email with single-use link to staff
4. Staff visits /corporate/invite/:token
5. Staff registers → profile upgraded (is_corporate=true, corp_role='staff')
6. Staff purchases → corp wallet deducted at checkout

### Corporate Wallet
- Deducted directly from corporates.wallet_balance at checkout (payment_method='corp_wallet')
- Only visible to corp staff with approved corp (is_active=true, approval_status='approved')
- Stripe top-up: POST /corporate/wallet/topup → PaymentIntent → webhook credits via increment_corp_wallet()
- Stripe top-up UI: built in CorporateDashboard Wallet tab (preset amounts + CardElement)

### Admin Controls
- Admin → Corporate tab — two sections: ⏳ Awaiting Approval / Approved Accounts
- Approve button → POST /admin/corporates/:id/approve → is_active=true + email to company
- Suspend / Reactivate toggle for approved accounts

---

## Admin Dashboard (/admin)

### Access
- REACT_APP_ADMIN_EMAIL (frontend) + ADMIN_EMAIL (backend)
- Currently: davidlim@juzgo.world
- ⚙️ Admin link in Navbar — admin email only

### Tabs
| Tab | Purpose |
|---|---|
| Orders | All orders, filter by status, edit inline |
| Users | All profiles, add credits, gift plan, reset password |
| Wallet Top-ups | Stripe history — read only |
| Usage Logs | Itinerary search logs — read only |
| Resellers | Create/edit/deactivate, set commission + discount |
| Reseller Sales | Attribution, commission owed, USR- referrals, CSV export |
| Analytics | Revenue by day/month, top countries, plans, payment split (incl. corp_wallet), YTD |
| Corporate | Pending approvals + approved accounts, Approve/Suspend/Reactivate |

---

## Push Notifications (PWA)
- VAPID keys in Render + Cloudflare env vars
- Triggers: order confirmed, wallet top-up, gifted plan, referral credit earned
- User control: Dashboard notifications toggle
- iOS: requires home screen install (16.4+)

---

## Navbar
Logged out: My Itinerary → Plans → T&C → Register → Login → Language Toggle
Logged in:  My Itinerary → Plans → Dashboard → Purchases → Saved Trips → T&C → 🏢 Corp Portal (corp admins only) → ⚙️ Admin (admin only) → Logout → Language Toggle

---

## Completed Work
- [x] Full React app with all pages and routes
- [x] Airalo eSIM plans via Cloudflare Worker
- [x] Stripe card + eWallet checkout
- [x] Supabase auth + profiles
- [x] PWA + push notifications
- [x] i18n EN/中文/日本語/한국어
- [x] MyItinerary — Claude AI chatbot + trip planner + Leaflet map
- [x] Cloudflare Pages + Render deployment
- [x] Admin dashboard (/admin) — 8 tabs
- [x] Reseller system — codes, attribution, commission, checkout integration
- [x] ?ref= URL capture → localStorage
- [x] ⚙️ Admin nav link (admin only)
- [x] Analytics tab — revenue charts, top countries, plans, YTD
- [x] Dashboard reseller portal tab
- [x] User referral codes (USR- prefix, wallet credit reward)
- [x] Corporate accounts — register, dashboard, invite, checkout, admin tab
- [x] Corporate manual approval — 48hr review, pending banner, email notifications
- [x] Work email enforcement for corporate (20+ free domains blocked)
- [x] SPA route fallback (_redirects) for Cloudflare Pages
- [x] Fixed Itinerary.js build error (unterminated string line 169)
- [x] Real email delivery via Resend (all transactional emails)
- [x] Corporate wallet Stripe top-up UI (preset amounts, CardElement, webhook)
- [x] 🏢 Corp Portal navbar link for corp admins
- [x] Forgot Password link on Login page
- [x] Fixed CorporateRegister.js missing country dropdown
- [x] Supabase keep-alive cron — claude-proxy scheduled() handler, every 3 days @ 09:00 UTC
- [x] Brand rename: esimconnect → juzgo, esimconnect.world → juzgo.world

---

## Remaining Work

PHASE 3 — Growth ← CURRENT
  [ ] Fix corp registration profile bug (is_corporate/corp_id/corp_role not always set on signup)
  [ ] Password strength enforcement on registration (uppercase, digits, special chars)
  [ ] Purchases page — live eSIM status via Airalo API (pending Airalo onboarding)
  [ ] Guest checkout improvements
  [ ] Multi-currency support
  [ ] Render upgrade to Starter $7/mo

PHASE 4 — Expansion
  [ ] Airalo API integration — map out and display live data plans (replaces MOCK_PACKAGES in claude-proxy)
  [ ] Rollover loyalty (unused data → wallet credit at plan expiry)
  [ ] Plan tier grouping — Country / Regional / Global tabs on Plans page
  [ ] Reseller mini-sites (/r/:slug)
  [ ] Wholesale pricing tier
  [ ] Self-serve reseller signup
  [ ] Twilio VoIP dialler
  [ ] Corporate plan whitelist (corp admin selects allowed plans)
  [ ] Corporate monthly statement CSV/PDF export

---

## Product Roadmap

### Data Plan Categories (post-Airalo onboarding)
Airalo provides fixed data+validity bundles — we cannot create custom plans.
Our value-add is categorisation, branding, pricing markup, and account structure.

Note: until Airalo onboarding completes, the Plans page renders mock data from
MOCK_PACKAGES inside the claude-proxy worker. Mock operator names visible on
the live Plans page are placeholders (e.g. "Changi Connect" for SG, "Sakura
Mobile" for JP, "Seoul Connect" for KR, "ThaiFi" for TH, "Boleh Connect" for
MY, "OzConnect" for AU, "BritConnect" for GB, "StarConnect" for US). These
will be replaced with real Airalo operator data when the worker switches from
MOCK_PACKAGES to live Airalo API responses.

| Category | Target User | Source |
|---|---|---|
| Standard — By Country | Tourists, short trips | Airalo single-country plans |
| Regional | Frequent travellers, backpackers | Airalo regional plans (Asia, Europe, SEA etc.) |
| Global | Business travellers | Airalo global plans |
| Corporate Bundles | IT/travel managers | Airalo plans + our corporate account layer |

Pay-As-You-Go is NOT available via Airalo — requires a different provider (future consideration).

---

## Files In This Project
| File | Purpose |
|---|---|
| CONTEXT.md | This file |
| esimconnect-reseller-context.docx | Full reseller + corporate design spec |
| src/App.js | Routes + ?ref= capture |
| src/index.js | React root + SW + LanguageProvider |
| src/lib/supabase.js | Supabase client |
| src/lib/i18n.js | i18n context + translations |
| src/lib/pushNotifications.js | Web Push helpers |
| src/pages/Home.js | Landing page |
| src/pages/Plans.js | eSIM plan browser |
| src/pages/Login.js | Login + Forgot Password |
| src/pages/Checkout.js | Checkout + reseller code + corp wallet |
| src/pages/OrderConfirmation.js | Post-purchase |
| src/pages/Dashboard.js | User dashboard — Overview / Referral / Reseller Portal tabs |
| src/pages/Dashboard.module.css | Dashboard styles |
| src/pages/Wallet.js | eWallet top-up |
| src/pages/Wallet.module.css | Wallet styles |
| src/pages/Itinerary.js | MyItinerary — Claude AI + map |
| src/pages/Purchases.js | Order history |
| src/pages/FindMyOrder.js | Guest order lookup |
| src/pages/SavedItineraries.js | Saved itineraries |
| src/pages/Admin.js | Admin dashboard — 8 tabs |
| src/pages/Admin.module.css | Admin styles |
| src/pages/CorporateRegister.js | Corporate signup — 2-step + country dropdown |
| src/pages/CorporateRegister.module.css | Corporate register styles |
| src/pages/CorporateDashboard.js | Corporate admin dashboard + Stripe wallet top-up |
| src/pages/CorporateDashboard.module.css | Corporate dashboard styles |
| src/pages/CorporateInvite.js | Staff invite acceptance |
| src/pages/CorporateInvite.module.css | Invite styles |
| src/components/Navbar.js | Nav + admin link + corp portal link |
| src/components/Navbar.module.css | Navbar styles |
| src/components/LanguageToggle.js | Language dropdown |
| src/components/LanguageToggle.module.css | Language styles |
| src/components/Footer.js | Footer |
| src/components/AffiliateBar.js | Affiliate bar |
| src/components/TrustBadge.js | Trust badge |
| src/styles/global.css | Global styles |
| public/manifest.json | PWA manifest |
| public/sw.js | Service worker + push handler |
| public/_redirects | Cloudflare Pages SPA route fallback |
| Server/server.js | Express backend — all endpoints + Resend email |
| Server/package.json | Backend deps (web-push, resend) |
| Server/.env | Backend env vars |
| Cloudflare Worker (claude-proxy) | Claude API + Airalo proxy + Supabase keep-alive scheduled() — edited via Cloudflare dashboard, not in this repo |

---

## Git Commands
```bash
cd /e/Kairos/juzgo
git add [files]
git commit -m "description"
git push origin main
```

---

## Session Log

### April 15, 2026
Completed: profiles/wallet_topups/voip_calls, PWA, Wallet, backend, Stripe tested

### April 16, 2026 — Session 1
Completed: .gitignore, Cloudflare Pages, Render deploy — Commit: cfeeb28d

### April 16, 2026 — Session 2
Completed: eWallet in Checkout, payment_method column — Commits: a4811890, 84862cc1

### April 17, 2026 — Session 3
Completed: Stripe webhook, CORS, RLS — Commits: 13c69436, de6b75c1

### April 17, 2026 — Session 4
Completed: Animated SVG globe logo, navbar height — Commits: bad54e6e → 49fc6ae1

### April 17, 2026 — Session 5
Completed: Full i18n system, LanguageToggle — Commits: 82d04c09, 022cae36

### April 24, 2026 — Session 6
Completed: t() wired into all pages — Commit: 6842462d

### April 27, 2026 — Session 7
Completed: DestinationChatbot, food recs, logo, markdown — Commits: 109eaa9d → 529a0ff2

### April 28, 2026 — Session 8
Completed: Push notifications end-to-end — Commits: 239c9e07 → 5a629d33

### April 29, 2026 — Session 9 (Admin + Reseller)
Completed:
- Reseller system fully designed (juzgo-reseller-context.docx)
- Supabase: resellers table, reseller_code_seq, orders + profiles columns
- Server/server.js: 15 new admin + reseller endpoints
- Admin dashboard: 7 tabs (Orders, Users, Wallet, Logs, Resellers, Sales, Analytics)
- Analytics: revenue by day/month, top countries, plans, payment split, YTD, CSV export
- Checkout.js: reseller code field, auto-fill, live discount, profile save
- App.js: /admin route + ?ref= localStorage capture
- Navbar.js: ⚙️ Admin link (admin only)
- Fixed Itinerary.js build error (line 169 unterminated string)

Files: Server/server.js, src/pages/Admin.js+css, src/pages/Checkout.js,
       src/pages/Itinerary.js, src/App.js, src/components/Navbar.js
Commits: 6128c5f0, 479fec9a, 3f763221, 74239aa2

### April 29, 2026 — Session 10 (Dashboard Reseller Tab + USR- Referral Codes)
Completed:
- Supabase: referral_code, referred_by, referral_credit_earned added to profiles; referral_code added to orders; referral_code_seq sequence; backfilled existing users (USR-DAVID-00001, USR-DAVID-00002)
- Server/server.js: POST /referral/generate, GET /referral/my-stats, POST /order/complete (referral credit hook), GET /admin/referral-stats, /reseller/validate updated for USR- codes
- Dashboard.js: tab bar (Overview / Referral / Reseller Portal), Referral tab (code, share link, copy button, stats, referred users), Reseller Portal tab (summary cards, share link, anonymised orders, read-only)
- Admin.js: email lookup in Reseller creation (type email → Look Up → UUID auto-fills), USR- Referrals tab in Reseller Sales, Navbar added to Admin page
- Fixed Server/.env (PORT + STRIPE_SECRET_KEY were merged, ADMIN_EMAIL was missing)
- Referral logic: SGD 2.00 wallet credit on referred user's first purchase only, no self-referral, push notification fires to referrer

Files: Server/server.js, Server/.env, src/pages/Dashboard.js, src/pages/Dashboard.module.css, src/pages/Admin.js
Commits: 35dd3168, 20028670, 94a3bf5d, 425f85c5

### April 29, 2026 — Session 11 (Corporate Accounts)
Completed:
- Supabase: corporates table (company_name, company_country, uen, contact_email, wallet_balance, is_active, approval_status), corp_invites table, profiles columns (is_corporate, corp_id, corp_role), referral_code_seq
- Server/server.js: 9 new corporate endpoints:
  POST /corporate/register (with free email block, duplicate guards, pending approval default)
  POST /corporate/invite
  GET /corporate/invite/:token
  POST /corporate/invite/accept
  GET /corporate/dashboard
  POST /corporate/wallet/topup (Stripe PaymentIntent)
  GET /admin/corporates
  PATCH /admin/corporates/:id
  POST /admin/corporates/:id/approve (+ approval email to company)
- Webhook: corp_wallet_topup PaymentIntent type handled
- CorporateRegister.js: 2-step form → success screen, country dropdown, SG UEN conditional, work email enforcement (20+ free domains blocked), honeypot bot trap, 48hr messaging
- CorporateDashboard.js: sidebar nav, Overview/Staff/Orders/Wallet tabs, invite flow, CSV export, pending approval amber banner
- CorporateInvite.js: token validation, staff registration, corp profile upgrade
- Admin.js: 8th Corporate tab — pending (amber) + approved sections, ✓ Approve button, Suspend/Reactivate
- Checkout.js: corp wallet payment option (staff only, approved corps only, corp_wallet payment_method)
- App.js: 3 new corporate routes
- public/_redirects: SPA fallback for all routes (Cloudflare Pages)
- Manual approval flow: is_active=false on register → admin email notification → applicant 48hr email → admin approves → company approval email

Files: Server/server.js, src/App.js, src/pages/Admin.js, src/pages/Checkout.js,
       src/pages/CorporateRegister.js+css, src/pages/CorporateDashboard.js+css,
       src/pages/CorporateInvite.js+css, public/_redirects
Commits: ab59bade, df6dd779, 240d7089, c52a295d

### April 30, 2026 — Session 12 (Email, Corp Wallet Top-up, Corp Portal Navbar, E2E Test)
Completed:
- Resend email integration — replaced console.log sendEmail() with real Resend API
- Staff invite email wired up in /corporate/invite endpoint (was console.log only)
- Corporate wallet Stripe top-up UI — preset amounts (SGD 50/100/200/500), CardElement, webhook balance credit confirmed working
- 🏢 Corp Portal navbar link for corp admins (checkCorpAdmin queries profiles on auth state change)
- Fixed CorporateRegister.js — missing company_country dropdown (was causing all registrations to fail silently)
- Stripe webhook recreated in new Workbench UI (old interface deprecated)
- Fixed STRIPE_WEBHOOK_SECRET whitespace issue in Render env vars
- Added Forgot Password link to Login page (type email → click link → Supabase sends reset email)
- Supabase URL Configuration set: Site URL = https://juzgo.world, Redirect = https://juzgo.world/**
- End-to-end test passed: register → pending → approve (email delivered) → invite staff (email delivered) → corp wallet top-up SGD 50 confirmed
- npm install resend in Server/

Files: Server/server.js, Server/package.json, src/pages/CorporateDashboard.js,
       src/pages/CorporateDashboard.module.css, src/components/Navbar.js,
       src/pages/CorporateRegister.js, src/pages/Login.js
Commits: a39437c2, 71a46bd9, c299f6ce

### May 19, 2026 — Session 13 (Ops — Supabase keep-alive cron)
Completed:
- Triggered by Supabase pause warning email (7-day inactivity threshold)
- Manual SQL ping run first to stop pause clock:
    SELECT count(*) FROM countries;  → returned 0, activity registered
- Added scheduled() handler to claude-proxy worker (edited directly in Cloudflare dashboard — worker is not deployed via Wrangler/Git):
    Query: GET /rest/v1/countries?select=id&limit=1
    Uses SUPABASE_ANON_KEY (countries is RLS-free public read, no service key needed)
    Logs status + ISO timestamp to console
- Cloudflare claude-proxy worker:
    - Edit Code → merged scheduled() as sibling of fetch() inside index_default object → Deploy
    - Verified Plans page still loads after deploy (proves existing fetch handler intact)
    - Settings → Variables and Secrets → added SUPABASE_URL + SUPABASE_ANON_KEY (both as Secret type)
    - Settings → Trigger Events → Add Cron Trigger: "0 9 */3 * *"
    - Settings → Observability → Logs: Enabled
- Cron registered, handler bound to scheduled(), next run: Tue 19 May 2026 09:00 UTC
- Bug squashed pre-deploy: initial draft added a second `export default { ... }` block at the bottom of the file, which would have either failed to deploy or silently overridden the existing fetch handler and broken the live site. Fix: merged scheduled as a sibling method inside the existing `index_default` object, keeping the single `export { index_default as default }` statement intact.
- Manual cron firing not available in Cloudflare UI — verification deferred to first scheduled run.

Observed (not actioned this session):
- MOCK_PACKAGES in claude-proxy hardcodes invented operator names per country
  ("Changi Connect" for SG, "Sakura Mobile" for JP, "Seoul Connect" for KR, etc.).
  These are placeholder names visible on the Plans page until Airalo onboarding
  completes and the worker switches from MOCK_PACKAGES to live Airalo API responses.

Files changed:
- claude-proxy worker (Cloudflare dashboard — not in git repo)
- CONTEXT.md
Commits: [TBC — fill in after `git push`]

### June 27, 2026 — Session 14 (Brand rename)
Completed:
- Full brand rename: esimconnect → juzgo, esimconnect.world → juzgo.world (all lowercase)
- Updated CONTEXT.md — all references to esimconnect/esimconnect.world replaced
- Code-level changes required (see checklist below)

Files to update in codebase:
- public/manifest.json — name, short_name, start_url, scope
- public/index.html — <title> tag
- src/pages/Home.js — any brand name in UI strings
- src/pages/CorporateRegister.js — brand name in UI + email domain block (if juzgo.world used)
- src/components/Navbar.js — brand name / logo text
- src/components/Footer.js — brand name, domain links
- src/components/AffiliateBar.js — brand name
- src/components/TrustBadge.js — brand name
- Server/server.js — email from address (hello@juzgo.world), any brand strings in email bodies
- Server/.env — ADMIN_EMAIL=davidlim@juzgo.world, REACT_APP_ADMIN_EMAIL=davidlim@juzgo.world
- .env (frontend) — REACT_APP_ADMIN_EMAIL=davidlim@juzgo.world, REACT_APP_BACKEND_URL=https://juzgo-backend.onrender.com

Platform-level changes — all completed ✅:
- ✅ Supabase: Site URL → https://juzgo.world, Redirect URLs → https://juzgo.world/**
- ✅ Cloudflare Pages: juzgo.world + www.juzgo.world added as custom domains (Active, SSL); REACT_APP_BACKEND_URL updated to https://juzgo-backend.onrender.com; project internal name still esimconnect (no rename button exists)
- ✅ Render: service renamed to juzgo-backend; ADMIN_EMAIL deliberately left as davidlim@esimconnect.world until juzgo.world mailbox confirmed working
- ✅ Stripe: webhook renamed to juzgo-webhook, URL updated to https://juzgo-backend.onrender.com/webhook
- ✅ Resend: juzgo.world domain verified (Tokyo region); esimconnect.world deleted (free plan = 1 domain)
- ✅ GitHub: repo renamed to KairosAxiom/juzgo, org renamed from esimconnect → KairosAxiom, remote URL updated
- ✅ Email: davidlim@juzgo.world set up via Cloudflare Email Routing → forwards to kairosventure.io@gmail.com (verified, tested working — lands in Gmail, initially in spam, mark Not Spam to train)

### June 29, 2026 — Session 15 (Platform rename sweep)
Completed:
- Supabase URL Configuration: Site URL = https://juzgo.world, Redirect URLs = https://juzgo.world/**
- Render: service renamed esimconnect-backend → juzgo-backend; REACT_APP_BACKEND_URL updated in Cloudflare Pages env vars; ADMIN_EMAIL left as davidlim@esimconnect.world (juzgo.world mailbox not yet ready at time of Render update)
- Cloudflare Pages: juzgo.world + www.juzgo.world added as custom domains (both Active, SSL enabled); REACT_APP_BACKEND_URL = https://juzgo-backend.onrender.com saved
- GoDaddy: nameservers for juzgo.world updated to curt.ns.cloudflare.com + nova.ns.cloudflare.com
- Cloudflare: juzgo.world domain activated (DNS propagation confirmed)
- Resend: esimconnect.world deleted, juzgo.world added and verified; DKIM + SPF + MX records added to Cloudflare DNS
- Stripe: esimconnect-webhook renamed to juzgo-webhook, endpoint URL updated to https://juzgo-backend.onrender.com/webhook (Active)
- Cloudflare Email Routing: davidlim@juzgo.world → kairosventure.io@gmail.com (routing rule Active, both destination addresses Verified, forwarding tested and confirmed working)

Files changed: CONTEXT.md
Commits: d0c83b34 (previous), [TBC this session]

Next session should:
- Update ADMIN_EMAIL in Render + REACT_APP_ADMIN_EMAIL in Cloudflare Pages to davidlim@juzgo.world (mailbox now working)
- Update server.js Resend from address to hello@juzgo.world
- Work through codebase rename checklist: manifest.json, index.html, Navbar, Footer, AffiliateBar, TrustBadge, Home.js, CorporateRegister.js
- Fix corp registration profile bug (is_corporate/corp_id/corp_role not always set on signup)
- Password strength enforcement on registration forms

---

## Key Decisions Log
| Date     | Decision                                        | Rationale                            |
|----------|-------------------------------------------------|--------------------------------------|
| Jun 2026 | Cloudflare Email Routing for davidlim@juzgo.world (not Zoho) | Zoho free plan = 1 domain only; Cloudflare Email Routing is free, instant, no extra cost; forwards to existing Gmail |
| Jun 2026 | ADMIN_EMAIL kept as davidlim@esimconnect.world temporarily | juzgo.world mailbox not confirmed working at time of Render update; will update once forwarding verified |
| Jun 2026 | Cloudflare Pages project internal name left as esimconnect | No rename button exists in Cloudflare Pages; internal name is irrelevant — live domain is juzgo.world |
| Jun 2026 | Resend: deleted esimconnect.world, added juzgo.world | Free plan = 1 domain; fully committed to juzgo.world for all transactional email |
| Jun 2026 | Brand renamed: esimconnect → juzgo              | New brand identity, all lowercase    |
| May 2026 | Supabase keep-alive via CF Worker cron (not GH Actions / Render) | claude-proxy already in production; Render free spins down so unreliable for cron; one surface to maintain |
| May 2026 | Cron schedule: "0 9 */3 * *" (every 3 days)     | Comfortable margin under Supabase 7-day inactivity threshold |
| May 2026 | Keep-alive query: GET /rest/v1/countries?limit=1 | Minimal payload, proves Postgres awake; countries is RLS-free public read |
| May 2026 | Use SUPABASE_ANON_KEY (not service role) in worker keep-alive | countries has no RLS-protected read; anon key already public in frontend; no new attack surface |
| May 2026 | scheduled() merged into existing index_default object | JS only allows one default export; merging as sibling preserves existing fetch handler |
