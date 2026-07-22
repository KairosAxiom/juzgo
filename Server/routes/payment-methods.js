// ============================================================
// Server/routes/payment-methods.js — saved-card management (Session 27)
//
// Platform-level, not VOIP-specific. VOIP is the first consumer of it
// because card-locked rental billing needs a card on file, but nothing
// here knows or cares about VOIP.
//
// INTEGRATION (server.js), alongside the existing /voip mount:
//
//   const createPaymentMethodsRouter = require('./routes/payment-methods');
//   app.use('/payment-methods', createPaymentMethodsRouter({
//     supabase, requireAuth, stripe,
//   }));
//
// Factory function, same convention as voip.js — takes the app's single
// `supabase` client (server.js line ~12), the existing `requireAuth`
// middleware (line ~1657, sets req.authUser), and the module-level
// `stripe` instance (line 4). No duplicated clients.
//
// SECURITY NOTE: card details never touch this server. The frontend
// confirms the SetupIntent directly with Stripe using the client_secret
// issued below; we only ever see PaymentMethod ids and the display-safe
// brand/last4. Keep it that way — accepting a raw card number here would
// pull Juzgo into PCI DSS scope it currently sits outside of.
// ============================================================

const express = require('express');

module.exports = function createPaymentMethodsRouter({ supabase, requireAuth, stripe }) {
  const router = express.Router();

  // ------------------------------------------------------------
  // Email lookup.
  //
  // profiles has no email column — it lives in auth.users, which is only
  // readable via the admin API with the service role key. Returns null
  // rather than throwing: a missing email should degrade a receipt, not
  // block a payment.
  // ------------------------------------------------------------
  async function getUserEmail(userId) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) {
        console.error('[payment-methods] email lookup failed:', error.message);
        return null;
      }
      return data?.user?.email || null;
    } catch (err) {
      console.error('[payment-methods] email lookup threw:', err.message);
      return null;
    }
  }

  // ------------------------------------------------------------
  // Get-or-create the Stripe Customer for a profile.
  //
  // Idempotent by construction: if profiles.stripe_customer_id is set we
  // reuse it. The one race worth caring about — two concurrent requests
  // both creating a customer — is tolerable (a stray empty Customer costs
  // nothing and Stripe never bills it), and the DB write is last-wins.
  // ------------------------------------------------------------
  async function getOrCreateCustomer(userId) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new Error('Profile not found');
    if (profile.stripe_customer_id) return profile.stripe_customer_id;

    // Email lives in auth.users, not profiles — Supabase's default. Reachable
    // only with the service role key, which is what this server uses.
    const email = await getUserEmail(userId);

    const customer = await stripe.customers.create({
      email: email || undefined,
      name: profile.full_name || undefined,
      metadata: { juzgo_user_id: userId },
    });

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', userId);

    if (updateErr) throw new Error('Failed to persist customer id: ' + updateErr.message);
    return customer.id;
  }

  // ------------------------------------------------------------
  // POST /payment-methods/setup-intent
  //
  // Step 1 of attaching a card. Returns a client_secret the frontend
  // hands to stripe.confirmCardSetup() with a CardElement.
  //
  // usage: 'off_session' is the load-bearing part — it tells Stripe this
  // card is being saved for later merchant-initiated charges, which is
  // what makes the renewal billing pass legal to run without the user
  // present, and what gets the card issuer to pre-authorise future MITs
  // under SCA. Getting this wrong means renewals start failing with
  // authentication_required months after launch.
  //
  // Frontend note: use hidePostalCode: true on the CardElement, same as
  // every other CardElement in the app (SG/HK cards have no postal code).
  // ------------------------------------------------------------
  router.post('/setup-intent', requireAuth, async (req, res) => {
    try {
      const customerId = await getOrCreateCustomer(req.authUser.id);

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        metadata: { juzgo_user_id: req.authUser.id },
      });

      res.json({ client_secret: setupIntent.client_secret });
    } catch (err) {
      console.error('[payment-methods] setup-intent failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------
  // POST /payment-methods/attach
  // body: { payment_method_id }
  //
  // Step 2, called after the frontend's confirmCardSetup() succeeds.
  //
  // We re-fetch the PaymentMethod from Stripe rather than trusting
  // anything the client sends about it: the client could otherwise
  // post someone else's payment_method_id, so the ownership check
  // below (pm.customer === customerId) is a real authorisation check,
  // not a formality.
  // ------------------------------------------------------------
  router.post('/attach', requireAuth, async (req, res) => {
    const { payment_method_id } = req.body;
    if (!payment_method_id) {
      return res.status(400).json({ error: 'payment_method_id required' });
    }

    try {
      const customerId = await getOrCreateCustomer(req.authUser.id);
      let pm = await stripe.paymentMethods.retrieve(payment_method_id);

      // confirmCardSetup normally attaches it already; attach here only
      // if it hasn't been, and reject anything belonging to someone else.
      if (!pm.customer) {
        pm = await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });
      } else if (pm.customer !== customerId) {
        return res.status(403).json({ error: 'Payment method does not belong to this account' });
      }

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          default_payment_method_id: pm.id,
          card_brand: pm.card?.brand || null,
          card_last4: pm.card?.last4 || null,
          card_exp_month: pm.card?.exp_month || null,
          card_exp_year: pm.card?.exp_year || null,
          card_attached_at: new Date().toISOString(),
        })
        .eq('id', req.authUser.id);

      if (updateErr) return res.status(500).json({ error: updateErr.message });

      res.json({
        success: true,
        card: {
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          exp_month: pm.card?.exp_month,
          exp_year: pm.card?.exp_year,
        },
      });
    } catch (err) {
      console.error('[payment-methods] attach failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------
  // GET /payment-methods — what card is on file, if any.
  // Display-safe fields only; served from our own columns so the
  // storefront doesn't hit Stripe on every render.
  // ------------------------------------------------------------
  router.get('/', requireAuth, async (req, res) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, card_attached_at')
      .eq('id', req.authUser.id)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      has_card: !!data?.default_payment_method_id,
      card: data?.default_payment_method_id
        ? {
            brand: data.card_brand,
            last4: data.card_last4,
            exp_month: data.card_exp_month,
            exp_year: data.card_exp_year,
            attached_at: data.card_attached_at,
          }
        : null,
    });
  });

  // ------------------------------------------------------------
  // DELETE /payment-methods — remove the saved card.
  //
  // Deliberately blocked while the user holds a live VOIP number. The
  // whole card-lock model rests on a chargeable card existing for as
  // long as the rental does; letting someone detach it would recreate
  // exactly the abandonment problem the design set out to remove. The
  // error tells them the actual remedy — release the number first.
  // ------------------------------------------------------------
  router.delete('/', requireAuth, async (req, res) => {
    const userId = req.authUser.id;

    const { data: liveNumbers, error: numErr } = await supabase
      .from('voip_numbers')
      .select('id, phone_number')
      .eq('user_id', userId)
      .in('status', ['active', 'past_due', 'suspended', 'pending_release']);

    if (numErr) return res.status(500).json({ error: numErr.message });

    if (liveNumbers && liveNumbers.length > 0) {
      return res.status(409).json({
        error: 'Cannot remove your card while you have an active VOIP number. Release the number first.',
        blocking_numbers: liveNumbers.map((n) => n.phone_number),
      });
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('default_payment_method_id')
        .eq('id', userId)
        .single();

      if (profile?.default_payment_method_id) {
        await stripe.paymentMethods.detach(profile.default_payment_method_id);
      }

      await supabase
        .from('profiles')
        .update({
          default_payment_method_id: null,
          card_brand: null,
          card_last4: null,
          card_exp_month: null,
          card_exp_year: null,
          card_attached_at: null,
        })
        .eq('id', userId);

      res.json({ success: true });
    } catch (err) {
      console.error('[payment-methods] detach failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Exposed for voip.js, which needs the same get-or-create logic at
  // purchase time. Attached to the router rather than exported separately
  // so server.js has one thing to mount and one thing to pass along.
  router.getOrCreateCustomer = getOrCreateCustomer;

  return router;
};
