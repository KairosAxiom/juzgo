# VOIP — Next Session Brief

Read this first. Detail lives in `Juzgo VOIP Build.md` (original
architecture) and `VOIP-ABUSE-PREVENTION-SPEC.md` v2 (v1 scope + abuse
prevention — supersedes v1 of itself, and amends one bullet of the build
doc). This brief is the fast-orientation summary, not a replacement for
either.

## Where things actually stand

**Built and live-tested (Session 26):**
- Supabase schema: `voip_numbers`, `voip_call_log`, `voip_charges` + RLS +
  `increment_wallet_balance` RPC — migrated, confirmed clean
- `Server/routes/voip.js` — factory-function router, mounted in
  `server.js`, live on Render at `esimconnect-backend.onrender.com`
- Confirmed working end-to-end via curl: auth, routing, and the mock
  `available-numbers` endpoint all verified live

**Twilio account:**
- Reactivated and working
- Singapore Regulatory Bundle submitted, awaiting Twilio review (up to ~3
  business days from submission — check status before assuming it's
  cleared)
- A US test number was purchased (no bundle needed for US) specifically to
  unblock mechanical testing without waiting on the SG bundle

**Not yet done — the actual sandbox test (build order step 1) was never
wired up.** The session went into scope/abuse-risk discussion instead
after Twilio was reactivated, and that discussion changed the design
enough that testing against the old logic would likely mean redoing it.

## What changed: v1 scope is now inbound-only

Originally v1 included outbound calling. That's been cut. VOIP v1 is now:
**the Twilio number is a one-way bridge** — the user forwards their real
number's calls to it (via their own phone's native call-forwarding
setting), and those calls ring through to them in-app wherever they are.
No calling out to arbitrary numbers in v1, full stop. Outbound becomes a
future, fully gated (real ID verification required) opt-in tier — not
something to build now.

Why: this was a genuine risk-mitigation decision, not a shortcut. Outbound
calling capability is what creates real liability exposure (TCPA-style
statutory damages in the US, Twilio account-wide suspension risk if any
one user misuses it). Both Google Voice and Skype have moved toward
requiring real identity verification for exactly this reason — Skype's
KYC rollout in Japan cut fraudulent use by 90%. Cutting outbound doesn't
weaken Juzgo's actual pitch either — the value prop was always "let people
who already have my number reach me," which is inherently an inbound
problem.

## Four decisions that were open, now locked

1. **Registration (name/email/phone):** soft gate for existing users
   (nothing forced), hard gate the moment they try to buy a VOIP number.
   New users required at signup. Test accounts wiped at launch.
2. **Reply-only outbound tier:** rejected. All outbound requires full
   authentication, no light-touch exception.
3. **Card-on-file UX:** reuse the existing Stripe card-storage component,
   but labeled as its own section ("Payment card for VOIP rental"),
   distinct from wallet balance — avoids the confusing case where wallet
   balance looks untouched while a card silently gets charged.
4. **Suspended-number release timing:** 7 days. Grounded in real Twilio
   data — releasing a number already gives Twilio's own process ~10+
   further days of hold/testing before it's publicly available again, so
   the real combined safety window is longer than "7 days" sounds alone.

## The mechanism that ties billing + safety together

Confirmed via Twilio's docs this session: a number's `VoiceUrl` can be
swapped (or cleared) any time **without releasing the number**. This is
how suspension-for-non-payment actually works — reject/mute the number's
calls while Kairos Ventures still owns it, so it can never be silently
reassigned to a stranger while suspended. Full release is a separate,
later action (the 7-day-then-release flow above). This does NOT touch the
user's own phone-side call forwarding — that's permanently outside Juzgo's
control, no API exists for it — so a front-loaded reminder cascade (push +
email, escalating within the 7-day window) is still the thing that
actually gets a user to turn it off themselves.

## Two ways to start next session — pick one explicitly, don't default into it

**A) Do the sandbox test now.** Twilio's reactivated, a US number exists,
build order step 1 (confirm `<Dial><Client>` actually rings a Voice SDK
client) is still technically unblocked and was the original goal before
scope discussion took over.

**B) Rebuild `voip.js`'s billing/purchase logic first to match the locked
decisions above, then test.** The current scaffolding's billing job still
assumes wallet-only billing with a grace period — that's specifically what
got replaced by card-lock + Twilio-suspend this session. Testing against
the old logic risks redoing the test once the rewrite happens anyway.

Leaning (B) — but say which one out loud at the start rather than
assuming, since it changes what gets built first.

## Also not yet started
- Registration flow changes in `Register.js` (soft/hard gate)
- Admin VOIP tab (number inventory, suspend/release actions)
- Terms & Conditions update (prohibited-use clause) — flagged for actual
  legal review, not just internal drafting
