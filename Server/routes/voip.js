// ============================================================
// Server/routes/voip.js — Juzgo VOIP backend scaffolding (Session 26)
//
// INTEGRATION (do this in server.js), right after your other requires,
// wherever's convenient before app.listen():
//
//   const createVoipRouter = require('./routes/voip');
//   app.use('/voip', createVoipRouter({ supabase, requireAuth }));
//
// This is a factory, not a plain router — it takes your EXISTING `supabase`
// client (line ~12) and EXISTING `requireAuth` middleware (line ~1657) as
// arguments, so there's exactly one Supabase client and one auth
// implementation in the whole app. requireAuth sets req.authUser, so that's
// what every handler below reads (matches /order/wallet-pay etc.).
//
// NO LIVE TWILIO CALLS YET. Every place a real Twilio API call belongs is
// marked "// TODO(twilio):" with a comment on what it will do once the
// account is reactivated. Endpoints work end-to-end against Supabase today
// (you can create/list/release voip_numbers rows, log calls, run the
// billing pass) — they just don't touch Twilio.
// ============================================================

const express = require('express');

const GRACE_PERIOD_DAYS = 3; // number stays active but flagged; released after this if unpaid

module.exports = function createVoipRouter({ supabase, requireAuth }) {
  const router = express.Router();

  // ------------------------------------------------------------
// GET /voip/available-numbers?country=SG
// Build order step 3 (live lookup) — stubbed with mock data for now.
// ------------------------------------------------------------
router.get('/available-numbers', requireAuth, async (req, res) => {
  const country = (req.query.country || 'SG').toUpperCase();

  // TODO(twilio): replace with a live call to
  //   client.availablePhoneNumbers(country).local.list({ limit: 10 })
  // Availability changes constantly so this should never be pre-synced/cached
  // per the build doc — always a live lookup at purchase time.
  const mockNumbers = [
    { phone_number: '+6591234001', country_code: country, monthly_rate_sgd: 8.0 },
    { phone_number: '+6591234002', country_code: country, monthly_rate_sgd: 8.0 },
    { phone_number: '+6591234003', country_code: country, monthly_rate_sgd: 8.0 },
  ];

  res.json({ numbers: mockNumbers, mock: true });
});

// ------------------------------------------------------------
// POST /voip/numbers/purchase
// body: { phone_number, country_code, monthly_rate_sgd }
// Checks wallet covers first month, deducts atomically, creates the row.
// ------------------------------------------------------------
router.post('/numbers/purchase', requireAuth, async (req, res) => {
  const { phone_number, country_code, monthly_rate_sgd } = req.body;
  if (!phone_number || !country_code || !monthly_rate_sgd) {
    return res.status(400).json({ error: 'phone_number, country_code, monthly_rate_sgd required' });
  }

  const userId = req.authUser.id;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) return res.status(404).json({ error: 'Profile not found' });
  if (profile.wallet_balance < monthly_rate_sgd) {
    return res.status(402).json({ error: 'Insufficient wallet balance', balance: profile.wallet_balance });
  }

  // TODO(twilio): purchase the number for real —
  //   const twilioNumber = await client.incomingPhoneNumbers.create({
  //     phoneNumber: phone_number,
  //     voiceUrl: `${BACKEND_URL}/voip/webhooks/inbound`,
  //     voiceMethod: 'POST',
  //     statusCallback: `${BACKEND_URL}/voip/webhooks/status`,
  //   });
  // twilio_sid below would come from twilioNumber.sid.
  const twilio_sid = null;

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
    })
    .select()
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  // Deduct wallet atomically via RPC (see migration), log the charge.
  const { data: newBalance, error: rpcErr } = await supabase.rpc('increment_wallet_balance', {
    p_user_id: userId,
    p_amount: -monthly_rate_sgd,
  });

  if (rpcErr) {
    // Roll back the number row rather than leave an unpaid "active" row.
    await supabase.from('voip_numbers').delete().eq('id', numberRow.id);
    return res.status(402).json({ error: 'Wallet debit failed: ' + rpcErr.message });
  }

  await supabase.from('voip_charges').insert({
    voip_number_id: numberRow.id,
    user_id: userId,
    amount_sgd: monthly_rate_sgd,
    charge_type: 'rental',
    status: 'paid',
    billing_period_start: now.toISOString().slice(0, 10),
    billing_period_end: nextRenewal.toISOString().slice(0, 10),
    wallet_balance_before: profile.wallet_balance,
    wallet_balance_after: newBalance,
  });

  res.json({ number: numberRow, wallet_balance: newBalance });
});

// ------------------------------------------------------------
// GET /voip/numbers — list current user's numbers
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

  // TODO(twilio): release for real —
  //   await client.incomingPhoneNumbers(numberRow.twilio_sid).remove();

  const { error: updateErr } = await supabase
    .from('voip_numbers')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.json({ success: true });
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

// ------------------------------------------------------------
// Twilio webhooks — NOT auth-gated (Twilio calls these directly).
// TODO(twilio): once live, validate the X-Twilio-Signature header on all
// three of these before trusting the payload — see Twilio's
// twilio.validateRequest() helper. Skipped entirely for now since there's
// no live Twilio traffic yet.
// ------------------------------------------------------------

// POST /voip/webhooks/inbound — Twilio hits this when a call arrives at
// the Twilio number. Should return TwiML that <Dial><Client>s the user's
// Voice SDK client, falling through to <Record> for voicemail on no-answer.
router.post('/webhooks/inbound', async (req, res) => {
  const toNumber = req.body.To;

  const { data: numberRow } = await supabase
    .from('voip_numbers')
    .select('*')
    .eq('phone_number', toNumber)
    .eq('status', 'active')
    .single();

  if (numberRow) {
    await supabase.from('voip_call_log').insert({
      voip_number_id: numberRow.id,
      user_id: numberRow.user_id,
      twilio_call_sid: req.body.CallSid,
      direction: 'inbound',
      counterparty_number: req.body.From,
      status: 'in_progress',
    });
  }

  // TODO(twilio): build real TwiML, e.g.:
  //   <Response>
  //     <Dial timeout="20" action="/voip/webhooks/status">
  //       <Client>${numberRow.user_id}</Client>
  //     </Dial>
  //     <Record action="/voip/webhooks/voicemail" maxLength="120" />
  //   </Response>
  res.type('text/xml').send('<Response></Response>');
});

// POST /voip/webhooks/status — call status callback (completed/no-answer/etc)
router.post('/webhooks/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.DialCallStatus || req.body.CallStatus;
  const duration = req.body.DialCallDuration || req.body.CallDuration;

  const statusMap = { completed: 'answered', 'no-answer': 'no_answer', busy: 'no_answer', failed: 'failed' };

  await supabase
    .from('voip_call_log')
    .update({
      status: statusMap[status] || 'missed',
      duration_seconds: duration ? parseInt(duration, 10) : null,
      ended_at: new Date().toISOString(),
    })
    .eq('twilio_call_sid', callSid);

  res.sendStatus(200);
});

// POST /voip/webhooks/voicemail — recording complete
router.post('/webhooks/voicemail', async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;

  // TODO(twilio): kick off transcription via Voice Intelligence API here,
  // then a second webhook/poll to write voicemail_transcript once ready.
  await supabase
    .from('voip_call_log')
    .update({
      status: 'voicemail',
      voicemail_recording_url: recordingUrl,
      ended_at: new Date().toISOString(),
    })
    .eq('twilio_call_sid', callSid);

  res.sendStatus(200);
});

// ------------------------------------------------------------
// Recurring billing pass — NOT wired to a schedule yet. Attached to the
// returned router so it can be called from a Render cron job / scheduled
// task once ready, e.g.:
//   const { createClient } = require('@supabase/supabase-js');
//   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
//   const voipRouter = require('./routes/voip')({ supabase, requireAuth: () => {} });
//   voipRouter.runVoipRenewalBilling().then(r => console.log(r));
// Grace-period logic answers the build doc's "open item, not blocking
// build start": insufficient funds -> grace_period for GRACE_PERIOD_DAYS,
// then released if still unpaid.
// ------------------------------------------------------------
async function runVoipRenewalBilling() {
  const now = new Date();

  const { data: due, error } = await supabase
    .from('voip_numbers')
    .select('*')
    .eq('status', 'active')
    .lte('next_renewal_at', now.toISOString());

  if (error) throw error;

  for (const numberRow of due || []) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', numberRow.user_id)
      .single();

    const periodStart = new Date(numberRow.next_renewal_at);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (profile && profile.wallet_balance >= numberRow.monthly_rate_sgd) {
      const { data: newBalance } = await supabase.rpc('increment_wallet_balance', {
        p_user_id: numberRow.user_id,
        p_amount: -numberRow.monthly_rate_sgd,
      });

      await supabase.from('voip_charges').insert({
        voip_number_id: numberRow.id,
        user_id: numberRow.user_id,
        amount_sgd: numberRow.monthly_rate_sgd,
        charge_type: 'rental',
        status: 'paid',
        billing_period_start: periodStart.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
        wallet_balance_before: profile.wallet_balance,
        wallet_balance_after: newBalance,
      });

      await supabase
        .from('voip_numbers')
        .update({ next_renewal_at: periodEnd.toISOString(), grace_period_ends_at: null })
        .eq('id', numberRow.id);
    } else {
      // Insufficient funds: enter (or continue) grace period.
      const graceEnd = numberRow.grace_period_ends_at
        ? new Date(numberRow.grace_period_ends_at)
        : (() => {
            const d = new Date(now);
            d.setDate(d.getDate() + GRACE_PERIOD_DAYS);
            return d;
          })();

      await supabase.from('voip_charges').insert({
        voip_number_id: numberRow.id,
        user_id: numberRow.user_id,
        amount_sgd: numberRow.monthly_rate_sgd,
        charge_type: 'rental',
        status: 'skipped_insufficient_funds',
        billing_period_start: periodStart.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
        wallet_balance_before: profile ? profile.wallet_balance : null,
        wallet_balance_after: profile ? profile.wallet_balance : null,
      });

      if (now >= graceEnd) {
        // TODO(twilio): release the number for real — client.incomingPhoneNumbers(sid).remove()
        await supabase
          .from('voip_numbers')
          .update({ status: 'released', released_at: now.toISOString() })
          .eq('id', numberRow.id);
      } else {
        await supabase
          .from('voip_numbers')
          .update({ status: 'grace_period', grace_period_ends_at: graceEnd.toISOString() })
          .eq('id', numberRow.id);
      }
    }
  }

    return { processed: (due || []).length };
  }

  router.runVoipRenewalBilling = runVoipRenewalBilling;
  return router;
};
