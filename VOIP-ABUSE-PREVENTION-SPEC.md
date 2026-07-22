# Juzgo VOIP — v1 Scope & Abuse Prevention (v2 — supersedes Session 26 draft)

Drafted: Session 26, July 17, 2026 (continued)
Status: **DESIGN LOCKED — all v1 decisions finalized this session,
including §7's previously-open items.** Upload to the "juzgo.world" Claude
Project knowledge base **in place of** the earlier
`VOIP-ABUSE-PREVENTION-SPEC.md` — this version supersedes it. Also amends
part of `Juzgo VOIP Build.md`'s "Locked v1 scope" section — see §6.

**This is not legal advice.** TCPA and similar outbound-calling law
exposure carries real statutory damages; recommend counsel review of the
Terms of Service before real customer traffic, as noted in the prior draft.

---

## 1. What changed from the original build doc, and why

`Juzgo VOIP Build.md` originally scoped v1 to include outbound calling
("Outbound calls from the app use the same Twilio number as caller ID").
That's now revised: **v1 is inbound-only.** Reasoning, in short:

- The core value proposition was always inbound — *"how do people who
  already have my number reach me"* — not the traveler cold-calling
  strangers. Cutting outbound doesn't weaken the product's actual pitch.
- Outbound calling is the vector that creates real liability exposure
  (TCPA-style statutory damages, Twilio AUP suspension risk to the whole
  shared account). Removing it from v1 removes that exposure almost
  entirely, rather than trying to manage it with rate limits from day one.
- Industry precedent supports gating outbound-style capability behind
  identity verification rather than offering it by default: Google Voice
  now requires identity verification before a new number can send/receive
  anything at all (effective Jan 30, 2026); Skype implemented real KYC in
  Japan specifically to stop outbound impersonation fraud and saw a 90%
  reduction in fraudulent use as a result.

Nothing built this session needs to be undone for this change — the
scaffolding (`voip.js`, the schema) never included an outbound-call
endpoint in the first place, so this is a scope clarification, not a
rollback.

---

## 2. Locked v1 architecture

### Registration (platform-wide, not just VOIP) — soft gate / hard gate split, LOCKED
- Full name, working email, and phone number required at signup for **new
  users** going forward — applies to eSIM and VOIP alike, not a
  VOIP-specific gate
- **Existing users: soft gate.** No forced action required to keep using
  eSIM/other existing features. **Hard gate specifically at the moment of
  attempting a VOIP purchase** — full registration (name/email/phone) must
  be completed before that purchase can proceed. Nobody gets locked out of
  buying data mid-trip over a missing phone number; VOIP specifically is
  the one feature that requires it, since it's the one that actually
  carries the abuse risk this is mitigating
- All test accounts get wiped clean at launch, so this mostly only matters
  for genuine pre-launch real users going forward, not historical test data

### VOIP number = inbound bridge only
- The user forwards calls **from their own real number to** the Twilio
  virtual number (via carrier-side CFU, activated on their own phone) —
  this is what lets calls made to their personal real number reach them
  in-app wherever they physically are in the world. The Twilio number is
  the bridge the forwarded call passes through, not a number Juzgo relays
  calls out to.
- No outbound call origination to arbitrary numbers in v1, full stop
- Caller ID passes through unmodified on inbound (already a locked
  architecture decision from the original doc) — anyone calling the
  Twilio number is calling from their own traceable number; Juzgo adds no
  anonymity on the inbound side
- **No reply-only tier — LOCKED.** Considered a middle-ground "call back
  whoever just called you" option without full KYC, decided against it.
  All outbound, including reply-only, sits behind full authentication with
  no exceptions — simpler to reason about and keeps the inbound-only
  boundary completely clean rather than partially permeable

### Outbound calling = future, opt-in, gated tier — not v1
- Only available after a user completes full identity verification (real
  document check, not just a declaration) — modeled on Skype's Japan
  approach
- Treated as a distinct feature to design and build later, not a v1
  concern; nothing in v1's schema or endpoints needs to anticipate it
  beyond leaving room for a `voip_numbers.outbound_enabled` -style flag
  down the line

### Billing — card-locked, not wallet-only. UX: technically folded in, labeled separately — LOCKED
- VOIP number purchase requires a card on file (via Stripe), not a
  wallet-balance check alone
- **UX decision:** reuse the same underlying Stripe card-storage/UI
  component already used elsewhere in the app (no need to build a second
  card-entry flow from scratch), but **label it as its own section** —
  e.g. "Payment card for VOIP rental" — distinct from "Wallet balance."
  Reasoning: the wallet is a prepaid-balance model (top up, spend down);
  VOIP needs recurring direct card billing independent of wallet balance.
  Silently drawing from "the wallet" in the UI while actually charging a
  card behind the scenes would be the confusing version — keeping the
  labeling distinct avoids that while still reusing the component
- Renewal charges hit that card directly on schedule, regardless of
  wallet balance, and **continue until the user actively releases the
  number** in-app — no automatic grace-period-then-release for
  insufficient wallet funds, because there's no "insufficient funds" state
  when the card is the source of truth
- This replaces the `grace_period` pathway sketched in the original
  `voip.js` scaffolding's billing job — that logic assumed wallet-only
  billing and needs revising once this is built (not yet done — see §5)
- Rationale: abandonment becomes a bill the user has active incentive to
  stop (nobody wants to keep paying to indirectly receive calls they could
  get directly for free) rather than a chore they have no reason to do

### Twilio-side suspend mechanism — the automated backstop for card failures
Confirmed via Twilio's own API docs this session: a number's `VoiceUrl`
can be updated at any time without releasing the number. Two ways to use
this for suspension:
- Clear `VoiceUrl` entirely → Twilio automatically treats the number as
  "out of service" for inbound calls (calls aren't even logged/billed)
- Or point it at TwiML using `<Reject>` as the first verb → call is
  rejected immediately, not billed, can optionally play a short message
  first ("this number is no longer in service")

This is genuinely different from — and does not require — touching the
user's phone-side call forwarding (CFU), which remains permanently outside
Juzgo's control (no consumer telco API exists for that; this was already
flagged in the original build doc and still stands). What this DOES let
Juzgo do automatically, no human intervention:
- On a repeated card failure (not immediate — allow retries first), the
  billing job calls Twilio's API to swap `VoiceUrl` to the suspended
  response
- The number stays **suspended, not released** — still owned by Kairos
  Ventures, so it can never be reassigned by Twilio to an unrelated
  third-party customer while suspended
- **Suspended-but-held timeout before actual release — LOCKED at 7 days.**
  Grounded in real data found this session: Twilio's own release process
  already has a built-in safety buffer beyond whatever Juzgo holds a
  number suspended for — releasing a number reserves it for the Kairos
  Ventures account for a further 10 days in case of a change of mind, and
  only after that does it enter a "traffic and capability tests" phase
  before being made publicly purchasable again by anyone else. So the real
  combined buffer before a stranger could possibly acquire the number is
  roughly 7 days (Juzgo suspension) + Twilio's own subsequent hold/testing
  cycle — meaningfully longer in practice than "7 days" sounds in
  isolation, which is why 7 days is workable despite being much shorter
  than the 90-day figure floated earlier in this doc's first draft.
  Prioritizes fast recycling (numbers need to get back into rentable
  inventory quickly) without reopening the stranger-reassignment risk this
  mechanism exists to prevent
- Failure mode for the user if they never disable CFU: their calls simply
  fail to connect (same as dialing a disconnected line) rather than
  silently reaching a stranger — a materially safer failure mode than
  what unrestricted recycling would produce

### Reminder cascade (automated nagging, not automated fixing)
Still needed as the thing that actually gets the user to disable CFU
themselves, since nothing can force that action. **Timing revised given
the 7-day suspension window is now the primary defense, not a cushion —
front-loaded rather than spread over 30 days:**
- Push notification + email immediately on suspension, then escalating
  follow-ups within the 7-day window itself (e.g. immediately, day 2, day
  5) rather than day 1/7/30 as originally sketched — 7 days doesn't leave
  room for a slow-burn reminder schedule
- In-app "I've disabled forwarding" confirmation step — doesn't verify the
  claim, but gives both a nagging trigger and a liability record that the
  user was clearly and repeatedly told
- Continued call volume arriving at a suspended number is itself a signal
  CFU is still active — can automatically bump reminder urgency

### Number provisioning — just-in-time, not held inventory
Confirmed this session: Juzgo does not need to hold its own stock of
numbers. A Twilio number is fetched live via the Available Numbers API at
the moment of purchase (already how the original build doc scoped step
3 — "not pre-synced... since availability changes constantly"), Twilio
provisions it from its own live carrier inventory, and it's typically
ready within seconds — same shape as Airalo's per-order eSIM issuance,
not a warehouse model. The one thing that IS a one-time, not per-purchase,
prerequisite: the country's regulatory bundle (§ see
`Twilio-Regulatory-Compliance.md`) must already be approved before any
customer can buy a number from that country — that compliance work
happens once per country up front, not per transaction, so it doesn't
slow down the individual customer's purchase once a country is unlocked.

---

## 3. Revised threat model (given inbound-only v1)

| # | Vector (from Session 26 original draft) | Status under inbound-only v1 |
|---|---|---|
| 1 | Outbound calling as semi-anonymous line | **Eliminated** — no outbound capability exists in v1 |
| 2 | Fake-account number farming | **Reduced, not eliminated** — registration requirements (name/email/phone) raise the bar; still worth a one-active-number-per-account check |
| 3 | Stolen-card wallet funding | **Changed shape** — now stolen-*card* funding directly (Stripe-level fraud, not wallet top-up abuse); Stripe's own fraud tooling is the first line of defense here, not something to rebuild |
| 4 | Voicemail recording/transcription consent | **Unchanged** — still fine as scoped (caller-initiated, implied consent), still flag if ever extended to live-call recording |
| 5 | Number recycling → stranger inherits calls | **Substantially mitigated** — suspend-not-release mechanism (§2) plus Twilio's own reclaim/testing lifecycle means a number only ever becomes available to someone else well after an explicit, delayed release action, not passively |
| 6 | High-risk destination calling / toll fraud | **Eliminated for v1** — no outbound means no destination to call |
| 7 (new) | Inbound spam/robocalls hitting the Twilio number itself | **Present, but not Juzgo-caused** — same category as ordinary phone spam; the traveler's real number would receive the same calls regardless of Juzgo. Worth monitoring if it becomes a support-ticket pattern, not a launch blocker |

Net effect: inbound-only removes 3 of the original 6 vectors entirely and
meaningfully reduces 2 more. This is a substantially smaller threat
surface than the original bidirectional design, achieved by cutting scope
rather than adding defensive complexity — cheaper to build and cheaper to
reason about.

---

## 4. What Tier 0 (ToS) still needs, revised for inbound-only scope
The original Tier 0 requirement stands — Terms & Conditions still need a
prohibited-use clause and suspension rights before this ships — but the
clause itself can be simpler for an inbound-only feature (no need to
pre-draft outbound-specific prohibited-use language until outbound is
actually being built). Still recommend counsel review regardless, given
the platform-wide registration requirement change also touches privacy
disclosure (collecting phone numbers at signup needs to be reflected in
the Privacy Policy).

---

## 5. Not yet built — carries forward to next session
All design decisions below are now locked (§7 closed out) — this is a
pure implementation list, nothing left to decide before building it:
- Registration flow changes — soft gate platform-wide, hard gate
  specifically before first VOIP purchase — touches `Register.js`, the
  signup trigger, and the VOIP purchase endpoint's pre-check
- `voip.js` billing job (`runVoipRenewalBilling`) needs rewriting: remove
  the wallet-based grace-period logic, replace with card-charge-on-file +
  Twilio suspend-on-repeated-failure (7-day suspended-but-held window, per
  §2) as described above
- Card-on-file capture at purchase time — reuse existing Stripe
  card-storage component, labeled as its own section separate from wallet
  top-up (§2)
- Twilio API calls to actually swap `VoiceUrl` on suspend/reactivate —
  straightforward given the mechanism is now confirmed, just not coded yet
- Reminder cascade (push + email scheduling, front-loaded within the
  7-day window) — `sendPushToUser` already exists in `server.js`, this is
  mostly a scheduling/trigger problem
- Admin VOIP tab (still on the original build order, unchanged)

## 6. Explicit amendment to `Juzgo VOIP Build.md`
That document's "Locked v1 scope → In scope" bullet **"Outbound calling
from the app using the Twilio number as caller ID"** is superseded — moved
to a future/optional tier per §2 above. Everything else in that doc's
locked architecture (the forwarding mechanism, caller ID pass-through,
missed-call → voicemail, the build order sequencing) stands unchanged.

## 7. Decisions — CLOSED
All four items previously open in this section are now locked, folded
into §2 above:
1. **Registration requirement** — soft gate for existing users generally,
   hard gate specifically before first VOIP purchase. New users required
   at signup going forward. Test accounts wiped at launch.
2. **Reply-only outbound tier** — rejected. All outbound, no exceptions,
   sits behind full authentication.
3. **Card-on-file UX** — folded into the existing Stripe card-storage
   component technically, but labeled as its own distinct section in the
   UI (not merged into "wallet" conceptually).
4. **Suspended-but-held timeout before release** — 7 days, grounded in
   Twilio's own additional reclaim/testing buffer on top of that.
