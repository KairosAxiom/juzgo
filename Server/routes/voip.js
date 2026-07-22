// ============================================================
// Server/routes/voip.js — Juzgo VOIP backend (Session 27 rewrite)
//
// SUPERSEDES the Session 26 scaffolding. What changed and why:
//
//   * Billing is CARD-LOCKED, not wallet-based. A card on file is
//     required to purchase; renewals charge that card off-session
//     regardless of wallet balance, and keep charging until the user
//     actively releases the number. The old wallet-debit +
//     grace-period-then-release path is gone entirely. Rationale:
//     abandonment becomes a bill the user has an incentive to stop,
//     rather than a chore they have no reason to do.
//
//   * v1 is INBOUND-ONLY. The Twilio number is a one-way bridge — the
//     user forwards their real number's calls to it via carrier-side
//     CFU, and those calls ring through in-app. There is no outbound
//     endpoint and none should be added without full identity
//     verification behind it (see VOIP-ABUSE-PREVENTION-SPEC.md v2 §2).
//
//   * Non-payment SUSPENDS rather than releases. Suspension clears the
//     number's VoiceUrl at Twilio, so inbound calls stop while Kairos
//     Ventures still OWNS the number — it can never be reassigned to a
//     stranger while the user's CFU may still be pointing at it.
//     Release is a separate, later action.
//
// DUNNING TIMELINE (from first failed charge):
//   day 0   charge fails            -> status 'past_due', reminder 1
//   day 1   retry; if it fails      -> reminder 2
//   day 3   retry; if it fails      -> reminder 3
//   day 7   suspend (VoiceUrl cleared at Twilio), reminder 4
//   day 12  release the number at Twilio, final notice
// A successful charge at ANY point resets the whole cascade and, if the
// number was suspended, restores its VoiceUrl.
//
// Day 12 is not arbitrary: Twilio's own process holds a released number
// for roughly 10 further days before it re-enters the public pool, so
// the real end-to-end recycling window is ~22 days. That matters because
// the user's phone-side call forwarding is permanently OUTSIDE Juzgo's
// control — no consumer telco API exists to disable CFU — so the
// reminder cascade is the only thing that actually gets a stranger's
// calls to stop arriving. The window has to be long enough for a person
// to get round to it on a weekend.
//
// INTEGRATION (server.js) — the mount line gains four injected deps:
//
//   const createVoipRouter = require('./routes/voip');
//   app.use('/voip', createVoipRouter({
//     supabase, requireAuth, stripe, sendPushToUser, sendEmail,
//   }));
//
// sendPushToUser (server.js ~line 82) and sendEmail (~line 1912) are
// module-local functions, not exports, so they must be passed in.
// Both swallow their own errors, so the billing pass cannot be
// crashed by a failed notification.
//
// TWILIO LIVE FLAG:
//   Every mutating Twilio call is gated on VOIP_TWILIO_LIVE === 'true'.
//   With the flag off, the code runs its full logic and logs what it
//   WOULD have done, so the Stripe path is testable end-to-end without
//   spending money or touching real numbers. Turn it on only when
//   deliberately testing against Twilio.
//
//   Number PURCHASE is gated a second time on VOIP_TWILIO_ALLOW_PURCHASE,
//   because every purchase test costs real money and a US test number
//   already exists. Read-only lookups need neither flag.
// ============================================================

const express = require('express');

// ---- Dunning schedule, in days from first failure ----
const RETRY_DAYS = [1, 3];
const SUSPEND_AFTER_DAYS = 7;
const RELEASE_AFTER_DAYS = 12;

// Reminder stages, so a given message is never sent twice. Stored in
// voip_numbers.last_reminder_stage.
const REMINDER = {
  NONE: 0,
  FIRST_FAILURE: 1,
  RETRY_FAILED: 2,
  FINAL_WARNING: 3,
  SUSPENDED: 4,
  RELEASED: 5,
};

module.exports = function createVoipRouter({
  supabase,
  requireAuth,
  stripe,
  sendPushToUser,
  sendEmail,
}) {
  const router = express.Router();

  const TWILIO_LIVE = process.env.VOIP_TWILIO_LIVE === 'true';
  const TWILIO_ALLOW_PURCHASE = process.env.VOIP_TWILIO_ALLOW_PURCHASE === 'true';
  const BACKEND_URL = process.env.BACKEND_URL || 'https://esimconnect-backend.onrender.com';

  // Twilio client is created lazily and only if credentials exist, so a
  // missing env var degrades to "mock mode" rather than crashing the whole
  // Express app at require() time — the router is mounted in the same
  // process that serves eSIM checkout, and that must never fail to boot
  // because a VOIP credential is absent.
  let twilioClient = null;
  function getTwilio() {
    if (twilioClient) return twilioClient;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
    try {
      twilioClient = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      return twilioClient;
    } catch (err) {
      console.error('[voip] Twilio SDK unavailable:', err.message);
      return null;
    }
  }

  function daysBetween(from, to) {
    return (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
  }

  // ============================================================
  // Twilio operations — each one no-ops loudly when the flag is off
  // ============================================================

  // Clearing VoiceUrl is what "suspend" actually means. Twilio treats a
  // number with no VoiceUrl as out of service for inbound calls: the call
  // is not connected, not logged, and not billed to us. Confirmed against
  // Twilio's IncomingPhoneNumber API docs — this does NOT release the
  // number, which is the entire point.
  async function twilioSuspend(numberRow) {
    if (!TWILIO_LIVE) {
      console.log(`[voip][MOCK] would clear VoiceUrl for ${numberRow.phone_number} (sid ${numberRow.twilio_sid})`);
      return { mocked: true };
    }
    const client = getTwilio();
    if (!client || !numberRow.twilio_sid) {
      console.warn(`[voip] cannot suspend ${numberRow.phone_number}: no client or no sid`);
      return { skipped: true };
    }
    await client.incomingPhoneNumbers(numberRow.twilio_sid).update({ voiceUrl: '' });
    return { suspended: true };
  }

  async function twilioReactivate(numberRow) {
    const restoreUrl = numberRow.voice_url_before_suspend || `${BACKEND_URL}/voip/webhooks/inbound`;
    if (!TWILIO_LIVE) {
      console.log(`[voip][MOCK] would restore VoiceUrl=${restoreUrl} for ${numberRow.phone_number}`);
      return { mocked: true };
    }
    const client = getTwilio();
    if (!client || !numberRow.twilio_sid) return { skipped: true };
    await client.incomingPhoneNumbers(numberRow.twilio_sid).update({
      voiceUrl: restoreUrl,
      voiceMethod: 'POST',
    });
    return { reactivated: true };
  }

  async function twilioRelease(numberRow) {
    if (!TWILIO_LIVE) {
      console.log(`[voip][MOCK] would RELEASE ${numberRow.phone_number} (sid ${numberRow.twilio_sid})`);
      return { mocked: true };
    }
    const client = getTwilio();
    // Belt and braces: a null sid means this row was created in mock mode
    // and has no real Twilio number behind it. Never let such a row
    // trigger a real release call.
    if (!client || !numberRow.twilio_sid) {
      console.warn(`[voip] cannot release ${numberRow.phone_number}: no client or no sid`);
      return { skipped: true };
    }
    await client.incomingPhoneNumbers(numberRow.twilio_sid).remove();
    return { released: true };
  }

  // ============================================================
  // Notifications — push + email, best-effort, never throw
  //
  // NOTE: profiles has no email column. Email lives in auth.users and is
  // only readable through the admin API with the service role key. This
  // matters for the dunning cascade: if email lookup fails, the user still
  // gets push notifications, so a broken lookup degrades the reminder
  // cascade rather than silencing it entirely.
  // ============================================================
  async function getUserEmail(userId) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) {
        console.error('[voip] email lookup failed:', error.message);
        return null;
      }
      return data?.user?.email || null;
    } catch (err) {
      console.error('[voip] email lookup threw:', err.message);
      return null;
    }
  }

  async function notify(userId, { title, body, url, emailSubject, emailText }) {
    try {
      if (sendPushToUser) {
        await sendPushToUser(userId, { title, body, url: url || 'https://juzgo.world/voip' });
      }
    } catch (err) {
      console.error('[voip] push failed:', err.message);
    }

    try {
      if (sendEmail) {
        const email = await getUserEmail(userId);
        if (email) {
          await sendEmail({
            to: email,
            subject: emailSubject || title,
            text: emailText || body,
          });
        }
      }
    } catch (err) {
      console.error('[voip] email failed:', err.message);
    }
  }

  // Every dunning message names the CFU problem explicitly. This is the
  // single most important piece of copy in the feature: if the user does
  // not turn call forwarding off on their own handset, their calls keep
  // going to a number they no longer control. Juzgo cannot do it for them.
  function dunningCopy(stage, numberRow) {
    const n = numberRow.phone_number;
    switch (stage) {
      case REMINDER.FIRST_FAILURE:
        return {
          title: 'Payment failed for your Juzgo number',
          body: `We couldn't charge your card for ${n}. We'll try again in 24 hours.`,
          emailSubject: `Action needed: payment failed for ${n}`,
          emailText:
            `We couldn't charge your card for your Juzgo number ${n}.\n\n` +
            `We'll retry automatically over the next few days. To avoid any ` +
            `interruption, update your card at https://juzgo.world/voip\n\n` +
            `If you no longer need this number, release it in the app — and ` +
            `remember to turn OFF call forwarding on your own phone, or calls ` +
            `to your real number will stop reaching you.`,
        };
      case REMINDER.RETRY_FAILED:
        return {
          title: 'Still unable to charge your card',
          body: `Your Juzgo number ${n} will be suspended if payment isn't resolved.`,
          emailSubject: `Second notice: payment failed for ${n}`,
          emailText:
            `We've retried and still can't charge your card for ${n}.\n\n` +
            `Update your card at https://juzgo.world/voip to keep the number ` +
            `active. If payment isn't resolved, the number will be suspended.`,
        };
      case REMINDER.FINAL_WARNING:
        return {
          title: 'Final notice — number will be suspended',
          body: `${n} will stop receiving calls shortly.`,
          emailSubject: `Final notice: ${n} will be suspended`,
          emailText:
            `This is a final reminder that we're unable to charge your card ` +
            `for ${n}. The number will be suspended and will stop receiving ` +
            `calls.\n\n` +
            `IMPORTANT: if you have call forwarding switched on, please turn ` +
            `it off on your own phone now. Juzgo cannot do this for you, and ` +
            `until you do, calls to your real number will not reach you.`,
        };
      case REMINDER.SUSPENDED:
        return {
          title: 'Your Juzgo number has been suspended',
          body: `${n} is no longer receiving calls.`,
          emailSubject: `${n} has been suspended`,
          emailText:
            `Your Juzgo number ${n} has been suspended for non-payment and is ` +
            `no longer receiving calls.\n\n` +
            `TURN OFF CALL FORWARDING on your own phone now if you haven't ` +
            `already — otherwise calls to your real number will go nowhere.\n\n` +
            `You can restore the number by updating your card at ` +
            `https://juzgo.world/voip. If we don't hear from you, the number ` +
            `will be permanently released and cannot be recovered.`,
        };
      case REMINDER.RELEASED:
        return {
          title: 'Your Juzgo number has been released',
          body: `${n} has been permanently released.`,
          emailSubject: `${n} has been released`,
          emailText:
            `Your Juzgo number ${n} has been permanently released and can no ` +
            `longer be recovered.\n\n` +
            `If call forwarding is still switched on for your real number, ` +
            `please turn it off immediately — this is the last reminder we ` +
            `can send you about it.`,
        };
      default:
        return null;
    }
  }

  async function sendDunning(numberRow, stage) {
    if ((numberRow.last_reminder_stage || 0) >= stage) return; // already sent
    const copy = dunningCopy(stage, numberRow);
    if (!copy) return;
    await notify(numberRow.user_id, copy);
    await supabase
      .from('voip_numbers')
      .update({ last_reminder_stage: stage })
      .eq('id', numberRow.id);
  }

  // ============================================================
  // Charging
  // ============================================================

  // One off-session charge attempt. Returns a result object rather than
  // throwing, because the billing pass must continue to the next number
  // regardless of what happens to this one.
  async function chargeCard({ userId, numberRow, amount, periodStart, periodEnd, attemptNumber }) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, default_payment_method_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_customer_id || !profile?.default_payment_method_id) {
      return { ok: false, code: 'no_card_on_file', message: 'No card on file' };
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // SGD cents
        currency: 'sgd',
        customer: profile.stripe_customer_id,
        payment_method: profile.default_payment_method_id,
        off_session: true, // merchant-initiated; no user present
        confirm: true,
        description: `Juzgo VOIP rental — ${numberRow.phone_number}`,
        metadata: {
          juzgo_user_id: userId,
          voip_number_id: numberRow.id,
          billing_period_start: periodStart.toISOString().slice(0, 10),
        },
      });

      await supabase.from('voip_charges').insert({
        voip_number_id: numberRow.id,
        user_id: userId,
        amount_sgd: amount,
        charge_type: 'rental',
        status: 'paid',
        billing_period_start: periodStart.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
        stripe_payment_intent_id: intent.id,
        stripe_payment_method_id: profile.default_payment_method_id,
        attempt_number: attemptNumber || 1,
      });

      return { ok: true, intent };
    } catch (err) {
      // Stripe throws on declines when confirm:true. err.code carries the
      // decline reason; authentication_required is the notable one — it
      // means the card wants SCA, which an off-session charge can't do.
      // The user has to re-attach the card via a fresh SetupIntent.
      await supabase.from('voip_charges').insert({
        voip_number_id: numberRow.id,
        user_id: userId,
        amount_sgd: amount,
        charge_type: 'rental',
        status: 'failed',
        billing_period_start: periodStart.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
        stripe_payment_intent_id: err.payment_intent?.id || null,
        stripe_payment_method_id: profile.default_payment_method_id,
        failure_code: err.code || 'unknown',
        failure_message: err.message,
        attempt_number: attemptNumber || 1,
      });

      return { ok: false, code: err.code || 'unknown', message: err.message };
    }
  }

  // ============================================================
  // Routes
  // ============================================================

  // ------------------------------------------------------------
  // GET /voip/available-numbers?country=SG
  //
  // Live lookup, never cached — availability changes constantly, which is
  // why this is queried at purchase time rather than pre-synced the way
  // the Airalo catalog is.
  //
  // Read-only, so it runs live whenever credentials exist regardless of
  // VOIP_TWILIO_LIVE; it costs nothing and changes nothing. Falls back to
  // the Session 26 mock data if credentials are absent, so the existing
  // verified curl test keeps working.
  //
  // NOTE for SG: this will return an error until the Singapore Regulatory
  // Bundle clears Twilio review. That's expected, not a bug — IMDA
  // requires it before SG local numbers can even be searched.
  // ------------------------------------------------------------
  router.get('/available-numbers', requireAuth, async (req, res) => {
    const country = (req.query.country || 'SG').toUpperCase();
    const client = getTwilio();

    if (!client) {
      const mockNumbers = [
        { phone_number: '+6591234001', country_code: country, monthly_rate_sgd: 8.0 },
        { phone_number: '+6591234002', country_code: country, monthly_rate_sgd: 8.0 },
        { phone_number: '+6591234003', country_code: country, monthly_rate_sgd: 8.0 },
      ];
      return res.json({ numbers: mockNumbers, mock: true });
    }

    try {
      const available = await client.availablePhoneNumbers(country).local.list({ limit: 10 });
      res.json({
        numbers: available.map((n) => ({
          phone_number: n.phoneNumber,
          country_code: country,
          locality: n.locality,
          monthly_rate_sgd: 8.0, // retail price; Twilio's wholesale cost differs
        })),
        mock: false,
      });
    } catch (err) {
      // Regulatory-bundle failures land here for SG. Surface the real
      // message rather than a generic 500 — it's the difference between
      // "Twilio is down" and "your bundle hasn't been approved yet".
      console.error(`[voip] availability lookup failed for ${country}:`, err.message);
      res.status(502).json({
        error: 'Number lookup failed',
        detail: err.message,
        hint:
          country === 'SG'
            ? 'Singapore requires an approved Regulatory Bundle before local numbers can be searched.'
            : undefined,
      });
    }
  });

  // ------------------------------------------------------------
  // GET /voip/eligibility
  //
  // What the storefront calls before showing the buy button, so the UI
  // can send the user to attach a card BEFORE they pick a number rather
  // than failing them at the last step.
  // ------------------------------------------------------------
  router.get('/eligibility', requireAuth, async (req, res) => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('default_payment_method_id, card_brand, card_last4, full_name, phone')
      .eq('id', req.authUser.id)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Hard gate per locked decision 1: registration details are required
    // at the moment of VOIP purchase, not merely encouraged.
    //
    // Email comes from auth.users — a Supabase account cannot exist without
    // one, so in practice it's always present. Checked anyway because the
    // dunning cascade depends on a deliverable address, and a user with no
    // reachable email is one who can never be told their number is about to
    // be released.
    const email = await getUserEmail(req.authUser.id);

    const missingProfile = [];
    if (!profile?.full_name) missingProfile.push('full_name');
    if (!email) missingProfile.push('email');
    if (!profile?.phone) missingProfile.push('phone');

    res.json({
      eligible: missingProfile.length === 0 && !!profile?.default_payment_method_id,
      has_card: !!profile?.default_payment_method_id,
      card: profile?.default_payment_method_id
        ? { brand: profile.card_brand, last4: profile.card_last4 }
        : null,
      missing_profile_fields: missingProfile,
    });
  });

  // ------------------------------------------------------------
  // POST /voip/numbers/purchase
  // body: { phone_number, country_code, monthly_rate_sgd }
  //
  // Order of operations matters and is deliberate:
  //   1. hard-gate profile completeness
  //   2. require a card on file
  //   3. buy at Twilio (or mock)
  //   4. insert the row
  //   5. charge the card
  //   6. on charge failure, unwind 4 AND 3
  //
  // Charging last means a failed card never leaves a paid-for number
  // stranded; buying at Twilio before the row insert means we never
  // have a row claiming to own a number we don't.
  // ------------------------------------------------------------
  router.post('/numbers/purchase', requireAuth, async (req, res) => {
    const { phone_number, country_code, monthly_rate_sgd } = req.body;
    if (!phone_number || !country_code || !monthly_rate_sgd) {
      return res
        .status(400)
        .json({ error: 'phone_number, country_code, monthly_rate_sgd required' });
    }

    const userId = req.authUser.id;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('full_name, phone, stripe_customer_id, default_payment_method_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) return res.status(404).json({ error: 'Profile not found' });

    const email = await getUserEmail(userId);

    const missing = [];
    if (!profile.full_name) missing.push('full_name');
    if (!email) missing.push('email');
    if (!profile.phone) missing.push('phone');
    if (missing.length) {
      return res.status(428).json({
        error: 'Complete your profile before purchasing a number',
        missing_profile_fields: missing,
      });
    }

    if (!profile.default_payment_method_id || !profile.stripe_customer_id) {
      return res.status(402).json({
        error: 'A payment card is required to rent a number',
        action: 'attach_card',
      });
    }

    // --- Buy at Twilio ---
    let twilio_sid = null;
    const voiceUrl = `${BACKEND_URL}/voip/webhooks/inbound`;

    if (TWILIO_LIVE && TWILIO_ALLOW_PURCHASE) {
      const client = getTwilio();
      if (!client) return res.status(503).json({ error: 'Twilio unavailable' });
      try {
        const bought = await client.incomingPhoneNumbers.create({
          phoneNumber: phone_number,
          voiceUrl,
          voiceMethod: 'POST',
          statusCallback: `${BACKEND_URL}/voip/webhooks/status`,
          statusCallbackMethod: 'POST',
        });
        twilio_sid = bought.sid;
      } catch (err) {
        console.error('[voip] Twilio purchase failed:', err.message);
        return res.status(502).json({ error: 'Number purchase failed at carrier', detail: err.message });
      }
    } else {
      console.log(
        `[voip][MOCK] would purchase ${phone_number} (live=${TWILIO_LIVE}, allow_purchase=${TWILIO_ALLOW_PURCHASE})`
      );
    }

    // --- Insert the row ---
    const now = new Date();
    const nextRenewal = new Date(now);
    nextRenewal.setMonth(nextRenewal.getMonth() + 1);

    const { data: numberRow, error: insertErr } = await supabase
      .from('voip_numbers')
      .insert({
        user_id: userId,
        phone_number,
        country_code,
        twilio_sid,
        status: 'active',
        monthly_rate_sgd,
        purchased_at: now.toISOString(),
        next_renewal_at: nextRenewal.toISOString(),
        stripe_payment_method_id: profile.default_payment_method_id,
        voice_url_before_suspend: voiceUrl,
        failed_charge_count: 0,
        last_reminder_stage: REMINDER.NONE,
      })
      .select()
      .single();

    if (insertErr) {
      if (twilio_sid) await twilioRelease({ twilio_sid, phone_number });
      return res.status(500).json({ error: insertErr.message });
    }

    // --- Charge the card ---
    const charge = await chargeCard({
      userId,
      numberRow,
      amount: monthly_rate_sgd,
      periodStart: now,
      periodEnd: nextRenewal,
      attemptNumber: 1,
    });

    if (!charge.ok) {
      // Unwind everything. A first charge that fails means the rental
      // never began, so there's nothing to suspend or dun — just undo it.
      await supabase.from('voip_numbers').delete().eq('id', numberRow.id);
      if (twilio_sid) await twilioRelease({ twilio_sid, phone_number });
      return res.status(402).json({
        error: 'Card was declined',
        code: charge.code,
        detail: charge.message,
      });
    }

    await notify(userId, {
      title: 'Your Juzgo number is ready',
      body: `${phone_number} is active. Set up call forwarding to start receiving calls.`,
      emailSubject: `Your Juzgo number ${phone_number} is active`,
      emailText:
        `Your Juzgo number ${phone_number} is now active.\n\n` +
        `Next step: switch on call forwarding from your own phone to this ` +
        `number, so calls to your real number reach you in the app wherever ` +
        `you are. Instructions are in the app.\n\n` +
        `You'll be charged SGD ${monthly_rate_sgd} monthly until you release ` +
        `the number in the app.`,
    });

    res.json({ number: numberRow, charged: monthly_rate_sgd, mock_twilio: !twilio_sid });
  });

  // ------------------------------------------------------------
  // GET /voip/numbers — current user's numbers
  // ------------------------------------------------------------
  router.get('/numbers', requireAuth, async (req, res) => {
    const { data, error } = await supabase
      .from('voip_numbers')
      .select('*')
      .eq('user_id', req.authUser.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ numbers: data });
  });

  // ------------------------------------------------------------
  // POST /voip/numbers/:id/release
  //
  // User-initiated release — the intended way for a rental to end, and
  // the only way to stop being billed. Immediate and irreversible.
  //
  // The response deliberately leads with the call-forwarding reminder:
  // this is the moment the user is thinking about the number, and it's
  // the last moment Juzgo has their attention before their real number's
  // calls start going nowhere.
  // ------------------------------------------------------------
  router.post('/numbers/:id/release', requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: numberRow, error: fetchErr } = await supabase
      .from('voip_numbers')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.authUser.id)
      .single();

    if (fetchErr || !numberRow) return res.status(404).json({ error: 'Number not found' });
    if (numberRow.status === 'released') {
      return res.status(409).json({ error: 'Number already released' });
    }

    try {
      await twilioRelease(numberRow);
    } catch (err) {
      console.error('[voip] release failed at Twilio:', err.message);
      return res.status(502).json({ error: 'Release failed at carrier', detail: err.message });
    }

    const { error: updateErr } = await supabase
      .from('voip_numbers')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        release_scheduled_at: null,
      })
      .eq('id', id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    await notify(req.authUser.id, {
      title: 'Number released',
      body: `${numberRow.phone_number} has been released. Turn off call forwarding on your phone.`,
      emailSubject: `${numberRow.phone_number} has been released`,
      emailText:
        `Your Juzgo number ${numberRow.phone_number} has been released and ` +
        `you will not be charged again.\n\n` +
        `IMPORTANT: turn OFF call forwarding on your own phone now. Until ` +
        `you do, calls to your real number will not reach you. Juzgo cannot ` +
        `switch this off on your behalf.`,
    });

    res.json({
      success: true,
      reminder:
        'Turn off call forwarding on your phone — calls to your real number will not reach you until you do.',
    });
  });

  // ------------------------------------------------------------
  // POST /voip/numbers/:id/reactivate
  //
  // Recovery path for a suspended number: the user has fixed their card
  // and wants the number back. Charges immediately; only restores the
  // VoiceUrl if that charge succeeds.
  // ------------------------------------------------------------
  router.post('/numbers/:id/reactivate', requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: numberRow, error: fetchErr } = await supabase
      .from('voip_numbers')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.authUser.id)
      .single();

    if (fetchErr || !numberRow) return res.status(404).json({ error: 'Number not found' });
    if (!['past_due', 'suspended', 'pending_release'].includes(numberRow.status)) {
      return res.status(409).json({ error: `Number is ${numberRow.status}, nothing to reactivate` });
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const charge = await chargeCard({
      userId: req.authUser.id,
      numberRow,
      amount: numberRow.monthly_rate_sgd,
      periodStart,
      periodEnd,
      attemptNumber: (numberRow.failed_charge_count || 0) + 1,
    });

    if (!charge.ok) {
      return res.status(402).json({ error: 'Card was declined', code: charge.code, detail: charge.message });
    }

    try {
      await twilioReactivate(numberRow);
    } catch (err) {
      console.error('[voip] reactivate failed at Twilio:', err.message);
      return res.status(502).json({ error: 'Reactivation failed at carrier', detail: err.message });
    }

    await supabase
      .from('voip_numbers')
      .update({
        status: 'active',
        next_renewal_at: periodEnd.toISOString(),
        suspended_at: null,
        suspend_reason: null,
        release_scheduled_at: null,
        failed_charge_count: 0,
        first_failure_at: null,
        last_reminder_stage: REMINDER.NONE,
      })
      .eq('id', id);

    res.json({ success: true, charged: numberRow.monthly_rate_sgd });
  });

  // ------------------------------------------------------------
  // GET /voip/call-log?numberId=<uuid>
  // ------------------------------------------------------------
  router.get('/call-log', requireAuth, async (req, res) => {
    let query = supabase
      .from('voip_call_log')
      .select('*')
      .eq('user_id', req.authUser.id)
      .order('started_at', { ascending: false });

    if (req.query.numberId) query = query.eq('voip_number_id', req.query.numberId);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ calls: data });
  });

  // ============================================================
  // Twilio webhooks — not auth-gated; Twilio calls these directly.
  //
  // Signature validation is ON whenever an auth token exists. This is a
  // real security control, not ceremony: without it anyone who learns
  // these URLs can forge call records and voicemail entries against any
  // user's number.
  // ============================================================
  function validateTwilioSignature(req) {
    if (!process.env.TWILIO_AUTH_TOKEN) return true; // mock mode
    try {
      const twilio = require('twilio');
      const signature = req.headers['x-twilio-signature'];
      const url = `${BACKEND_URL}${req.originalUrl}`;
      return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body);
    } catch (err) {
      console.error('[voip] signature validation error:', err.message);
      return false;
    }
  }

  // POST /voip/webhooks/inbound — a forwarded call has arrived.
  // Returns TwiML that rings the user's Voice SDK client, falling through
  // to voicemail on no-answer.
  router.post('/webhooks/inbound', async (req, res) => {
    if (!validateTwilioSignature(req)) return res.status(403).send('Invalid signature');

    const toNumber = req.body.To;

    const { data: numberRow } = await supabase
      .from('voip_numbers')
      .select('*')
      .eq('phone_number', toNumber)
      .eq('status', 'active')
      .single();

    // A call arriving at a number that isn't active shouldn't normally
    // happen — suspension clears the VoiceUrl so Twilio never reaches us
    // — but if it does, reject rather than connect.
    if (!numberRow) {
      return res
        .type('text/xml')
        .send('<Response><Reject reason="rejected"/></Response>');
    }

    await supabase.from('voip_call_log').insert({
      voip_number_id: numberRow.id,
      user_id: numberRow.user_id,
      twilio_call_sid: req.body.CallSid,
      direction: 'inbound',
      counterparty_number: req.body.From,
      status: 'in_progress',
    });

    // callerId passes the ORIGINAL caller's number through unmodified, so
    // the user sees who's actually calling — a locked architecture
    // decision, and also why inbound adds no anonymity for the caller.
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Dial timeout="20" callerId="${req.body.From}" action="${BACKEND_URL}/voip/webhooks/status" method="POST">` +
      `<Client>${numberRow.user_id}</Client>` +
      `</Dial>` +
      `<Say>The person you are calling is not available. Please leave a message after the tone.</Say>` +
      `<Record action="${BACKEND_URL}/voip/webhooks/voicemail" method="POST" maxLength="120" playBeep="true"/>` +
      `</Response>`;

    res.type('text/xml').send(twiml);
  });

  // POST /voip/webhooks/status
  router.post('/webhooks/status', async (req, res) => {
    if (!validateTwilioSignature(req)) return res.status(403).send('Invalid signature');

    const callSid = req.body.CallSid;
    const status = req.body.DialCallStatus || req.body.CallStatus;
    const duration = req.body.DialCallDuration || req.body.CallDuration;

    const statusMap = {
      completed: 'answered',
      'no-answer': 'no_answer',
      busy: 'no_answer',
      failed: 'failed',
      canceled: 'missed',
    };

    await supabase
      .from('voip_call_log')
      .update({
        status: statusMap[status] || 'missed',
        duration_seconds: duration ? parseInt(duration, 10) : null,
        ended_at: new Date().toISOString(),
      })
      .eq('twilio_call_sid', callSid);

    // Twilio expects TwiML back from a <Dial action> callback. Returning
    // an empty Response lets the parent TwiML continue to <Record>, which
    // is how voicemail fallback actually fires on no-answer.
    res.type('text/xml').send('<Response/>');
  });

  // POST /voip/webhooks/voicemail
  router.post('/webhooks/voicemail', async (req, res) => {
    if (!validateTwilioSignature(req)) return res.status(403).send('Invalid signature');

    const callSid = req.body.CallSid;
    const recordingUrl = req.body.RecordingUrl;

    await supabase
      .from('voip_call_log')
      .update({
        status: 'voicemail',
        voicemail_recording_url: recordingUrl,
        ended_at: new Date().toISOString(),
      })
      .eq('twilio_call_sid', callSid);

    // TODO(twilio): transcription via Voice Intelligence, then a second
    // webhook to write voicemail_transcript once ready.

    const { data: callRow } = await supabase
      .from('voip_call_log')
      .select('user_id, counterparty_number')
      .eq('twilio_call_sid', callSid)
      .single();

    if (callRow) {
      await notify(callRow.user_id, {
        title: 'New voicemail',
        body: `From ${callRow.counterparty_number}`,
        url: 'https://juzgo.world/voip',
        emailSubject: 'New voicemail on your Juzgo number',
        emailText: `You have a new voicemail from ${callRow.counterparty_number}. Listen in the app.`,
      });
    }

    res.type('text/xml').send('<Response/>');
  });

  // ============================================================
  // Recurring billing + dunning pass
  //
  // Not scheduled here. Call from a Render cron job:
  //
  //   const { createClient } = require('@supabase/supabase-js');
  //   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  //   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  //   const voip = require('./routes/voip')({
  //     supabase, stripe, requireAuth: () => {},
  //     sendPushToUser: null, sendEmail: null,
  //   });
  //   voip.runVoipRenewalBilling().then(r => console.log(r));
  //
  // Idempotent by design: the unique index on
  // (voip_number_id, billing_period_start) where status='paid' means a
  // double run cannot double-charge — the second insert fails and the
  // number's renewal date has already moved on.
  //
  // Run DAILY. The dunning schedule has day-level granularity and a
  // number sitting one day past its retry point simply retries on the
  // next run, so a missed day degrades gracefully.
  // ============================================================
  async function runVoipRenewalBilling() {
    const now = new Date();
    const summary = { renewed: 0, failed: 0, suspended: 0, released: 0, errors: [] };

    // ---- Pass 1: numbers due for renewal ----
    const { data: due, error: dueErr } = await supabase
      .from('voip_numbers')
      .select('*')
      .eq('status', 'active')
      .lte('next_renewal_at', now.toISOString());

    if (dueErr) throw dueErr;

    for (const numberRow of due || []) {
      const periodStart = new Date(numberRow.next_renewal_at);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      try {
        const charge = await chargeCard({
          userId: numberRow.user_id,
          numberRow,
          amount: numberRow.monthly_rate_sgd,
          periodStart,
          periodEnd,
          attemptNumber: 1,
        });

        if (charge.ok) {
          await supabase
            .from('voip_numbers')
            .update({
              next_renewal_at: periodEnd.toISOString(),
              last_charge_attempt_at: now.toISOString(),
              failed_charge_count: 0,
              first_failure_at: null,
              last_reminder_stage: REMINDER.NONE,
            })
            .eq('id', numberRow.id);
          summary.renewed++;
        } else {
          await supabase
            .from('voip_numbers')
            .update({
              status: 'past_due',
              failed_charge_count: 1,
              first_failure_at: now.toISOString(),
              last_charge_attempt_at: now.toISOString(),
            })
            .eq('id', numberRow.id);

          await sendDunning(numberRow, REMINDER.FIRST_FAILURE);
          summary.failed++;
        }
      } catch (err) {
        console.error(`[voip] renewal error on ${numberRow.phone_number}:`, err.message);
        summary.errors.push({ number: numberRow.phone_number, error: err.message });
      }
    }

    // ---- Pass 2: the dunning cascade ----
    const { data: delinquent, error: delErr } = await supabase
      .from('voip_numbers')
      .select('*')
      .in('status', ['past_due', 'suspended', 'pending_release'])
      .not('first_failure_at', 'is', null);

    if (delErr) throw delErr;

    for (const numberRow of delinquent || []) {
      const age = daysBetween(numberRow.first_failure_at, now);

      try {
        // --- Day 12+: release ---
        if (age >= RELEASE_AFTER_DAYS) {
          await twilioRelease(numberRow);
          await supabase
            .from('voip_numbers')
            .update({
              status: 'released',
              released_at: now.toISOString(),
              release_scheduled_at: null,
            })
            .eq('id', numberRow.id);
          await sendDunning(numberRow, REMINDER.RELEASED);
          summary.released++;
          continue;
        }

        // --- Day 7–11: suspend and hold ---
        if (age >= SUSPEND_AFTER_DAYS) {
          if (numberRow.status !== 'suspended') {
            await twilioSuspend(numberRow);
            const releaseAt = new Date(numberRow.first_failure_at);
            releaseAt.setDate(releaseAt.getDate() + RELEASE_AFTER_DAYS);

            await supabase
              .from('voip_numbers')
              .update({
                status: 'suspended',
                suspended_at: now.toISOString(),
                suspend_reason: 'non_payment',
                release_scheduled_at: releaseAt.toISOString(),
              })
              .eq('id', numberRow.id);

            summary.suspended++;
          }
          await sendDunning(numberRow, REMINDER.SUSPENDED);
          continue;
        }

        // --- Days 1 and 3: retry, then escalate reminders ---
        const dueRetry = RETRY_DAYS.filter((d) => age >= d).length;
        if (dueRetry > (numberRow.failed_charge_count || 1) - 1) {
          const periodStart = new Date(numberRow.next_renewal_at);
          const periodEnd = new Date(periodStart);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const charge = await chargeCard({
            userId: numberRow.user_id,
            numberRow,
            amount: numberRow.monthly_rate_sgd,
            periodStart,
            periodEnd,
            attemptNumber: (numberRow.failed_charge_count || 1) + 1,
          });

          if (charge.ok) {
            // Recovered. Restore service if it had been suspended.
            if (numberRow.status === 'suspended') await twilioReactivate(numberRow);
            await supabase
              .from('voip_numbers')
              .update({
                status: 'active',
                next_renewal_at: periodEnd.toISOString(),
                failed_charge_count: 0,
                first_failure_at: null,
                suspended_at: null,
                suspend_reason: null,
                release_scheduled_at: null,
                last_reminder_stage: REMINDER.NONE,
                last_charge_attempt_at: now.toISOString(),
              })
              .eq('id', numberRow.id);
            summary.renewed++;
            continue;
          }

          await supabase
            .from('voip_numbers')
            .update({
              failed_charge_count: (numberRow.failed_charge_count || 1) + 1,
              last_charge_attempt_at: now.toISOString(),
            })
            .eq('id', numberRow.id);
          summary.failed++;
        }

        // Reminder escalation between retries.
        if (age >= 5) await sendDunning(numberRow, REMINDER.FINAL_WARNING);
        else if (age >= 1) await sendDunning(numberRow, REMINDER.RETRY_FAILED);
      } catch (err) {
        console.error(`[voip] dunning error on ${numberRow.phone_number}:`, err.message);
        summary.errors.push({ number: numberRow.phone_number, error: err.message });
      }
    }

    return summary;
  }

  router.runVoipRenewalBilling = runVoipRenewalBilling;
  return router;
};
