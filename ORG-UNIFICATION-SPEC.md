# Juzgo — Organization Unification Design Spec
Drafted: Session 20, July 8, 2026
Status: DESIGN ONLY — not yet built. Written up for continuity into next session.

---

## 1. Why this exists

Corp registration testing (this session) surfaced that the current Corporate
account model — permanent `profiles.corp_id` / `corp_role` tagging, one org
per user, org-issued staff invites only — doesn't fit a second target
customer: **tour agencies** who want to give travelers (their tour group
members) free or discounted eSIMs, while those travelers keep their account
afterward as ordinary personal Juzgo users.

Rather than build a parallel, one-off system for tour agencies, the decision
was to **unify Corporate and Tour Agency under one underlying model**
("organizations"), since both are fundamentally: an org with a wallet,
issuing something to end users, tracked centrally, admin-approved.

This is a genuine architecture change, not a tweak. It replaces the current
`corporates` / `corp_invites` / `profiles.corp_id` schema.

### Session 20 findings (context for why a rebuild, not a patch)
Live-testing the corp registration flow this session surfaced that several
pieces CONTEXT.md describes as already built are **not present in the live
code** — likely dropped silently across earlier rewrites (the pattern
matches the Navbar corp-portal link, separately found missing and fixed
this session):
- `/corporate/dashboard` had no route at all (fixed this session)
- The staff invite email linked to a route that didn't exist (fixed this
  session, though the whole invite flow is being replaced anyway — see §4)
- **The Admin panel has no Corporate approval tab at all** — zero references
  to "corporate" anywhere in `Admin.js`, despite the backend endpoints
  (`GET /admin/corporates`, `POST /admin/corporates/:id/approve`) existing
  and working. Approval had to be done via raw SQL as a workaround.
- **Checkout.js has no corp wallet payment option** — zero references to
  `corp_wallet`/`corp_id`. A staff member with an approved, funded corp
  wallet currently has no way to spend it.

Both missing pieces (Admin Corporate tab, Checkout wallet option) still need
building regardless of old vs. new schema — noted in §7 build order.

---

## 2. Core principle

**Accounts are always personal-first.** A user's `profiles` row is never
owned by an org. Instead, a user can be *linked* to zero, one, or more
organizations via a junction table. This replaces the current rigid
one-org-per-user model.

The two org types differ in **who initiates the link**:

| | Corporate | Tour Agency |
|---|---|---|
| Registration direction | Org-first: company registers, admin creates staff accounts directly | Member-first: traveler registers personally, then redeems a voucher to link to the agency |
| Link created by | The org admin (creates the staff account outright — no invite/accept step, see §4) | The member (redeems code) |
| Typical duration | Indefinite, employment-based | One trip / one package, though account persists afterward |
| Funding model | Ongoing wallet, staff spend directly | Pooled monthly free credit + prepaid top-up, drawn down per voucher redemption |
| Identity protection | Domain-locked — staff accounts can only be created on the company's verified email domain, preventing personal-email misuse of the corp wallet | Not domain-based — voucher possession is the access control |

A single person **can hold multiple org links concurrently** (e.g. a
corporate employee who separately joins a tour) — nothing in the design
requires exclusivity, and the junction table supports it for free.

---

## 3. Data model

### `organizations` (replaces `corporates`)
```
id                  uuid PK
org_type            text  -- 'corporate' | 'tour_agency'
company_name        text
company_country     text
uen                 text  -- nullable, SG only
contact_email       text
email_domain        text  -- nullable, corporate only. Derived from contact_email
                           -- at registration (e.g. 'acmecorp.com'). Source of
                           -- truth for staff account domain-lock — see §4.
wallet_balance       numeric(10,2) default 0.00   -- prepaid/topped-up funds
free_credit_balance  numeric(10,2) default 0.00   -- current month's remaining free allowance
free_credit_amount   numeric(10,2) default 0.00   -- monthly allowance, set per org by admin
arrangement_start    date
arrangement_end      date
lapse_message        text  -- shown to org once arrangement_end has passed
is_active            boolean default false
approval_status      text default 'pending'  -- 'pending' | 'approved' | 'suspended'
created_at           timestamptz default now()
```
Notes:
- `free_credit_amount` + `arrangement_start/end` are admin-set per org at
  approval time (or editable later), not global constants — different
  agencies can negotiate different deals.
- Corporate orgs can leave `free_credit_amount` at 0 and rely purely on
  `wallet_balance` (i.e. today's behaviour), so this doesn't force free
  credits onto corporate customers who don't want them.
- `email_domain` is single-domain-only in v1 (no multi-domain subsidiary
  support) — good enough until an actual customer needs more.

### `org_links` (replaces `profiles.corp_id` / `corp_role` / `is_corporate`)
```
id          uuid PK
user_id     uuid FK -> profiles(id)
org_id      uuid FK -> organizations(id)
role        text  -- 'admin' | 'staff' (corporate) | 'member' (tour)
status      text default 'active'  -- 'active' | 'revoked'
linked_at   timestamptz default now()
```
- Replaces the flat columns on `profiles`. A profile can have many rows here.
- Corporate: row created immediately when the corp admin creates the staff
  account (see §4 — admin-created, not self-registered; no separate accept
  step, the act of creation *is* the approval).
- Tour: row created when a member redeems a voucher (member-initiated).

### `org_packages` (new — tour agency package/tour-group registration)
```
id                 uuid PK
org_id             uuid FK -> organizations(id)
package_name       text          -- e.g. "July 2026 Bali Group Tour"
requested_credit   numeric(10,2) -- amount the agency intends to allocate to this package
approved           boolean default false  -- auto-approved if pool covers it, else flagged
created_at         timestamptz default now()
```
- Registering a package checks `requested_credit` against the org's current
  pooled `free_credit_balance` + `wallet_balance`.
- If covered: auto-approved, package can start issuing codes.
- If not covered: package registration still saves, but flagged
  `approved = false` with a shortfall notice — agency decides whether to
  top up, shrink the request, or proceed anyway (open question, see §6).
- This gives per-package visibility without a separate ledger per tour —
  actual spend still comes out of the one pooled org balance.

### `org_codes` (tour agency vouchers only — extends reseller-code pattern)
```
id                 uuid PK
org_id             uuid FK -> organizations(id)
package_id         uuid FK -> org_packages(id)
code               text unique
max_redemptions    integer  -- capped, tour vouchers are always batch-limited
redeemed_count     integer default 0
pricing_mode       text  -- 'complimentary' | 'discount_pct' | 'discount_sgd'
discount_value     numeric(10,2), nullable
expires_at         timestamptz, nullable
created_at         timestamptz default now()
```
- **Superseded design note:** an earlier draft of this table also carried a
  `code_type='staff_invite'` variant to replace `corp_invites`. That's been
  dropped — see §4, corporate staff are now created directly by the corp
  admin (system-generated password, no invite/accept flow at all), so this
  table is tour-agency vouchers only. `code_type` column removed accordingly.
- Vouchers carry an embedded agency identifier (the `code` itself, formatted
  similarly to reseller codes, e.g. `TA-[AGENCY]-[PACKAGE]-[SEQ]`) so
  redemptions are traceable to both agency and package at a glance.

### `profiles` — one new column
```
must_change_password  boolean default false
```
- Set `true` when an account is created via admin-generated password (see
  §4). Frontend checks this on login and forces a password-change screen
  before anything else is usable. Cleared to `false` once changed.

### `org_redemptions` (new — the actual draw-down ledger)
```
id             uuid PK
code_id        uuid FK -> org_codes(id)
user_id        uuid FK -> profiles(id)
order_id       uuid FK -> orders(id), nullable
amount_drawn   numeric(10,2)
drawn_from     text  -- 'free_credit' | 'wallet_balance'
redeemed_at    timestamptz default now()
```
- Every redemption records which balance it drew from. Free credit is
  drawn first; once a month's free credit is exhausted, subsequent
  redemptions fall through to `wallet_balance` automatically (see §4).

---

## 4. Key flows

### Corporate registration (org-first) — mostly unchanged from today
1. Company registers via `/corporate/register` equivalent → `organizations`
   row (`org_type='corporate'`), `email_domain` captured from the admin's
   work email (e.g. `admin@acmecorp.com` → `acmecorp.com`).
2. Founding user's `auth.signUp()` fires client-side (existing Session 18
   fix), then an `org_links` row is created (`role='admin'`) instead of
   updating flat profile columns.
3. Admin approves → `is_active=true`.

### Corporate staff creation (admin-initiated, domain-locked — supersedes
### the old invite/accept flow entirely)
This is a deliberate redesign, not a port of the old `corp_invites` +
`CorporateInvite.js` token flow. Reasoning: (a) protects the company from a
colleague using a personal email to opportunistically ride the corp
wallet — the domain check makes that structurally impossible, not just
policy; (b) removes an entire self-registration surface (token page, password
choice, accept step) in favour of one clean admin action.

1. Corp admin, from Corp Portal → Staff, enters **name + work email** only.
2. Backend validates the email's domain against the org's `email_domain`.
   Off-domain emails are rejected immediately — no account, no invite
   record, nothing created. This is the actual enforcement point for "no
   personal-email backdoor into the corp wallet."
3. Backend creates the Supabase auth user directly via the admin API
   (`auth.admin.createUser()`), with:
   - A securely generated random password
   - Email pre-confirmed (no confirmation-email step needed, since the
     admin already vouches for this person)
   - `profiles.must_change_password = true`
4. An `org_links` row is created immediately (`role='staff'`, `status='active'`).
   No separate accept/approval step — the admin creating the account *is*
   the approval, addressing the "corp admin must approve" requirement
   directly rather than adding another gate.
5. Email sent to the staff member: their login email + temporary password,
   instructing them to log in.
6. On first login, the forced password-change screen (driven by
   `must_change_password`) must be completed before anything else in the
   app is usable. Cleared after a successful change.
7. From that point on, it's a normal personal account with an active org
   link — usable for the staff member's own personal Juzgo purchases too
   (paid by card/personal wallet), with the corp wallet available as an
   *additional* payment option at checkout, not a mode that consumes the
   whole account.

### Tour agency onboarding (org-first, but funding-focused)
1. Agency applies/registers → `organizations` row (`org_type='tour_agency'`).
   `email_domain` not applicable here — tour members join via voucher, not
   domain match (member-first, see below).
2. Admin reviews and sets: `free_credit_amount`, `arrangement_start/end`,
   `lapse_message`, approves.
3. Agency (or admin on their behalf) registers each tour/package via
   `org_packages`, declaring `requested_credit`. Checked against pool.
4. Once a package is approved, agency generates `org_codes` (vouchers) for
   that package, capped by `max_redemptions`.

### Tour member redemption (member-first) — the new part
1. Traveler registers as a normal personal user (`/register`, standard flow
   — no special path, this is the whole point).
2. At checkout (or a dedicated "redeem a code" entry point), enters the
   voucher code.
3. Backend validates: code exists, not expired, `redeemed_count <
   max_redemptions`.
4. Checks org's `free_credit_balance` first:
   - If free credit covers it → draw from free credit, log
     `org_redemptions.drawn_from='free_credit'`.
   - Else if `wallet_balance` (agency's own prepaid funds) covers it → draw
     from there instead, log `drawn_from='wallet_balance'`.
   - Else → redemption blocked; member is told the agency's credit is
     exhausted (see open question in §6 on fallback behaviour).
5. On successful draw-down: `org_codes.redeemed_count` increments, an
   `org_links` row is created for the member (`role='member'`) if one
   doesn't already exist for this org, and the order proceeds as
   complimentary or discounted per the code's `pricing_mode`.

### Monthly free credit reset
- Scheduled job (extend the existing Cloudflare Worker `scheduled()` cron,
  which already runs a Supabase keep-alive every 3 days) resets every
  active org's `free_credit_balance` back to `free_credit_amount` on a
  monthly boundary.
- On reset, also checks `arrangement_end` — if lapsed, sets `is_active=false`
  (or a dedicated `arrangement_lapsed` flag) and the org sees
  `lapse_message` next time they log into their dashboard.

---

## 5. What this replaces / deprecates

| Current | Replaced by |
|---|---|
| `corporates` table | `organizations` (with `org_type`, `email_domain`) |
| `corp_invites` table + `CorporateInvite.js` token/accept flow | **Removed entirely** — admin-created staff accounts (system-generated password, forced change on first login). No invite record, no accept page. |
| `profiles.is_corporate` / `corp_id` / `corp_role` | `org_links` rows |
| Corporate wallet checkout (`payment_method='corp_wallet'`) | Same UI slot, now backed by `organizations.wallet_balance` / `free_credit_balance` via `org_redemptions` — this slot doesn't exist in the live Checkout.js at all yet (found Session 20), needs building regardless of which schema wins |
| `CorporateDashboard.js` | Same page, rebuilt to read from `org_links` + show wallet/free-credit split + a "Create Staff Account" form (name + email) replacing "Send Invite" + (for tour agencies) package/voucher management |

**This session's bug fixes (App.js routing, Navbar corp link) are not
wasted** — they fix real breakage in the current schema and remain valid
scaffolding; the components they route to will be internally rebuilt to
read from the new tables rather than being restructured again from scratch.
`CorporateInvite.js` itself, however, is now dead code once this is built —
intentionally, not by omission.

---

## 6. Open questions — need decisions before backend build starts

1. **Redemption fallback when both balances are exhausted mid-month:**
   does the checkout attempt just fail (member told to wait / contact
   agency), or should it gracefully let the member pay full price
   themselves if the agency's credit runs out? (Raised, not yet answered.)

2. **Package registration when request exceeds pool:** confirmed the
   package still saves as unapproved with a shortfall notice — but does
   the agency get a self-service way to top up and re-trigger approval, or
   does this require an admin touchpoint each time?

3. **Voucher code format:** proposed `TA-[AGENCY]-[PACKAGE]-[SEQ]` — confirm
   naming convention, and whether package identifiers should be
   human-readable (e.g. `BALI26`) or system-generated sequences.

4. **Migration of existing corporate data:** there are currently live
   `corporates` rows and `profiles` with `is_corporate=true` (from Session
   20 testing — includes at least one orphaned profile where the
   `corporates` row was deleted but `is_corporate`/`corp_role` weren't
   cleared, since `ON DELETE SET NULL` only nulls `corp_id`). Migration
   script needed to backfill `organizations` + `org_links` from the old
   schema before cutover — not yet scoped.

5. **Discount vs complimentary UX at checkout:** does the member enter the
   code at checkout (reseller-code-style, live discount calc) or is there a
   separate "redeem voucher" step before reaching checkout? Reseller codes
   today do the former.

6. **Password delivery security:** the admin-generated staff password is
   sent by email in plaintext (same trust model as the existing Resend
   setup — no alternative delivery channel exists yet). Acceptable for now
   given `must_change_password` forces an immediate rotation, but worth
   flagging rather than assuming.

7. **RESOLVED — corp admin approval of staff:** originally raised as "corp
   admin must approve staff before Juzgo admin approves" — resolved by
   making staff account creation itself admin-initiated (§4), so the
   admin's action of creating the account *is* the approval. No separate
   confirmation step needed.

---

## 7. Suggested build order (next sessions, not this one)

1. Supabase schema: create `organizations`, `org_links`, `org_packages`,
   `org_codes`, `org_redemptions`; add `profiles.must_change_password`;
   write migration script from `corporates`/`corp_invites`/`profiles` flat
   columns (see open question §6.4 re: orphaned test data cleanup first).
2. Backend: rewrite `/corporate/*` endpoints to read/write new tables;
   keep response shapes backward-compatible with existing frontend where
   possible to reduce blast radius.
3. Backend: domain-locked staff creation endpoint (§4) — validates
   `email_domain`, calls `auth.admin.createUser()` with generated password,
   creates `org_links` row, sends credentials email.
4. Backend: new endpoints for package registration, voucher generation,
   and the redemption/draw-down logic (§4, tour agency side).
5. Scheduled job: monthly free-credit reset + arrangement-lapse check.
6. Frontend: `CorporateDashboard.js` — split into org-type-aware views
   (corporate: staff list + "Create Staff Account" form, replacing "Send
   Invite"; tour agency: package/voucher management).
7. Frontend: Checkout.js — add the corp wallet payment option that doesn't
   currently exist at all, plus voucher redemption entry point for tour
   members (mirroring the existing reseller-code UX).
8. **Admin panel: build the Corporate tab from scratch** — it doesn't
   exist in the live app today despite the backend being ready. Pending/
   approved sections, org_type-aware fields (free-credit/arrangement for
   tour agencies), Approve/Suspend/Reactivate. This unblocks real approvals
   without SQL Editor workarounds.
