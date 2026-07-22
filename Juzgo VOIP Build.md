# Juzgo VOIP Build

Context and locked decisions for the VOIP feature, to be dropped into the "juzgo.world" Claude Project knowledge base alongside `CONTEXT.md`, `Context-Airalo-Integration.md`, and `DECISIONS.md`.

## Background

VOIP was part of Juzgo's original product vision (back when it was eSimConnect) — an in-app calling feature via Twilio, alongside eSIM data and the eWallet. It was scoped as "post-launch" and got silently deprioritized while fulfillment bugs, corporate accounts, and the Airalo integration took precedence. This doc restarts it as its own build track, separate from eSIM/Airalo.

Airalo status as of this doc: functionally complete on the dev side. The only outstanding gate before flipping sandbox → production is Kairos Ventures' company registration with Airalo — a business/admin blocker, not a code blocker. This freed up bandwidth to scope VOIP properly.

## Why VOIP, and why it differentiates Juzgo

An eSIM solves data. It does not solve "how do people who already have my number reach me." That's the actual pain point for travelers — banks, family, delivery riders, and business contacts still have the traveler's home number, not a new destination number nobody knows to call.

- Other eSIM resellers (Airalo, Holafly, Nomad, etc.) are pure data plays — none touch voice/SMS continuity.
- Google Voice / Skype Number solve number continuity in isolation, but aren't bundled with an eSIM purchase and most travelers don't think to set them up in advance.
- Juzgo's edge isn't the underlying tech (Twilio call forwarding + VoIP termination is well-trodden) — it's bundling this at the exact moment a traveler is already buying an eSIM for a trip, reusing infrastructure (wallet, data plan) already in place.

Known honest limitations to keep in marketing/FAQ copy, not oversell:
- Forwarding activation is a manual step by the user (mitigated — see UX decision below).
- SMS forwarding is out of scope for v1 (no carrier-level equivalent to CFU for SMS). This means OTP/2FA codes sent to the home number won't reach the traveler — a real gap to flag, not hide.

## How it works (locked architecture)

This is forwarding of the user's **existing home number**, not sale of a new number for others to dial.

1. User buys a **home-country** Twilio local number through Juzgo (e.g. an SG-based traveler buys an SG Twilio number even though they're heading to Japan) — not a destination-country number.
2. User activates Call Forwarding Unconditional (CFU) on their own real phone, pointing it at the new Twilio number. This is a manual action by the user — Juzgo cannot trigger carrier-side forwarding via any API.
3. Incoming calls to the user's real number → carrier forwards → Twilio home-country number → Twilio webhook uses `<Dial><Client>` → rings inside the Juzgo app via the Voice SDK (WebRTC), over data/WiFi, wherever the user physically is.
4. Caller ID passes through correctly at every hop — Twilio preserves the original caller's number through the `<Dial><Client>` payload and missed-call/voicemail webhooks, so it displays natively in-app and in call history.
5. Missed call (app offline / no answer / declined) → falls through to `<Record>` voicemail, transcribed via Twilio's Voice Intelligence API, surfaced as an in-app notification.
6. Outbound calls from the app use the same Twilio number as caller ID.

Same-country forwarding (home number → home-country Twilio number) avoids international forwarding surcharges from the user's carrier.

## Forwarding activation UX (locked decision)

Primary flow: native OS call-forwarding toggles — iOS (Phone → Call Forwarding) and Android (Settings → Calls → Call Forwarding) both expose this as a straightforward Settings toggle. In-app instructions should be OS-native step-by-step (screenshots/illustrations), not USSD codes, as the primary path.

USSD carrier codes (e.g. Singtel/Starhub/M1 for SG) are kept as a secondary "having trouble?" fallback — for older devices, dual-SIM edge cases, or carriers where the native toggle doesn't reliably map to CFU. Not the main flow.

## Locked v1 scope

**In scope:**
- Buy a home-country local Twilio number (rental fee debited from the existing Juzgo wallet — same wallet used for eSIM top-ups, no new payment rail)
- Native-OS forwarding instructions (USSD as fallback)
- Inbound calls ring into the Juzgo app via Voice SDK, correct caller ID shown
- Missed call → voicemail (recorded + transcribed) → in-app notification
- Outbound calling from the app using the Twilio number as caller ID
- Call history log

**Out of scope for v1:**
- SMS forwarding (no carrier-level equivalent to CFU for SMS; would require a companion app on the home device to intercept/relay — a separate, much larger project)
- Automating the carrier-forwarding activation itself (no API access to telco-side forwarding)

**Open item, not blocking build start:** what happens if the user is offline/not logged in when a call comes in beyond the voicemail fallback (e.g. push notification for missed call) — decide before inbound routing ships, not before build starts.

## Payment model

Same eWallet as eSIM — no separate payment rail. Number rental is a recurring monthly debit (new pattern vs. eSIM's one-off purchase — needs a scheduled billing job, plus a grace-period/release flow if wallet balance can't cover renewal).

## Where VOIP sits in the app

- Not a separate pinnable "app" for v1 discovery — a secondary nav tab (e.g. bottom nav: Home, Itinerary, Purchases, Wallet as primary; Call as a fifth, visually muted-until-active tab).
- Path-scoped route (`juzgo.world/voip/*`) with its own manifest/scope, so power users can still pin it to their home screen as a fast dialler after they've used it — this is an accelerator for returning users, not the primary discovery path.
- Same-origin as the eSIM app → shared Supabase auth session and wallet balance automatically, no cross-domain auth work needed.

## Schema sketch

- `voip_numbers` — user_id, number, country, Twilio SID, rental status, renewal date
- `voip_call_log` — caller number, direction (inbound/outbound), duration, status (answered/missed/voicemail), voicemail recording URL, transcript
- `voip_charges` (or extend `orders`) — recurring rental billing records, tied to wallet debits

## Build order

1. Twilio account setup + sandbox test — buy one test SG number manually, confirm inbound webhook → `<Dial><Client>` rings a test Voice SDK client, confirm voicemail fallback fires. Throwaway script, same pattern as Airalo's initial API test.
2. Schema — `voip_numbers`, `voip_call_log`, `voip_charges`/`orders` extension.
3. Number availability lookup — live query against Twilio's Available Phone Numbers API at purchase time (not pre-synced like Airalo's catalog, since availability changes constantly).
4. Carrier forwarding dataset — native OS instructions per platform, USSD codes per carrier as fallback, starting with Singapore (Singtel/Starhub/M1) as the first real test case.
5. Backend — number provisioning endpoint, inbound call webhook, voicemail recording/transcription webhook, recurring wallet debit for rental.
6. Admin tab — number inventory, rental status, manual override/release.
7. Storefront + in-app dialler/call screen — buy number UI, forwarding instructions screen, incoming call UI, voicemail inbox, call history.
8. P&L Dashboard extension — rental revenue vs. Twilio cost, call minute margins, alongside existing eSIM margin lines.

## Relationship to Airalo build

Kept as a fully separate build track and a separate page/route in the app — different UX shape (browse/buy-a-package vs. dial-a-call). Shares only the wallet/payment rail and the underlying admin/P&L dashboard patterns. Should not block or be blocked by the Airalo production cutover (company registration).
