# VOIP — Next Session Brief (written end of Session 28)

Supersedes the Session 27 brief of the same name. Detail lives in
`Juzgo VOIP Build.md` (original architecture),
`VOIP-ABUSE-PREVENTION-SPEC.md` v2, and `CONTEXT.md`'s Session 28 log.
This is the fast-orientation summary.

## Session 29 is decided: number inventory UI

Decided at the end of Session 28, not left open. Build the Dashboard view of
numbers the user holds. Do the `<Dial><Client>` sandbox test after it.

The reasoning, and the counter-reasoning, are both recorded below — read them
before starting, because the deferral is now at five sessions and that is worth
going into with open eyes rather than by default.

## Where things actually stand

**The card-locked purchase path is verified end to end.** Profile gate → card
gate → row insert → Stripe charge → detach protection, all exercised against the
deployed backend with a real card and confirmed in the database rather than from
endpoint self-reports. `/voip/eligibility` returns `eligible: true` for the first
time.

**There is exactly one piece of VOIP frontend:** the card-attach component on the
Dashboard's VOIP tab (commit `bfaf1085`). It is the only consumer the backend has.

**Still in mock mode by design.** `VOIP_TWILIO_LIVE` and
`VOIP_TWILIO_ALLOW_PURCHASE` remain unset. Every mutating Twilio call logs what it
would have done. Purchases write rows with `twilio_sid: null` — no number is
actually owned at the carrier.

## What Session 29 builds

Pure frontend against endpoints that already exist in `voip.js`:

- `GET /voip/numbers` (line 635)
- `POST /voip/numbers/:id/release` (line 657)
- `POST /voip/numbers/:id/reactivate` (line 716)

Same shape as Session 28: read the handler before calling it, build a
self-fetching component, mount it on the Dashboard VOIP tab beneath the card
section.

Covers steps 11–12 of the intended user flow:

1. **What number the user holds** — number, country, locality, status.
2. **Days remaining until renewal** — `next_renewal_at` is on the row.
3. **CFU forwarding instructions** — how to forward calls from their real handset
   to the virtual number. This is the piece the whole abuse-prevention design
   depends on: the user has to perform this action manually, and the dunning
   cascade exists largely to get them to undo it. Worth writing carefully.
4. **Release action**, with confirmation.
5. **Reactivate**, for a suspended number.

Status display needs to handle the full set the dunning cascade writes:
`active`, `past_due`, `suspended`, `pending_release`, `released`. A number in
`past_due` or `suspended` should say what the user must do, not just show a
label.

It also makes test row `cb558e94` visible in the UI instead of only queryable in
Supabase.

## The `<Dial><Client>` deferral — five sessions

Deferred in Sessions 25, 26, 27, 28, and now again. Each deferral has had a
defensible local reason; Session 28's was that the Twilio account is still on
trial, and trial restrictions (verified numbers only for outbound, a prepended
Twilio announcement) can make a correct implementation look broken.

**The risk is real and it compounds.** The storefront, billing path, dunning
cascade and suspend mechanism are all built on an untested assumption: that
`<Dial><Client>` rings a Voice SDK client the way the architecture expects. If it
does not, some of that needs rethinking, and the cost of finding out grows with
every session built on top.

**The mitigating argument, which is genuine:** the blast radius is narrower than
"everything". Storefront, checkout, inventory and billing are about selling and
managing a number, not about what happens when it rings. A wrong assumption
mainly invalidates the dialler, call screen and voicemail — none of which is
built yet. The exception is if the fix requires a different Twilio product or a
different provider, which could reach back into the data model.

**The unlock is $20.** Upgrading is a prepaid balance, not a fee — no upgrade
charge, and the trial number carries over. The existing $10.90 trial balance is
forfeited on upgrade and cannot be applied. Pay it before Session 30 so the test
is not deferred a sixth time for the same reason.

## Context that shapes priorities

**eSIM fulfillment remains the higher-value blocker**, and it is not a technical
one. Airalo partner approval is already granted; production access is mechanical
once the company is incorporated, with no further application. Singapore
incorporation is online and instant.

The actual constraint is that incorporation needs a nominee arrangement to avoid
exposure with current employment — not a contractual conflict, but a
discretionary-employer risk. That is a judgment call with real ongoing costs
(nominee fees, legal title held by a third party, an unwind later) and is being
treated carefully rather than rushed. Worth a Singapore corporate lawyer's hour,
and worth knowing that professional corporate service providers offer nominee
services with declarations of trust and defined exits — often safer than
involving a trusted individual, since a professional firm has no upside in a
dispute.

**Consequence for planning:** eSIM fulfillment is blocked on something outside
the build queue and indefinite in timing. VOIP is therefore the track where
session time converts into progress — not because it is more valuable, but
because it is available. Revisit the moment incorporation resolves.

## Small things worth folding into Session 29

- **Guard the Save button in `VoipPaymentCard`** while a save is in flight. A
  double-click currently throws `IntegrationError: could not retrieve data from
  the specified Element` — harmless, the card still saves, but it is a real edge
  case. Ten-minute fix.
- **Detach the previous PaymentMethod after a successful replace.** `/attach`
  overwrites `default_payment_method_id` without detaching the old card, so cards
  accumulate on the Stripe Customer.
- **Delete test row `cb558e94`** (`voip_numbers`) once the inventory UI has been
  used to look at it. Its `next_renewal_at` is 2026-08-23;
  `runVoipRenewalBilling()` will try to charge it again after that date.
- **Remove the two Project Knowledge docs sitting untracked in the repo root**
  (`CONTEXT-session27-append.md`, `VOIP-NEXT-SESSION-BRIEF (1).md`) before a
  `git add .` commits them.
- **Check for other positional slicing over config arrays.** Dashboard's
  `TABS.slice(0, 2)` would have made the new VOIP tab invisible to every
  non-reseller. The pattern fires silently every time someone appends an entry.

## Watch out for

- **Twilio trial account** ($10.90) — pay the $20 upgrade before Session 30.
- **`?country=SG` will 502** until the Singapore Regulatory Bundle clears. Status
  not checked since Session 26 — check it early, it may well have cleared. Test
  with `?country=US` meanwhile.
- **`BACKEND_URL` must stay `esimconnect-backend.onrender.com`** even though the
  Render service displays as `juzgo-backend`. Signature validation reconstructs
  this URL; a mismatch 403s every webhook and looks like a signature bug.
- **Verify migrations by querying `information_schema`,** not by hitting an
  endpoint. Session 26's migration was believed applied for a full session
  because a passing endpoint test never touched the database.
- **Verify charges in `voip_charges`, not from the purchase response.** Same
  lesson, one layer up. Session 28 did this and it is why the Stripe path can be
  trusted.
- **Read endpoint handlers before calling them.** Session 28 inferred `/attach`
  behaviour from grep line numbers and was about to guess wrong; reading the
  actual handler settled the replace-card design in one step.
- **Git Bash silently losing its working directory.** If files that definitely
  exist start returning "No such file or directory", check whether `(main)` has
  disappeared from the prompt — the USB drive has remounted and the shell is
  holding a dead path. Re-`cd` fixes it.

## Still not started (unchanged)

- Render cron service calling `runVoipRenewalBilling()` daily
- Admin VOIP tab (number inventory, suspend/release actions)
- Terms & Conditions prohibited-use clause — flagged for actual legal review, not
  just internal drafting
- Number storefront and VOIP checkout — where `VoipPaymentCard` gets its second
  mount point, as a blocking step before payment
- In-app dialler, call screen, voicemail inbox
- P&L dashboard extension for rental revenue vs. Twilio cost
- Registration flow change (locked decision 1) — name/email/phone mandatory at
  signup, platform-wide. Still unscoped against `Register.js`. No longer blocking
  testing, since `profiles.phone` was set manually for the admin account.
