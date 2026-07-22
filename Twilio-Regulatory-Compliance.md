# Twilio Regulatory Compliance — Juzgo VOIP

Captured Session 26 (July 17, 2026), surfaced while trying to buy a test
Singapore number. Upload to the "juzgo.world" Claude Project knowledge base
alongside `Juzgo VOIP Build.md` and `CONTEXT.md`.

## What triggered this

Attempted to buy a Singapore Twilio number for VOIP sandbox testing.
Voice/SMS/MMS/Fax capability checkboxes were disabled (no-entry cursor) on
the Buy a Number page for Singapore. Confirmed this is Twilio's Regulatory
Bundle requirement, not a bug or a trial-account-wide restriction — switching
Country to United States immediately unlocked the checkboxes, isolating the
cause to Singapore specifically.

## What a Regulatory Bundle is

A container Twilio requires for certain countries before you're allowed to
search for or purchase a number from that country. Bundles group: End-User
identity info, supporting documents, and (where required) a physical
address. Not universal — some countries need nothing extra, some need only
an address, some need address + identity documents. Country- and
number-type-specific (local vs. mobile vs. national vs. toll-free can have
different requirements within the same country).

## Singapore specifically (confirmed via Twilio's own regulatory changelog)

Singapore **local/national** numbers require:
- **End-user information** — including name of an authorized representative
  for business accounts
- **Identity documentation** — government-issued ID number for that
  authorized representative (e.g. passport, NRIC)
- **Proof of address** — for the business itself. Must be a real physical
  address; Twilio explicitly does not accept P.O. boxes or virtual
  addresses (e.g. a utility bill, bank statement, or lease agreement
  showing the company name + address)

Since Kairos Ventures is Singapore-registered, this should be a
comparatively easy bundle — ACRA registration + a standard business address
document should satisfy it.

## Where to submit (Twilio Console)

**Phone Numbers → Regulatory Compliance → Bundles → Create a Regulatory
Bundle.** Select country (Singapore), number type (Local), end-user type
(Business). The form will list exactly which documents it needs for that
combination before you can submit.

## Timeline

Review typically takes **up to 3 business days** after submission (Twilio's
own guidance; some sources say "up to 2"). Result comes via email from
`numbers-regulatory-review@twilio.com`. If rejected, reasons are given and
the bundle can be edited + resubmitted from the same Bundles page.

## Implication for Juzgo's VOIP build (important — affects rollout, not just testing)

Juzgo's VOIP model is **home-country number rental** — a traveler buys a
Twilio number in *their own* home country (see `Juzgo VOIP Build.md`
"locked architecture"). This means the regulatory bundle requirement isn't
a one-time SG-only hurdle — it recurs **per home country** as VOIP expands
to travelers from new markets. A user from Indonesia, the Philippines, or
elsewhere wanting this feature requires Kairos Ventures to hold a compliant
bundle/address for *that* country too, not just Singapore.

**Practical framing for planning:** treat this the same way as the eSIM
Airalo catalog's country-by-country rollout — not a v1 blocker, but an
ongoing operational task. Budget roughly "2–3 business days + time to
gather documents" per new country added, with effort scaling by how
heavily regulated that market is (some countries need only an address,
which is trivial; others need identity docs like SG, which take longer to
assemble since a document may not exist yet for that country).

**v1 scope stays Singapore-only** — bundle submitted this session, pending
Twilio review. No other countries need to be evaluated until there's an
actual reason to expand VOIP beyond SG travelers.

## Workaround used for sandbox testing (not affected by the above)

Build order step 1 (confirm `<Dial><Client>` actually rings a Voice SDK
client) does not require a *Singapore* number specifically — any working
Twilio Voice number proves the mechanism. Bought a US number instead
(no regulatory bundle required) to unblock the sandbox test while the SG
bundle is in review. Once the SG bundle clears, swapping to a real SG
number for further testing/launch is just a purchase — no code changes
needed, since `voip.js` already stores `country_code` generically per
number row.
