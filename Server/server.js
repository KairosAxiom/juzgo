require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 4000;

// Supabase admin client (service role — bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// VAPID config
webpush.setVapidDetails(
  'mailto:dlimyk@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.use(cors());

// Raw body required for Stripe webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'juzgo backend running' });
});

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

// Verify request comes from admin email
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No auth header' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  if (user.email !== process.env.ADMIN_EMAIL) return res.status(403).json({ error: 'Not admin' });
  req.adminUser = user;
  next();
}

// Verify request comes from a linked reseller account
async function requireReseller(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No auth header' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  const { data: reseller } = await supabase
    .from('resellers')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();
  if (!reseller) return res.status(403).json({ error: 'Not a reseller' });
  req.reseller = reseller;
  req.authUser = user;
  next();
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────

app.post('/push/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: 'Missing userId or subscription' });
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, subscription }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

async function sendPushToUser(userId, payload) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId)
    .single();
  if (error || !data) return;
  try {
    await webpush.sendNotification(data.subscription, JSON.stringify(payload));
  } catch (err) {
    console.error(`Push failed for user ${userId}:`, err.message);
    if (err.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    }
  }
}

app.post('/push/send', async (req, res) => {
  const { userId, title, body, url } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  await sendPushToUser(userId, { title, body, url });
  res.json({ ok: true });
});

// ── STRIPE ────────────────────────────────────────────────────────────────────

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'sgd', userId, planId, type } = req.body;
    const isPlanPurchase = type === 'plan_purchase';
    // The SGD5 minimum exists for wallet top-ups; plan purchases are validated
    // by their own price, so don't block a legitimately cheap plan.
    if (!amount || (!isPlanPurchase && amount < 500)) {
      return res.status(400).json({ error: 'Minimum top-up is SGD 5.' });
    }
    const metadata = { user_id: userId || '', source: isPlanPurchase ? 'plan_purchase' : 'wallet_topup' };
    if (planId) metadata.plan_id = String(planId);
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;

    // ── Corporate wallet top-up ───────────────────────────────
    if (intent.metadata?.type === 'corp_wallet_topup') {
      const { corp_id } = intent.metadata;
      const amountSgd = intent.amount / 100;
      try {
        await supabase.rpc('increment_corp_wallet', { p_corp_id: corp_id, p_amount: amountSgd });
        console.log(`[CORP WALLET] Topped up SGD${amountSgd} for corp ${corp_id}`);
      } catch (err) {
        console.error('Corp wallet top-up webhook error:', err.message);
      }
      return res.json({ received: true });
    }

    // ── Personal wallet top-up ────────────────────────────────
    const userId = intent.metadata?.user_id;
    const amountSgd = intent.amount / 100;
    if (!userId) {
      console.warn('Webhook: no user_id in metadata, skipping wallet credit');
      return res.json({ received: true });
    }
    try {
      const { error: topupError } = await supabase
        .from('wallet_topups')
        .upsert({
          user_id: userId,
          amount_sgd: amountSgd,
          stripe_payment_intent_id: intent.id,
          status: 'succeeded',
        }, { onConflict: 'stripe_payment_intent_id' });
      if (topupError) {
        console.error('wallet_topups upsert error:', topupError.message);
        return res.status(500).json({ error: topupError.message });
      }
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', userId)
        .single();
      if (fetchError) {
        console.error('Profile fetch error:', fetchError.message);
        return res.status(500).json({ error: fetchError.message });
      }
      const newBalance = parseFloat(((profile.wallet_balance || 0) + amountSgd).toFixed(2));
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ wallet_balance: newBalance })
        .eq('id', userId);
      if (updateError) {
        console.error('Wallet balance update error:', updateError.message);
        return res.status(500).json({ error: updateError.message });
      }
      console.log(`Wallet credited: user=${userId} amount=SGD${amountSgd} new_balance=SGD${newBalance}`);
      await sendPushToUser(userId, {
        title: '💳 Wallet Topped Up',
        body: `SGD ${amountSgd.toFixed(2)} has been added to your Juzgo wallet.`,
        url: '/wallet',
      });
    } catch (err) {
      console.error('Webhook handler error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ received: true });
});

// POST /order/wallet-pay — pay for a plan using Juzgo Wallet balance.
// This route never existed, which is why wallet checkout 404'd. Mirrors
// /order/create's logic (resolve promo, write order, email receipt) but
// deducts from wallet_balance instead of going through Stripe.
app.post('/order/wallet-pay', requireAuth, async (req, res) => {
  const userId = req.authUser.id;
  const customerEmail = req.authUser.email;
  const { planId, promoCode, orderSource, specialRequestLogId } = req.body;

  if (!planId) return res.status(400).json({ error: 'planId is required' });

  try {
    const plan = await resolvePlanForCheckout(planId, orderSource);
    if (!plan) return res.status(404).json({ error: 'Plan not found or no longer available' });

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('wallet_balance, full_name')
      .eq('id', userId)
      .single();
    if (profErr || !profile) return res.status(404).json({ error: 'Profile not found' });

    // Resolve promo/referral code server-side, same helper /reseller/validate uses.
    let referral_code = null;
    let reseller_code = null;
    let discount_sgd = 0;
    if (promoCode) {
      const promo = await resolvePromoCode(promoCode);
      if (promo.valid) {
        if (promo.kind === 'referral') referral_code = promo.code;
        if (promo.kind === 'reseller') {
          reseller_code = promo.code;
          const price = parseFloat(plan.price_sgd || 0);
          discount_sgd = promo.discount_type === 'percent'
            ? parseFloat((price * (promo.discount_value / 100)).toFixed(2))
            : parseFloat(promo.discount_value || 0);
        }
      }
    }

    const price = parseFloat(plan.price_sgd || 0);
    const total = Math.max(0, parseFloat((price - discount_sgd).toFixed(2)));
    const currentBalance = parseFloat(profile.wallet_balance || 0);

    if (currentBalance < total) {
      return res.status(402).json({ error: `Insufficient wallet balance. You have SGD ${currentBalance.toFixed(2)}, this plan costs SGD ${total.toFixed(2)}.` });
    }

    const order_code = 'JZ-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    // Write the order first — only deduct the balance once we know the order
    // actually saved, so a DB failure can't charge the wallet for nothing.
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        customer_email: customerEmail,
        customer_name: profile.full_name || null,
        country_name: plan.country_region || null,
        country_code: plan.country_code || null,
        package_title: plan.plan_name || null,
        package_id: plan.package_id,
        data_amount: plan.data_amount,
        validity_days: plan.validity_days,
        price_sgd: total,
        your_price_at_sale: price,
        net_price_at_sale: plan.net_price_sgd,
        discount_sgd,
        order_code,
        status: 'completed',
        payment_method: 'wallet',
        referral_code,
        reseller_code,
        order_source: orderSource === 'special_request' ? 'special_request' : 'catalog',
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    if (orderSource === 'special_request' && specialRequestLogId) {
      await supabase
        .from('special_request_log')
        .update({ selected_package_id: plan.package_id, order_id: order.id })
        .eq('id', specialRequestLogId);
    }

    const newBalance = parseFloat((currentBalance - total).toFixed(2));
    const { error: balanceErr } = await supabase
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', userId);
    if (balanceErr) {
      // Order exists but balance didn't move — mark it so it's visible in
      // admin/orders rather than silently leaving free plans on the books.
      await supabase.from('orders').update({ status: 'wallet_deduction_failed' }).eq('id', order.id);
      throw balanceErr;
    }

    if (referral_code) await processReferralCredit(referral_code, userId);

    await sendPushToUser(userId, {
      title: '✅ Order confirmed',
      body: `Your ${order.country_name || 'eSIM'} plan is confirmed. Check your email for details.`,
      url: '/purchases',
    });

    await sendEmail({
      to: customerEmail,
      subject: `Your Juzgo eSIM Order — ${order.order_code}`,
      text: [
        `Hi ${profile.full_name || 'there'},`,
        ``,
        `Thanks for your purchase! Here are your order details:`,
        ``,
        `Order code:  ${order.order_code}`,
        `Destination: ${order.country_name || '—'}`,
        `Data:        ${order.data_amount || '—'}`,
        `Validity:    ${order.validity_days || '—'} days`,
        `Paid:        SGD ${parseFloat(order.price_sgd).toFixed(2)} (Juzgo Wallet)`,
        ``,
        `Your eSIM QR code will follow in a separate email shortly.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[ORDER] Created ${order.order_code} for ${customerEmail} — wallet payment, new balance SGD${newBalance}`);

    return res.json({ success: true, order });
  } catch (err) {
    console.error('POST /order/wallet-pay', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /corporate/wallet-balance — lightweight read for any corp-linked
// user (staff or admin), used to show the corp wallet on their personal
// Dashboard/Checkout without exposing the rest of the corporates row
// (corporates table is service-role-only RLS, so the client can't query
// it directly).
app.get('/corporate/wallet-balance', requireAuth, async (req, res) => {
  const userId = req.authUser.id;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_corporate, corp_id')
      .eq('id', userId)
      .single();
    if (!profile?.is_corporate || !profile?.corp_id) {
      return res.status(403).json({ error: 'Not a corporate-linked account' });
    }
    const { data: corp, error } = await supabase
      .from('corporates')
      .select('wallet_balance, company_name, is_active')
      .eq('id', profile.corp_id)
      .single();
    if (error || !corp) return res.status(404).json({ error: 'Corporate account not found' });
    return res.json({
      wallet_balance: corp.wallet_balance,
      company_name: corp.company_name,
      is_active: corp.is_active,
    });
  } catch (err) {
    console.error('GET /corporate/wallet-balance', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /order/corp-wallet-pay — pay for a plan using the corporate wallet.
// Session 20: corp-linked accounts (staff and admin) are work-purchasing
// only — no card, no personal wallet — every purchase draws from the
// org's pooled wallet_balance automatically. No promo/referral codes here
// by design; this is an internal work purchase, not a public promo path.
app.post('/order/corp-wallet-pay', requireAuth, async (req, res) => {
  const userId = req.authUser.id;
  const customerEmail = req.authUser.email;
  const { planId, orderSource, specialRequestLogId } = req.body;

  if (!planId) return res.status(400).json({ error: 'planId is required' });

  try {
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('is_corporate, corp_id, full_name')
      .eq('id', userId)
      .single();
    if (profErr || !profile) return res.status(404).json({ error: 'Profile not found' });
    if (!profile.is_corporate || !profile.corp_id) {
      return res.status(403).json({ error: 'Not a corporate-linked account' });
    }

    const { data: corp, error: corpErr } = await supabase
      .from('corporates')
      .select('wallet_balance, company_name, contact_email, is_active')
      .eq('id', profile.corp_id)
      .single();
    if (corpErr || !corp) return res.status(404).json({ error: 'Corporate account not found' });
    if (!corp.is_active) {
      return res.status(403).json({ error: 'Your corporate account is not active. Contact your admin.' });
    }

    const plan = await resolvePlanForCheckout(planId, orderSource);
    if (!plan) return res.status(404).json({ error: 'Plan not found or no longer available' });

    const total = parseFloat(plan.price_sgd || 0);
    const currentBalance = parseFloat(corp.wallet_balance || 0);

    if (currentBalance < total) {
      // Block the purchase AND proactively notify the admin so they know
      // to top up — the staff member never sees a card fallback, so this
      // is the only signal that gets a top-up moving.
      await sendEmail({
        to: corp.contact_email,
        subject: `[Juzgo] Corporate wallet low — top-up needed (${corp.company_name})`,
        text: [
          `Hi,`,
          ``,
          `${profile.full_name || customerEmail} tried to purchase a ${plan.plan_name || 'plan'}`,
          `(SGD ${total.toFixed(2)}) using ${corp.company_name}'s corporate wallet, but the`,
          `current balance (SGD ${currentBalance.toFixed(2)}) wasn't enough to cover it.`,
          ``,
          `The purchase was blocked. Top up the corporate wallet to let staff`,
          `continue purchasing:`,
          `https://juzgo.world/corporate/dashboard`,
          ``,
          `The Juzgo Team`,
        ].join('\n'),
      });
      return res.status(402).json({
        error: `Insufficient corporate wallet balance. Please contact your admin to top up.`,
      });
    }

    const order_code = 'JZ-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        customer_email: customerEmail,
        customer_name: profile.full_name || null,
        country_name: plan.country_region || null,
        country_code: plan.country_code || null,
        package_title: plan.plan_name || null,
        package_id: plan.package_id,
        data_amount: plan.data_amount,
        validity_days: plan.validity_days,
        price_sgd: total,
        your_price_at_sale: total,
        net_price_at_sale: plan.net_price_sgd,
        discount_sgd: 0,
        order_code,
        status: 'completed',
        payment_method: 'corp_wallet',
        order_source: orderSource === 'special_request' ? 'special_request' : 'catalog',
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    if (orderSource === 'special_request' && specialRequestLogId) {
      await supabase
        .from('special_request_log')
        .update({ selected_package_id: plan.package_id, order_id: order.id })
        .eq('id', specialRequestLogId);
    }

    // Atomic decrement (same RPC the top-up webhook uses to credit, just
    // negative) rather than fetch-then-update, to avoid a race between two
    // staff purchasing at the same moment.
    const { error: deductErr } = await supabase.rpc('increment_corp_wallet', {
      p_corp_id: profile.corp_id,
      p_amount: -total,
    });
    if (deductErr) {
      await supabase.from('orders').update({ status: 'wallet_deduction_failed' }).eq('id', order.id);
      throw deductErr;
    }

    await sendPushToUser(userId, {
      title: '✅ Order confirmed',
      body: `Your ${order.country_name || 'eSIM'} plan is confirmed. Check your email for details.`,
      url: '/purchases',
    });

    await sendEmail({
      to: customerEmail,
      subject: `Your Juzgo eSIM Order — ${order.order_code}`,
      text: [
        `Hi ${profile.full_name || 'there'},`,
        ``,
        `Thanks for your purchase! Here are your order details:`,
        ``,
        `Order code:  ${order.order_code}`,
        `Destination: ${order.country_name || '—'}`,
        `Data:        ${order.data_amount || '—'}`,
        `Validity:    ${order.validity_days || '—'} days`,
        `Paid:        SGD ${total.toFixed(2)} (${corp.company_name} corporate wallet)`,
        ``,
        `Your eSIM QR code will follow in a separate email shortly.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[ORDER] Created ${order.order_code} for ${customerEmail} — corp wallet payment (${corp.company_name})`);

    return res.json({ success: true, order });
  } catch (err) {
    console.error('POST /order/corp-wallet-pay', err);
    return res.status(500).json({ error: err.message });
  }
});


// order row, and email the receipt. Called by Checkout.js right after
// stripe.confirmCardPayment() succeeds.
//
// NOTE — scope limit: this does NOT yet provision an eSIM QR code. That needs
// the Cloudflare worker's /airalo/orders endpoint, which wasn't available to
// review this session. qr_url is left unset; the email tells the customer
// their QR will follow separately. Revisit once the worker's request/response
// contract for provisioning is confirmed.
//
// REQUIRES a one-time migration before this will work — run in Supabase SQL
// Editor:
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
//   CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_pi_idx
//     ON orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
app.post('/order/create', async (req, res) => {
  const {
    paymentIntentId, planId, countryName, countryCode,
    customerEmail, customerName, userId, promoCode, priceSgd,
    orderSource, specialRequestLogId,
  } = req.body;

  if (!paymentIntentId || !planId || !customerEmail) {
    return res.status(400).json({ error: 'paymentIntentId, planId and customerEmail are required' });
  }

  try {
    // Idempotency guard — a retry or double-submit shouldn't create two
    // orders for the same charge.
    const { data: existing } = await supabase
      .from('orders')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (existing) {
      return res.json({ ok: true, order: existing, alreadyExisted: true });
    }

    // Never trust the client alone — confirm the charge actually succeeded.
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: `Payment not confirmed (status: ${intent.status})` });
    }

    // Pull plan details from the DB rather than trusting client-supplied price/data.
    const plan = await resolvePlanForCheckout(planId, orderSource);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found or no longer available' });
    }

    // Resolve the promo/referral code server-side so it lands on the right
    // column — referral_code for USR- codes, reseller_code for reseller
    // discount codes — same helper /reseller/validate uses.
    let referral_code = null;
    let reseller_code = null;
    let discount_sgd = 0;
    if (promoCode) {
      const promo = await resolvePromoCode(promoCode);
      if (promo.valid) {
        if (promo.kind === 'referral') referral_code = promo.code;
        if (promo.kind === 'reseller') {
          reseller_code = promo.code;
          const price = parseFloat(plan.price_sgd || 0);
          discount_sgd = promo.discount_type === 'percent'
            ? parseFloat((price * (promo.discount_value / 100)).toFixed(2))
            : parseFloat(promo.discount_value || 0);
        }
      }
    }

    const order_code = 'JZ-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: userId || null,
        customer_email: customerEmail,
        customer_name: customerName || null,
        country_name: countryName || plan.country_region || null,
        country_code: countryCode || plan.country_code || null,
        package_title: plan.plan_name || null,
        package_id: plan.package_id,
        data_amount: plan.data_amount,
        validity_days: plan.validity_days,
        price_sgd: priceSgd || plan.price_sgd,
        your_price_at_sale: plan.price_sgd,
        net_price_at_sale: plan.net_price_sgd,
        discount_sgd,
        order_code,
        status: 'completed',
        payment_method: 'card',
        stripe_payment_intent_id: paymentIntentId,
        referral_code,
        reseller_code,
        order_source: orderSource === 'special_request' ? 'special_request' : 'catalog',
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    if (orderSource === 'special_request' && specialRequestLogId) {
      await supabase
        .from('special_request_log')
        .update({ selected_package_id: plan.package_id, order_id: order.id })
        .eq('id', specialRequestLogId);
    }

    if (userId && referral_code) await processReferralCredit(referral_code, userId);

    if (userId) {
      await sendPushToUser(userId, {
        title: '✅ Order confirmed',
        body: `Your ${order.country_name || 'eSIM'} plan is confirmed. Check your email for details.`,
        url: '/purchases',
      });
    }

    await sendEmail({
      to: customerEmail,
      subject: `Your Juzgo eSIM Order — ${order.order_code}`,
      text: [
        `Hi ${customerName || 'there'},`,
        ``,
        `Thanks for your purchase! Here are your order details:`,
        ``,
        `Order code:  ${order.order_code}`,
        `Destination: ${order.country_name || '—'}`,
        `Data:        ${order.data_amount || '—'}`,
        `Validity:    ${order.validity_days || '—'} days`,
        `Paid:        SGD ${parseFloat(order.price_sgd).toFixed(2)}`,
        ``,
        `Your eSIM QR code will follow in a separate email shortly.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[ORDER] Created ${order.order_code} for ${customerEmail} — payment_intent ${paymentIntentId}`);

    return res.json({ ok: true, order });
  } catch (err) {
    console.error('POST /order/create', err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /admin/stats — summary cards for dashboard
app.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [ordersRes, usersRes, topupsRes] = await Promise.all([
      supabase.from('orders').select('price_sgd, status'),
      supabase.from('profiles').select('id'),
      supabase.from('wallet_topups').select('amount_sgd, status'),
    ]);
    const orders   = ordersRes.data || [];
    const users    = usersRes.data  || [];
    const topups   = topupsRes.data || [];
    const completed = orders.filter(o => o.status === 'completed');
    const totalRevenue = completed.reduce((s, o) => s + parseFloat(o.price_sgd || 0), 0);
    const totalTopups  = topups.filter(t => t.status === 'succeeded')
                               .reduce((s, t) => s + parseFloat(t.amount_sgd || 0), 0);
    res.json({
      totalOrders:      orders.length,
      completedOrders:  completed.length,
      totalRevenue:     totalRevenue.toFixed(2),
      totalUsers:       users.length,
      totalWalletTopups: totalTopups.toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/orders — all orders
app.get('/admin/orders', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/orders/:id — update order status
app.put('/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/users — all profiles + emails
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = {};
    (authData?.users || []).forEach(u => { emailMap[u.id] = u.email; });
    const merged = profiles.map(p => ({ ...p, email: emailMap[p.id] || '' }));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/add-credits — manually add wallet credits to a user
app.post('/admin/add-credits', requireAdmin, async (req, res) => {
  try {
    const { user_id, amount } = req.body;
    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing user_id or invalid amount' });
    }
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', user_id)
      .single();
    if (fetchError) throw fetchError;
    const newBalance = parseFloat(((profile.wallet_balance || 0) + parseFloat(amount)).toFixed(2));
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', user_id);
    if (updateError) throw updateError;
    // Notify user
    await sendPushToUser(user_id, {
      title: '🎁 Credits Added',
      body: `SGD ${parseFloat(amount).toFixed(2)} has been added to your wallet by eSIMconnect.`,
      url: '/wallet',
    });
    res.json({ ok: true, new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/gift-plan — insert a free completed order for a user
app.post('/admin/gift-plan', requireAdmin, async (req, res) => {
  try {
    const { user_id, customer_email, customer_name, country_name, country_code,
            package_title, data_amount, validity_days, price_sgd } = req.body;
    if (!user_id || !country_name || !package_title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const order_code = 'GIFT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id,
        customer_email,
        customer_name,
        country_name,
        country_code,
        package_title,
        data_amount,
        validity_days,
        price_sgd: price_sgd || 0,
        order_code,
        status: 'completed',
        payment_method: 'gifted',
      })
      .select()
      .single();
    if (error) throw error;
    await sendPushToUser(user_id, {
      title: '🎁 Free Plan Gifted!',
      body: `You've received a free ${package_title} plan from eSIMconnect. Check your Purchases!`,
      url: '/purchases',
    });
    res.json({ ok: true, order: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/reset-password — trigger Supabase password reset email
app.post('/admin/reset-password', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'https://juzgo.world'}/login`,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/wallet-topups — all wallet top-ups
app.get('/admin/wallet-topups', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('wallet_topups')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/usage-logs — itinerary search logs
app.get('/admin/usage-logs', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — RESELLER MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /admin/resellers — list all resellers
app.get('/admin/resellers', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resellers')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/resellers — create a new reseller (auto-generates code)
app.post('/admin/resellers', requireAdmin, async (req, res) => {
  try {
    const {
      name, short_name, country_iso, commission_pct,
      discount_value, discount_type, attribution_months,
      start_date, notes, user_id
    } = req.body;

    if (!name || !short_name || !country_iso) {
      return res.status(400).json({ error: 'name, short_name and country_iso are required' });
    }

    // Get next sequence value
    const { data: seqData, error: seqError } = await supabase
      .rpc('nextval', { seq_name: 'reseller_code_seq' });

    let seq;
    if (seqError || seqData === null) {
      // Fallback: count existing resellers + 1
      const { count } = await supabase
        .from('resellers')
        .select('*', { count: 'exact', head: true });
      seq = (count || 0) + 1;
    } else {
      seq = seqData;
    }

    const code = `${country_iso.toUpperCase()}-${short_name.toUpperCase()}-${String(seq).padStart(5, '0')}`;

    const { data, error } = await supabase
      .from('resellers')
      .insert({
        name,
        short_name: short_name.toUpperCase(),
        country_iso: country_iso.toUpperCase(),
        code,
        commission_pct:      commission_pct      ?? 10,
        discount_value:      discount_value      ?? 0,
        discount_type:       discount_type       ?? 'percent',
        attribution_months:  attribution_months  ?? 0,
        start_date:          start_date          ?? new Date().toISOString().split('T')[0],
        notes:               notes               ?? null,
        user_id:             user_id             ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/resellers/:id — edit reseller (code is immutable)
app.put('/admin/resellers/:id', requireAdmin, async (req, res) => {
  try {
    const { code, ...updates } = req.body; // strip code — never update it
    const { data, error } = await supabase
      .from('resellers')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/resellers/:id — deactivate only (never hard delete)
app.delete('/admin/resellers/:id', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resellers')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/reseller-sales — orders attributed to resellers + commission calc
app.get('/admin/reseller-sales', requireAdmin, async (req, res) => {
  try {
    // Get all orders that have a reseller_code
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .not('reseller_code', 'is', null)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    // Get all resellers for lookup
    const { data: resellers, error: resError } = await supabase
      .from('resellers')
      .select('*');
    if (resError) throw resError;

    const resellerMap = {};
    resellers.forEach(r => { resellerMap[r.code] = r; });

    // Build enriched rows
    const enriched = orders.map(o => {
      const reseller = resellerMap[o.reseller_code];
      const netPrice = parseFloat(o.price_sgd || 0) - parseFloat(o.discount_sgd || 0);
      const commission = reseller
        ? parseFloat((netPrice * reseller.commission_pct / 100).toFixed(2))
        : 0;
      return {
        ...o,
        reseller_name:    reseller?.name       || 'Unknown',
        commission_pct:   reseller?.commission_pct || 0,
        commission_sgd:   commission,
        net_price_sgd:    netPrice.toFixed(2),
      };
    });

    // Aggregate by reseller
    const summary = {};
    enriched.forEach(o => {
      const key = o.reseller_code;
      if (!summary[key]) {
        summary[key] = {
          reseller_code: key,
          reseller_name: o.reseller_name,
          commission_pct: o.commission_pct,
          total_orders: 0,
          total_revenue_sgd: 0,
          total_commission_sgd: 0,
        };
      }
      summary[key].total_orders++;
      summary[key].total_revenue_sgd    += parseFloat(o.price_sgd || 0);
      summary[key].total_commission_sgd += o.commission_sgd;
    });

    Object.values(summary).forEach(s => {
      s.total_revenue_sgd    = s.total_revenue_sgd.toFixed(2);
      s.total_commission_sgd = s.total_commission_sgd.toFixed(2);
    });

    res.json({ orders: enriched, summary: Object.values(summary) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC — RESELLER CODE VALIDATION (used at checkout)
// ═══════════════════════════════════════════════════════════════

// POST /reseller/validate — validate a code and return discount info
// Shared by /reseller/validate and any purchase flow (card, wallet) that
// needs to resolve a promo/referral code server-side. Returns which column
// it belongs on (orders.referral_code for USR- codes, orders.reseller_code
// for reseller discount codes) so callers don't have to guess.
async function resolvePromoCode(rawCode) {
  const code = (rawCode || '').toUpperCase().trim();
  if (!code) return { valid: false, message: 'Missing code' };

  if (code.startsWith('USR-')) {
    const { data: referrer, error: refError } = await supabase
      .from('profiles')
      .select('id, full_name, referral_code')
      .eq('referral_code', code)
      .single();
    if (refError || !referrer) {
      return { valid: false, message: 'Referral code not found' };
    }
    const firstName = (referrer.full_name || 'A friend').split(' ')[0];
    return {
      valid: true,
      kind: 'referral',
      code: referrer.referral_code,
      discount_value: 0,
      discount_type: 'percent',
      referrer_id: referrer.id,
      message: `Referral code applied — referred by ${firstName}`,
    };
  }

  const { data: reseller, error } = await supabase
    .from('resellers')
    .select('code, commission_pct, discount_value, discount_type, is_active, start_date, name')
    .eq('code', code)
    .single();

  if (error || !reseller) return { valid: false, message: 'Code not found' };
  if (!reseller.is_active) return { valid: false, message: 'This code is no longer active' };
  if (reseller.start_date && new Date(reseller.start_date) > new Date()) {
    return { valid: false, message: 'This code is not yet active' };
  }

  return {
    valid: true,
    kind: 'reseller',
    code: reseller.code,
    discount_value: reseller.discount_value,
    discount_type: reseller.discount_type,
    message: reseller.discount_value > 0
      ? `Code ${reseller.code} applied — ${reseller.discount_type === 'percent'
          ? `${reseller.discount_value}% off`
          : `SGD ${parseFloat(reseller.discount_value).toFixed(2)} off`}`
      : `Code ${reseller.code} applied`,
  };
}

// GET /admin/catalog — paginated, filterable Airalo catalog for the Catalog &
// Pricing tab. Joins airalo_catalog -> juzgo_selected_plans (David's curation
// layer) so the table can show current Sell?/Your Price state alongside the
// raw catalog data. Reference: juzgo-airalo-catalog-admin-spec.md §5.
//
// Query params:
//   page     (default 1)
//   limit    (default 50, capped at 200 — this table has ~1,990+ rows, never
//             ship the whole thing to the client at once)
//   scope    'country' | 'region' | 'global' | omit for all
//   type     'sim' | 'topup' | omit for both
//   search   matches against country_region or package_id (case-insensitive)
// Reverse lookup: searching a country name (e.g. "Japan") should also surface
// region/global bundles that COVER Japan (Asia, Discover Global, etc.), not
// just rows whose own country_region/package_id literally contains the
// search text. country_coverage_index (built by the catalog sync job) has
// one row per (country, package) pair for exactly this purpose. Shared by
// both /admin/catalog and the public /catalog/browse endpoint.
async function resolveCoverageMatchIds(searchTerm) {
  const { data } = await supabase
    .from('country_coverage_index')
    .select('package_id')
    .ilike('country_name', `%${searchTerm}%`)
    .limit(500);
  return [...new Set((data || []).map((r) => r.package_id))];
}

// Looks up one package's live curation state for checkout — used by every
// endpoint that actually charges money (order/wallet-pay, order/corp-wallet-pay,
// order/create). Re-checks is_active server-side even though the storefront
// only ever shows active packages, since a raw API request could otherwise
// name any package_id directly. Returns null if the package doesn't exist or
// isn't currently active for sale — callers should treat that as 404.
async function getActivePlanForCheckout(packageId) {
  const { data: row, error } = await supabase
    .from('airalo_catalog')
    .select('package_id, country_region, scope, type, data_amount, validity_days, net_price_sgd, juzgo_selected_plans!inner(is_active, your_price)')
    .eq('package_id', packageId)
    .eq('juzgo_selected_plans.is_active', true)
    .maybeSingle();
  if (error || !row) return null;

  const selection = Array.isArray(row.juzgo_selected_plans) ? row.juzgo_selected_plans[0] : row.juzgo_selected_plans;
  if (!selection) return null;

  // Only single-country packages have one unambiguous ISO code — look it up
  // from country_coverage_index (which stores a 1:1 self-mapping for these).
  // Region/global packages cover many countries, so country_code stays null
  // for them, which is correct (there isn't one right answer).
  let countryCode = null;
  if (row.scope === 'country') {
    const { data: covRow } = await supabase
      .from('country_coverage_index')
      .select('country_code')
      .eq('package_id', packageId)
      .eq('scope', 'country')
      .maybeSingle();
    countryCode = covRow?.country_code || null;
  }

  const plan_name = `${row.data_amount || 'Data'} · ${row.validity_days || '?'} Days`;

  return {
    package_id: row.package_id,
    country_region: row.country_region,
    country_code: countryCode,
    scope: row.scope,
    type: row.type,
    data_amount: row.data_amount,
    validity_days: row.validity_days,
    plan_name,
    price_sgd: selection.your_price,
    net_price_sgd: row.net_price_sgd,
  };
}

// Session 24 — "Request a Plan" checkout path. Looks a package up directly in
// airalo_catalog with NO is_active requirement, since these packages are by
// definition not currently curated for sale (see POST /special-request/match).
// Price charged is minimum_selling_price_sgd — the catalog's own floor, same
// number Admin's "Airalo Min." column shows — not a separately-set your_price,
// since these packages were never given one via the Admin curation tab.
// Deliberately does NOT touch juzgo_selected_plans or is_active in any way:
// purchasing via this path never promotes a package into the normal
// storefront. See CONTEXT.md Session 24 for the reasoning.
async function getSpecialRequestPlanForCheckout(packageId) {
  const { data: row, error } = await supabase
    .from('airalo_catalog')
    .select('package_id, country_region, scope, type, data_amount, validity_days, net_price_sgd, minimum_selling_price_sgd')
    .eq('package_id', packageId)
    .eq('type', 'sim')
    .maybeSingle();
  if (error || !row) return null;

  let countryCode = null;
  if (row.scope === 'country') {
    const { data: covRow } = await supabase
      .from('country_coverage_index')
      .select('country_code')
      .eq('package_id', packageId)
      .eq('scope', 'country')
      .maybeSingle();
    countryCode = covRow?.country_code || null;
  }

  const plan_name = `${row.data_amount || 'Data'} · ${row.validity_days || '?'} Days`;

  return {
    package_id: row.package_id,
    country_region: row.country_region,
    country_code: countryCode,
    scope: row.scope,
    type: row.type,
    data_amount: row.data_amount,
    validity_days: row.validity_days,
    plan_name,
    price_sgd: row.minimum_selling_price_sgd,
    net_price_sgd: row.net_price_sgd,
  };
}

// Dispatcher used by every order-creation endpoint — picks the normal
// curated-catalog lookup or the Special Request lookup based on orderSource.
// Keeps the three checkout endpoints from each needing their own if/else.
async function resolvePlanForCheckout(packageId, orderSource) {
  return orderSource === 'special_request'
    ? getSpecialRequestPlanForCheckout(packageId)
    : getActivePlanForCheckout(packageId);
}

app.get('/admin/catalog', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('airalo_catalog')
      .select('*, juzgo_selected_plans(is_active, your_price, updated_by, updated_at)', { count: 'exact' })
      .order('country_region', { ascending: true })
      .order('package_id', { ascending: true })
      .range(from, to);

    if (req.query.scope) query = query.eq('scope', req.query.scope);
    if (req.query.type) query = query.eq('type', req.query.type);
    if (req.query.search) {
      const s = req.query.search.trim();
      const coveredIds = await resolveCoverageMatchIds(s);

      const orParts = [`country_region.ilike.%${s}%`, `package_id.ilike.%${s}%`];
      if (coveredIds.length > 0) {
        orParts.push(`package_id.in.(${coveredIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Supabase returns the embedded 1:1 relation as an array of 0 or 1 items
    // (PostgREST doesn't always collapse it even when the FK is also the PK) —
    // flatten it here so the frontend deals with a plain object or null.
    const rows = (data || []).map((row) => {
      const sel = Array.isArray(row.juzgo_selected_plans)
        ? row.juzgo_selected_plans[0] || null
        : row.juzgo_selected_plans || null;
      return { ...row, juzgo_selected_plans: undefined, selection: sel };
    });

    res.json({ rows, total: count || 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/catalog/:package_id — upsert David's curation choice (Sell? tick
// + Your Price) for one package. The database's your_price_floor trigger
// (see migrations/airalo-integration-migration.sql) is the actual enforcement
// — this just catches that trigger's raised exception and returns a clean
// 400 instead of a raw 500, so the Admin Portal can show a friendly error.
app.put('/admin/catalog/:package_id', requireAdmin, async (req, res) => {
  try {
    const { is_active, your_price } = req.body;
    if (typeof your_price !== 'number' || Number.isNaN(your_price)) {
      return res.status(400).json({ error: 'your_price must be a number' });
    }

    const { data, error } = await supabase
      .from('juzgo_selected_plans')
      .upsert(
        {
          package_id: req.params.package_id,
          is_active: !!is_active,
          your_price,
          updated_by: req.adminUser.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'package_id' }
      )
      .select()
      .single();

    if (error) {
      // Postgres trigger raises a plain EXCEPTION (SQLSTATE P0001) when
      // your_price is below minimum_selling_price_sgd — surface that as a
      // 400 with its own message rather than a generic 500.
      if (error.code === 'P0001' || /below the minimum selling price/i.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /catalog/browse — public storefront endpoint. Only returns packages
// David has actually curated (juzgo_selected_plans.is_active = true), and
// deliberately never selects any Airalo cost field (net_price, minimum
// selling price) — those stay admin-only. Same scope/search filtering as
// /admin/catalog, reusing resolveCoverageMatchIds for the same reverse
// country-name lookup. Reference: juzgo-airalo-catalog-admin-spec.md §6.2.
app.get('/catalog/browse', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('airalo_catalog')
      .select(
        'package_id, country_region, scope, type, data_amount, validity_days, rechargeable, activation_policy, is_fair_usage_policy, fair_usage_policy, coverages, juzgo_selected_plans!inner(your_price)',
        { count: 'exact' }
      )
      .eq('juzgo_selected_plans.is_active', true)
      // v1 scope is sim (new purchase) before topup — see DECISIONS.md. Topup
      // packages exist in the catalog for a future fast-follow but shouldn't
      // appear as separate browsable storefront items yet.
      .eq('type', 'sim')
      .order('country_region', { ascending: true })
      .range(from, to);

    if (req.query.scope) query = query.eq('scope', req.query.scope);
    if (req.query.search) {
      const s = req.query.search.trim();
      const coveredIds = await resolveCoverageMatchIds(s);
      const orParts = [`country_region.ilike.%${s}%`];
      if (coveredIds.length > 0) orParts.push(`package_id.in.(${coveredIds.join(',')})`);
      query = query.or(orParts.join(','));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data || []).map((row) => {
      const sel = Array.isArray(row.juzgo_selected_plans) ? row.juzgo_selected_plans[0] : row.juzgo_selected_plans;
      return {
        package_id: row.package_id,
        country_region: row.country_region,
        scope: row.scope,
        type: row.type,
        data_amount: row.data_amount,
        validity_days: row.validity_days,
        rechargeable: row.rechargeable,
        activation_policy: row.activation_policy,
        is_fair_usage_policy: row.is_fair_usage_policy,
        fair_usage_policy: row.fair_usage_policy,
        // Only the count is useful on the list view (card says "Covers N
        // countries"); the full list is lazy-loaded via /catalog/:id/countries
        // when someone actually opens the modal, to keep this payload light.
        coverage_count: Array.isArray(row.coverages) ? row.coverages.length : null,
        price_sgd: sel?.your_price ?? null,
      };
    });

    res.json({ rows, total: count || 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /catalog/:package_id/countries — lazy-loaded full country list for the
// "View List of Countries" modal (bundle product page §6.1, and the search
// result card's "Covers X and N more" click-through §6.2). Cached data only
// (airalo_catalog.coverages), no live Airalo call.
app.get('/catalog/:package_id/countries', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('airalo_catalog')
      .select('package_id, country_region, scope, coverages, juzgo_selected_plans!inner(is_active)')
      .eq('package_id', req.params.package_id)
      .eq('juzgo_selected_plans.is_active', true)
      .maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Package not found' });

    res.json({
      package_id: data.package_id,
      country_region: data.country_region,
      scope: data.scope,
      countries: data.coverages || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Session 24 — "Request a Plan" (Special Request channel).
//
// A second, parallel purchase path for when nothing in the curated /plans
// storefront fits. Searches ONLY airalo_catalog rows that are NOT currently
// active in juzgo_selected_plans — i.e. packages David has already reviewed
// via the sync but hasn't (yet) turned on for sale. Matching is a plain
// structured filter against real catalog values (data amount / duration /
// region), not free-text or an AI call — every option offered to the user is
// pulled live from the catalog, never hardcoded, which is what keeps this
// "AI-ish" without needing the claude-proxy worker in the loop for matching
// itself. Deliberately never touches juzgo_selected_plans/is_active —
// purchasing this way does not promote a package into the normal storefront.
// See CONTEXT.md Session 24 for full design discussion.
// -----------------------------------------------------------------------------

// Returns the set of package_ids currently active for normal sale, so the
// Special Request flow can exclude them from both options and matches.
async function getActivePackageIds() {
  const { data } = await supabase
    .from('juzgo_selected_plans')
    .select('package_id')
    .eq('is_active', true);
  return new Set((data || []).map((r) => r.package_id));
}

// GET /special-request/options — dynamic tick-box values, sourced live from
// airalo_catalog. Only considers sim-type packages not currently active.
app.get('/special-request/options', async (req, res) => {
  try {
    const activeIds = await getActivePackageIds();

    const { data, error } = await supabase
      .from('airalo_catalog')
      .select('package_id, data_amount, validity_days, country_region, scope')
      .eq('type', 'sim');
    if (error) throw error;

    const inactive = (data || []).filter((row) => !activeIds.has(row.package_id));

    const dataAmounts = [...new Set(inactive.map((r) => r.data_amount).filter(Boolean))];
    const durations = [...new Set(inactive.map((r) => r.validity_days).filter((d) => d != null))]
      .sort((a, b) => a - b);
    // "Country/Region" tick options: any country_region name that has AT
    // LEast one currently-inactive package. This deliberately includes
    // individual countries, not just named region/global bundles — a
    // country can already be active for one config (e.g. 5GB/7Days) while
    // still having other configs (e.g. 20GB/30Days) sitting inactive, and
    // that gap is exactly what this channel exists to surface. A country
    // appearing here does NOT mean nothing is offered for it; it means at
    // least one specific combination isn't currently for sale.
    const regions = [...new Set(inactive.map((r) => r.country_region))].sort();
    const regionScopes = {};
    inactive.forEach((r) => { regionScopes[r.country_region] = r.scope; });

    // Best-effort natural sort for data amounts like '1 GB', '10 GB', 'Unlimited'.
    dataAmounts.sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (Number.isNaN(numA)) return 1;
      if (Number.isNaN(numB)) return -1;
      return numA - numB;
    });

    res.json({ data_amounts: dataAmounts, durations, regions, region_scopes: regionScopes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /special-request/match — filters inactive sim packages against the
// user's ticked selections, returns up to 3 candidates, and always logs the
// request (matched or not) to special_request_log for admin follow-up.
app.post('/special-request/match', async (req, res) => {
  try {
    const { dataAmount, validityDays, countryRegion, customerEmail, userId } = req.body;
    const activeIds = await getActivePackageIds();

    let query = supabase
      .from('airalo_catalog')
      .select('package_id, country_region, scope, data_amount, validity_days, minimum_selling_price_sgd')
      .eq('type', 'sim');
    if (dataAmount) query = query.eq('data_amount', dataAmount);
    if (validityDays) query = query.eq('validity_days', validityDays);
    if (countryRegion) query = query.eq('country_region', countryRegion);

    const { data, error } = await query.limit(200);
    if (error) throw error;

    const candidates = (data || []).filter((row) => !activeIds.has(row.package_id));
    const results = candidates.slice(0, 3).map((row) => ({
      package_id: row.package_id,
      country_region: row.country_region,
      scope: row.scope,
      data_amount: row.data_amount,
      validity_days: row.validity_days,
      price_sgd: row.minimum_selling_price_sgd,
    }));

    const matched = results.length > 0;

    const { data: logRow, error: logErr } = await supabase
      .from('special_request_log')
      .insert({
        user_id: userId || null,
        customer_email: customerEmail || null,
        data_amount: dataAmount || null,
        validity_days: validityDays || null,
        country_region: countryRegion || null,
        matched,
        matched_package_ids: matched ? results.map((r) => r.package_id) : null,
      })
      .select()
      .single();
    if (logErr) console.error('special_request_log insert failed', logErr);

    res.json({
      matched,
      results,
      specialRequestLogId: logRow?.id || null,
      message: matched
        ? null
        : "I have tried my best to find a plan you requested but I have not. I will forward your request for inclusion in the future.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/special-requests — review log for the Admin "Special Requests"
// tab. Most recent first; unmatched requests are the demand signal for what
// to curate next.
app.get('/admin/special-requests', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('special_request_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/reseller/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const result = await resolvePromoCode(code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RESELLER PORTAL — their own stats (authenticated, anonymised)
// ═══════════════════════════════════════════════════════════════

// GET /reseller/my-stats — reseller's own dashboard data
app.get('/reseller/my-stats', requireReseller, async (req, res) => {
  try {
    const reseller = req.reseller;

    // Get all completed orders attributed to this reseller's code
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, user_id, guest_email, package_title, country_name, data_amount, validity_days, price_sgd, discount_sgd, created_at')
      .eq('reseller_code', reseller.code)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Build anonymised customer map — consistent first-name alias
    const userIds = [...new Set(orders.filter(o => o.user_id).map(o => o.user_id))];
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const nameMap = {};
    (profileData || []).forEach(p => {
      const firstName = (p.full_name || 'Customer').split(' ')[0];
      nameMap[p.id] = firstName;
    });

    const seenUsers = new Set();
    const enriched = orders.map(o => {
      const netPrice   = parseFloat(o.price_sgd || 0) - parseFloat(o.discount_sgd || 0);
      const commission = parseFloat((netPrice * reseller.commission_pct / 100).toFixed(2));
      const customerId = o.user_id || o.guest_email || 'guest';
      const isNew      = !seenUsers.has(customerId);
      seenUsers.add(customerId);

      return {
        customer_name:  o.user_id ? (nameMap[o.user_id] || 'Customer') : 'Guest',
        package_title:  o.package_title,
        country_name:   o.country_name,
        data_amount:    o.data_amount,
        validity_days:  o.validity_days,
        price_sgd:      parseFloat(o.price_sgd || 0).toFixed(2),
        commission_sgd: commission.toFixed(2),
        created_at:     o.created_at,
        is_new:         isNew,
      };
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const totalCommission = enriched.reduce((s, o) => s + parseFloat(o.commission_sgd), 0);
    const monthCommission = enriched
      .filter(o => new Date(o.created_at) >= startOfMonth)
      .reduce((s, o) => s + parseFloat(o.commission_sgd), 0);

    const activeCustomerIds = new Set(
      orders
        .filter(o => new Date(o.created_at) >= twelveMonthsAgo && o.user_id)
        .map(o => o.user_id)
    );

    res.json({
      reseller: {
        name:            reseller.name,
        code:            reseller.code,
        commission_pct:  reseller.commission_pct,
        share_url:       `https://juzgo.world?ref=${reseller.code}`,
      },
      stats: {
        total_commission_sgd:  totalCommission.toFixed(2),
        month_commission_sgd:  monthCommission.toFixed(2),
        total_orders:          enriched.length,
        active_customers:      activeCustomerIds.size,
      },
      orders: enriched,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REFERRAL — user USR- codes
// ═══════════════════════════════════════════════════════════════

// Middleware: verify any logged-in user
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No auth header' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.authUser = user;
  next();
}

// POST /referral/generate — generate a USR- code for users who don't have one
app.post('/referral/generate', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, full_name')
      .eq('id', userId)
      .single();

    if (profile?.referral_code) {
      return res.json({ referral_code: profile.referral_code });
    }

    const { data: seqData, error: seqError } = await supabase
      .rpc('nextval', { sequence_name: 'referral_code_seq' })
      .single();

    const seq = seqData
      ? String(seqData).padStart(5, '0')
      : String(Date.now()).slice(-5);

    const firstName = ((profile?.full_name || 'USER').split(' ')[0])
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);

    const referral_code = `USR-${firstName}-${seq}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ referral_code })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({ referral_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /referral/my-stats — logged-in user's referral summary
app.get('/referral/my-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('referral_code, referral_credit_earned, full_name')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    const referral_code = profile?.referral_code || null;

    if (!referral_code) {
      return res.json({
        referral_code: null,
        share_url: null,
        total_referrals: 0,
        credit_earned_sgd: '0.00',
        referred_users: [],
      });
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, user_id, created_at, price_sgd, country_name, package_title')
      .eq('referral_code', referral_code)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    const { data: referredProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, created_at')
      .eq('referred_by', referral_code);

    const referred_users = (referredProfiles || []).map(p => ({
      name: (p.full_name || 'User').split(' ')[0],
      joined_at: p.created_at,
    }));

    res.json({
      referral_code,
      share_url: `https://juzgo.world?ref=${referral_code}`,
      total_referrals: referred_users.length,
      credit_earned_sgd: parseFloat(profile.referral_credit_earned || 0).toFixed(2),
      referred_users,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUTH: does this email already have an account? (for Alfred signup flow) ──
// v1 RISK (logged for tightening before public launch): this is an
// unauthenticated existence check -> enables email enumeration by a stranger.
// Acceptable for personal v1 (not yet onboarding the public). Tighten later:
// rate-limit per IP, or gate behind a short-lived signup-intent token.
app.post('/auth/email-exists', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email required' });
    const { data: authData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const exists = (authData?.users || []).some(u => (u.email || '').toLowerCase() === email);
    res.json({ exists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ITINERARIES (read-only, for Alfred) ──────────────────────────────

// GET /itineraries — list the authenticated user's saved trips
app.get('/itineraries', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const { data, error } = await supabase
      .from('saved_itineraries')
      .select('id, destination, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ itineraries: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /itineraries/:id — full detail of one trip (owner only)
app.get('/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const { id } = req.params;
    const { data, error } = await supabase
      .from('saved_itineraries')
      .select('id, destination, status, trip_data, selected_places, trip_inputs, suggested_plan_id, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)   // ownership enforced in code — service role bypasses RLS
      .single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Itinerary not found' });
      throw error;
    }
    res.json({ itinerary: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Alfred memory layer — Increment 1 (text only).
// Working-memory + recall store. Same house pattern as /itineraries:
// requireAuth -> req.authUser.id -> supabase (service role) scoped .eq('user_id').
// Ownership enforced IN CODE because the service-role key bypasses RLS.
// ============================================================================

// POST /memory — save a memory item (recall note, reminder, appointment draft, etc.)
// body: { title (required), body?, tags?: string[], kind?, remind_at?, expires_at? }
app.post('/memory', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const { title, body, tags, kind, remind_at, expires_at, report_date, panel } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const ALLOWED_KINDS = ['recall', 'reminder', 'activity', 'document', 'appointment', 'health_report', 'hold', 'vital', 'diet'];
    const safeKind = ALLOWED_KINDS.includes(kind) ? kind : 'recall';
    const safeTags = Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 25) : [];
    // Auto-tag the SAVE date (Singapore calendar day) so items can be found or
    // deleted by when they were saved, independent of the dates they describe.
    const savedTag = 'saved-' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (!safeTags.includes(savedTag)) safeTags.push(savedTag);
    // Health-report fields (nullable; only meaningful for kind='health_report').
    // report_date: clinical date on the report, stored as YYYY-MM-DD. Accept a
    // plain date string; reject anything not matching to avoid junk in the column.
    const safeReportDate = (typeof report_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(report_date.trim())) ? report_date.trim() : null;
    const safePanel = (typeof panel === 'string' && panel.trim()) ? panel.trim().slice(0, 200) : null;

    const { data, error } = await supabase
      .from('memory_items')
      .insert({
        user_id: userId,
        title: title.trim(),
        body: (typeof body === 'string' && body.trim()) ? body.trim() : null,
        tags: safeTags,
        kind: safeKind,
        remind_at: remind_at || null,
        expires_at: expires_at || null,
        report_date: safeReportDate,
        panel: safePanel,
      })
      .select('id, kind, title, body, tags, status, remind_at, expires_at, report_date, panel, created_at, updated_at')
      .single();
    if (error) throw error;
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /memory — list the user's active items (recent first).
// Optional ?q=term -> keyword search across title + body (case-insensitive substring).
// Optional ?kind=reminder -> filter by kind. Only status='active' unless ?all=1.
app.get('/memory', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const { q, kind, all } = req.query;
    // Page size: default 100 (unchanged); clients that need the full history
    // (vitals trend review, the memory panel) pass ?limit= up to 1000.
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));

    let query = supabase
      .from('memory_items')
      .select('id, kind, title, body, tags, status, remind_at, expires_at, report_date, panel, created_at, updated_at')
      .eq('user_id', userId);

    if (!all) query = query.eq('status', 'active');
    if (kind) query = query.eq('kind', kind);

    // Lazy self-expiry: hide items whose expires_at has passed. Rows with a
    // null expires_at (the vast majority) are unaffected. Held items ('hold')
    // carry a 24h expires_at and simply stop appearing once it lapses; no sweep.
    if (!all) query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      // Single-word queries also match the tags array (exact element match;
      // tags are stored lower-case). Multi-word queries stay title/body only.
      const word = q.trim().toLowerCase();
      const tagClause = /^[a-z0-9_-]+$/.test(word) ? `,tags.cs.{${word}}` : '';
      query = query.or(`title.ilike.${term},body.ilike.${term}${tagClause}`);
    }

    // Health-report history reads newest-first by CLINICAL date (report_date),
    // not upload time — a back-dated report must still slot in correctly.
    // Everything else keeps the original created_at ordering.
    if (kind === 'health_report') {
      query = query.order('report_date', { ascending: false, nullsFirst: false }).limit(limit);
    } else {
      query = query.order('created_at', { ascending: false }).limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /memory/:id — release/remove an item (owner only).
app.delete('/memory/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const { id } = req.params;
    const { error } = await supabase
      .from('memory_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /referral/credit — awards SGD 2.00 wallet credit to referrer on first purchase
async function processReferralCredit(referralCode, buyerUserId) {
  if (!referralCode || !referralCode.startsWith('USR-')) return;

  try {
    const { data: referrer, error: refError } = await supabase
      .from('profiles')
      .select('id, wallet_balance, referral_credit_earned')
      .eq('referral_code', referralCode)
      .single();

    if (refError || !referrer) {
      console.warn('Referral credit: referrer not found for code', referralCode);
      return;
    }

    if (referrer.id === buyerUserId) return;

    const { data: priorOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', buyerUserId)
      .eq('referral_code', referralCode)
      .eq('status', 'completed');

    if (priorOrders && priorOrders.length > 1) {
      console.log('Referral credit: not first purchase, skipping');
      return;
    }

    const REFERRAL_CREDIT_SGD = 2.00;
    const newBalance = parseFloat(((referrer.wallet_balance || 0) + REFERRAL_CREDIT_SGD).toFixed(2));
    const newCreditEarned = parseFloat(((referrer.referral_credit_earned || 0) + REFERRAL_CREDIT_SGD).toFixed(2));

    await supabase
      .from('profiles')
      .update({
        wallet_balance: newBalance,
        referral_credit_earned: newCreditEarned,
      })
      .eq('id', referrer.id);

    await supabase
      .from('profiles')
      .update({ referred_by: referralCode })
      .eq('id', buyerUserId)
      .is('referred_by', null);

    await sendPushToUser(referrer.id, {
      title: '🎉 Referral Reward!',
      body: `SGD ${REFERRAL_CREDIT_SGD.toFixed(2)} added to your wallet — someone used your referral code!`,
      url: '/dashboard',
    });

    console.log(`Referral credit: SGD ${REFERRAL_CREDIT_SGD} credited to ${referrer.id} for code ${referralCode}`);
  } catch (err) {
    console.error('processReferralCredit error:', err.message);
  }
}

// POST /order/complete — trigger referral credit processing after order
app.post('/order/complete', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.authUser.id;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

    const { data: order, error } = await supabase
      .from('orders')
      .select('referral_code, status, user_id')
      .eq('id', orderId)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'completed') return res.json({ ok: true, credited: false });

    await processReferralCredit(order.referral_code, userId);

    res.json({ ok: true, credited: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/referral-stats — all users with USR- codes + credit earned
app.get('/admin/referral-stats', requireAdmin, async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, referral_code, referral_credit_earned')
      .not('referral_code', 'is', null)
      .order('referral_credit_earned', { ascending: false });

    if (error) throw error;

    const codes = profiles.map(p => p.referral_code);
    const { data: referred } = await supabase
      .from('profiles')
      .select('referred_by')
      .in('referred_by', codes.length ? codes : ['__none__']);

    const countMap = {};
    (referred || []).forEach(r => {
      countMap[r.referred_by] = (countMap[r.referred_by] || 0) + 1;
    });

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = {};
    (authUsers?.users || []).forEach(u => { emailMap[u.id] = u.email; });

    const result = profiles.map(p => ({
      referral_code:          p.referral_code,
      full_name:              p.full_name,
      email:                  emailMap[p.id] || '—',
      referred_count:         countMap[p.referral_code] || 0,
      referral_credit_earned: p.referral_credit_earned || 0,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// CORPORATE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// Free email domain block list
const FREE_EMAIL_DOMAINS = [
  'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com',
  'msn.com','yahoo.com','yahoo.co.uk','yahoo.com.sg','ymail.com',
  'icloud.com','me.com','mac.com','protonmail.com','proton.me',
  'aol.com','aim.com','zoho.com','mail.com','email.com',
  'tutanota.com','tuta.io','gmx.com','gmx.net','fastmail.com','hey.com',
];

function isWorkEmail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return domain && !FREE_EMAIL_DOMAINS.includes(domain);
}

// ── EMAIL via Resend ─────────────────────────────────────────────────────────
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, text, html }) {
  if (!process.env.RESEND_API_KEY) {
    // Fallback: log only (dev / missing key)
    console.log(`[EMAIL-NOOP] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: 'Juzgo <hello@juzgo.world>',
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    if (error) {
      console.error(`[EMAIL] Resend error to ${to}:`, error);
    } else {
      console.log(`[EMAIL] Sent to ${to} — id: ${data?.id}`);
    }
  } catch (err) {
    console.error(`[EMAIL] Unexpected error sending to ${to}:`, err.message);
  }
}

// POST /corporate/register — create corporates row + upgrade founding user
app.post('/corporate/register', async (req, res) => {
  const { company_name, company_country, uen, contact_email, user_id, full_name } = req.body;

  if (!company_name || !contact_email || !user_id || !company_country) {
    return res.status(400).json({ error: 'company_name, company_country, contact_email and user_id are required' });
  }

  // Block free email domains
  if (!isWorkEmail(contact_email)) {
    return res.status(400).json({ error: 'Please use a work email address. Free email providers (Gmail, Outlook etc.) are not accepted.' });
  }

  try {
    // Block duplicate contact_email
    const { data: existingCorp } = await supabase
      .from('corporates')
      .select('id')
      .eq('contact_email', contact_email.toLowerCase())
      .maybeSingle();
    if (existingCorp) {
      return res.status(409).json({ error: 'A corporate account with this contact email already exists.' });
    }

    // Block user already linked to a corp
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('is_corporate')
      .eq('id', user_id)
      .maybeSingle();
    if (existingProfile?.is_corporate) {
      return res.status(409).json({ error: 'This account is already linked to a corporate account.' });
    }

    // Create corporates row — pending approval, inactive by default
    const { data: corp, error: corpErr } = await supabase
      .from('corporates')
      .insert({
        company_name,
        company_country,
        uen: uen || null,
        contact_email: contact_email.toLowerCase(),
        email_domain: contact_email.toLowerCase().split('@')[1],
        is_active: false,
        approval_status: 'pending',
      })
      .select()
      .single();
    if (corpErr) throw corpErr;

    // Upgrade profile to corp admin.
    // The profiles row is created by an on-signup DB trigger, which can lag
    // slightly behind auth.signUp() returning. A plain .update().eq('id', ...)
    // does NOT error when zero rows match — it just silently no-ops, which is
    // why is_corporate/corp_id/corp_role weren't always getting set. Retry
    // briefly and confirm a row was actually updated before continuing.
    let profileUpdated = false;
    for (let attempt = 0; attempt < 5 && !profileUpdated; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
      const { data: updatedRows, error: profErr } = await supabase
        .from('profiles')
        .update({
          is_corporate: true,
          corp_id:      corp.id,
          corp_role:    'admin',
          full_name:    full_name || undefined,
        })
        .eq('id', user_id)
        .select('id');
      if (profErr) throw profErr;
      if (updatedRows && updatedRows.length > 0) profileUpdated = true;
    }
    if (!profileUpdated) {
      // Roll back the corp row so we don't leave an orphaned pending
      // corporate account with no linked admin.
      await supabase.from('corporates').delete().eq('id', corp.id);
      return res.status(500).json({
        error: 'Could not finish setting up your corporate account. Please try again in a moment.',
      });
    }

    // Email admin for review
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `[Juzgo] New Corporate Account Pending Approval — ${company_name}`,
      text: [
        `A new corporate account is awaiting your approval.`,
        ``,
        `Company:       ${company_name}`,
        `Country:       ${company_country}`,
        `UEN:           ${uen || 'N/A'}`,
        `Contact Email: ${contact_email}`,
        `Admin Name:    ${full_name}`,
        ``,
        `Please review and approve within 48 hours:`,
        `https://juzgo.world/admin`,
      ].join('\n'),
    });

    // Email applicant with 48hr expectation
    await sendEmail({
      to: contact_email,
      subject: `Your Juzgo Corporate Account is Under Review — ${company_name}`,
      text: [
        `Hi ${full_name || 'there'},`,
        ``,
        `Thank you for registering ${company_name} on Juzgo.`,
        ``,
        `Your corporate account is currently under review. We aim to approve`,
        `all applications within 48 hours.`,
        ``,
        `You will receive a separate email once your account is approved and`,
        `ready to use.`,
        ``,
        `If you have any questions, reply to this email or contact us at`,
        `hello@juzgo.world.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[CORP] New pending corporate: ${company_name} (${company_country}) — admin: ${user_id}`);

    return res.json({ success: true, corp_id: corp.id, company_name: corp.company_name });
  } catch (err) {
    console.error('POST /corporate/register', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /corporate/staff/create — admin creates a staff account directly.
// Supersedes the old invite/accept flow (kept below, unused, for reference
// only). Domain-locked: staff can only be created on the company's own
// verified email domain, so a colleague can never ride the corp wallet on
// a personal email address. No self-registration, no invite token — the
// admin's action of creating the account IS the approval.
app.post('/corporate/staff/create', async (req, res) => {
  const { corp_id, full_name, email, created_by_user_id } = req.body;
  if (!corp_id || !full_name || !email || !created_by_user_id) {
    return res.status(400).json({ error: 'corp_id, full_name, email and created_by_user_id are required' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Confirm requester is an approved admin of this corp
    const { data: requester, error: reqErr } = await supabase
      .from('profiles')
      .select('corp_id, corp_role')
      .eq('id', created_by_user_id)
      .single();
    if (reqErr || !requester) return res.status(403).json({ error: 'Profile not found' });
    if (requester.corp_id !== corp_id || requester.corp_role !== 'admin') {
      return res.status(403).json({ error: 'Only corp admins can create staff accounts' });
    }

    // Domain lock — the actual enforcement point
    const { data: corp, error: corpErr } = await supabase
      .from('corporates')
      .select('company_name, email_domain, is_active')
      .eq('id', corp_id)
      .single();
    if (corpErr || !corp) return res.status(404).json({ error: 'Corporate account not found' });

    const emailDomain = cleanEmail.split('@')[1];
    if (!corp.email_domain || emailDomain !== corp.email_domain) {
      return res.status(400).json({
        error: `Staff accounts must use a ${corp.email_domain || 'company'} email address.`,
      });
    }

    // Generate a secure random temporary password
    const tempPassword = require('crypto').randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'A1!';

    // Create the auth user directly (admin API — service role key required,
    // already configured for this backend). Email pre-confirmed since the
    // admin already vouches for this person.
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) {
      const msg = /already registered|already exists/i.test(createErr.message || '')
        ? 'An account with this email already exists.'
        : createErr.message;
      return res.status(400).json({ error: msg });
    }

    const newUserId = created?.user?.id;
    if (!newUserId) throw new Error('Account creation did not return a user id.');

    // Upgrade the profile — same retry-and-verify pattern as corp
    // registration (Session 18 fix), since the on-signup trigger that
    // creates the profiles row can lag slightly behind this call returning.
    let profileUpdated = false;
    for (let attempt = 0; attempt < 5 && !profileUpdated; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
      const { data: updatedRows, error: profErr } = await supabase
        .from('profiles')
        .update({
          is_corporate: true,
          corp_id,
          corp_role: 'staff',
          full_name,
          must_change_password: true,
        })
        .eq('id', newUserId)
        .select('id');
      if (profErr) throw profErr;
      if (updatedRows && updatedRows.length > 0) profileUpdated = true;
    }
    if (!profileUpdated) {
      // Roll back the orphaned auth user so we don't leave a login-capable
      // account with no corp link and no way to complete setup.
      await supabase.auth.admin.deleteUser(newUserId);
      return res.status(500).json({
        error: 'Could not finish setting up the staff account. Please try again.',
      });
    }

    // Email credentials to the new staff member
    await sendEmail({
      to: cleanEmail,
      subject: `Your Juzgo Corporate account — ${corp.company_name}`,
      text: [
        `Hi ${full_name},`,
        ``,
        `An account has been created for you on Juzgo, linked to ${corp.company_name}'s corporate account.`,
        ``,
        `Login email:    ${cleanEmail}`,
        `Temporary password: ${tempPassword}`,
        ``,
        `Log in at https://juzgo.world/login — you'll be asked to set a new`,
        `password on first login.`,
        ``,
        `If you have any questions, contact us at hello@juzgo.world.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[CORP] Staff account created: ${cleanEmail} — corp: ${corp_id}`);

    return res.json({ success: true, user_id: newUserId, email: cleanEmail });
  } catch (err) {
    console.error('POST /corporate/staff/create', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DEPRECATED — old token-based invite/accept flow. Superseded by
// POST /corporate/staff/create above (Session 20). Left in place, unused,
// as reference only — not called by the frontend anymore.
// ─────────────────────────────────────────────────────────────────────────

app.post('/corporate/invite', async (req, res) => {
  const { corp_id, email, invited_by_user_id } = req.body;
  if (!corp_id || !email) {
    return res.status(400).json({ error: 'corp_id and email are required' });
  }
  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('corp_id, corp_role')
      .eq('id', invited_by_user_id)
      .single();
    if (pErr || !profile) return res.status(403).json({ error: 'Profile not found' });
    if (profile.corp_id !== corp_id || profile.corp_role !== 'admin') {
      return res.status(403).json({ error: 'Only corp admins can invite staff' });
    }

    const { data: existing } = await supabase
      .from('corp_invites')
      .select('id, accepted')
      .eq('corp_id', corp_id)
      .eq('email', email)
      .maybeSingle();
    if (existing && !existing.accepted) {
      return res.status(409).json({ error: 'Invite already pending for this email' });
    }
    if (existing && existing.accepted) {
      return res.status(409).json({ error: 'This email is already a member' });
    }

    const token = require('crypto').randomBytes(24).toString('hex');

    const { error: invErr } = await supabase
      .from('corp_invites')
      .insert({ corp_id, email, token, accepted: false });
    if (invErr) throw invErr;

    const { data: corp } = await supabase
      .from('corporates')
      .select('company_name')
      .eq('id', corp_id)
      .single();

    const inviteUrl = `https://juzgo.world/corporate/invite/${token}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to join ${corp?.company_name} on Juzgo`,
      text: [
        `Hi there,`,
        ``,
        `You've been invited to join ${corp?.company_name}'s corporate account on Juzgo.`,
        ``,
        `Click the link below to accept your invitation and create your account:`,
        `${inviteUrl}`,
        ``,
        `This invite link is single-use. If you did not expect this email, you can safely ignore it.`,
        ``,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[CORP INVITE] Invite email sent to: ${email} | Company: ${corp?.company_name}`);
    return res.json({ success: true, invite_url: inviteUrl });
  } catch (err) {
    console.error('POST /corporate/invite', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /corporate/invite/:token — returns invite metadata for the accept page
app.get('/corporate/invite/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const { data: invite, error } = await supabase
      .from('corp_invites')
      .select('id, corp_id, email, accepted, corporates(company_name)')
      .eq('token', token)
      .single();
    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.accepted) return res.status(410).json({ error: 'Invite already used' });
    return res.json({
      email: invite.email,
      corp_id: invite.corp_id,
      company_name: invite.corporates?.company_name || '',
      token,
    });
  } catch (err) {
    console.error('GET /corporate/invite/:token', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /corporate/invite/accept — marks invite accepted + upgrades staff profile
app.post('/corporate/invite/accept', async (req, res) => {
  const { token, user_id } = req.body;
  if (!token || !user_id) return res.status(400).json({ error: 'token and user_id required' });
  try {
    const { data: invite, error: iErr } = await supabase
      .from('corp_invites')
      .select('id, corp_id, email, accepted')
      .eq('token', token)
      .single();
    if (iErr || !invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.accepted) return res.status(410).json({ error: 'Invite already used' });

    await supabase
      .from('corp_invites')
      .update({ accepted: true })
      .eq('id', invite.id);

    const { error: profErr } = await supabase
      .from('profiles')
      .update({ is_corporate: true, corp_id: invite.corp_id, corp_role: 'staff' })
      .eq('id', user_id);
    if (profErr) throw profErr;

    return res.json({ success: true, corp_id: invite.corp_id });
  } catch (err) {
    console.error('POST /corporate/invite/accept', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /corporate/dashboard — full dashboard data for corp admin
app.get('/corporate/dashboard', async (req, res) => {
  const { corp_id, user_id } = req.query;
  if (!corp_id || !user_id) return res.status(400).json({ error: 'corp_id and user_id required' });
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('corp_id, corp_role')
      .eq('id', user_id)
      .single();
    if (!profile || profile.corp_id !== corp_id || profile.corp_role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: corp } = await supabase
      .from('corporates')
      .select('*')
      .eq('id', corp_id)
      .single();

    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name, phone, wallet_balance, corp_role, created_at')
      .eq('corp_id', corp_id)
      .order('created_at', { ascending: true });

    const { data: pendingInvites } = await supabase
      .from('corp_invites')
      .select('id, email, created_at')
      .eq('corp_id', corp_id)
      .eq('accepted', false)
      .order('created_at', { ascending: false });

    const staffIds = (staff || []).map(s => s.id);
    let orders = [];
    if (staffIds.length > 0) {
      const { data: ord } = await supabase
        .from('orders')
        .select('id, order_code, customer_name, customer_email, package_title, country_name, price_sgd, status, payment_method, created_at, user_id')
        .in('user_id', staffIds)
        .order('created_at', { ascending: false })
        .limit(200);
      orders = ord || [];
    }

    const totalSpend = orders
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + parseFloat(o.price_sgd || 0), 0);

    return res.json({
      corp,
      staff: staff || [],
      pending_invites: pendingInvites || [],
      orders,
      total_spend: totalSpend.toFixed(2),
    });
  } catch (err) {
    console.error('GET /corporate/dashboard', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /corporate/wallet/topup — Stripe PaymentIntent for corporate wallet
app.post('/corporate/wallet/topup', async (req, res) => {
  const { corp_id, amount_sgd, user_id } = req.body;
  if (!corp_id || !amount_sgd || !user_id) {
    return res.status(400).json({ error: 'corp_id, amount_sgd and user_id required' });
  }
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('corp_id, corp_role')
      .eq('id', user_id)
      .single();
    if (!profile || profile.corp_id !== corp_id || profile.corp_role !== 'admin') {
      return res.status(403).json({ error: 'Only corp admins can top up the corporate wallet' });
    }

    const amountCents = Math.round(parseFloat(amount_sgd) * 100);
    if (amountCents < 500) return res.status(400).json({ error: 'Minimum top-up is SGD 5.00' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'sgd',
      metadata: { type: 'corp_wallet_topup', corp_id, user_id },
    });

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('POST /corporate/wallet/topup', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/corporates — list all corporate accounts (admin only)
app.get('/admin/corporates', requireAdmin, async (req, res) => {
  try {
    const { data: corps, error } = await supabase
      .from('corporates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const enriched = await Promise.all(
      (corps || []).map(async (c) => {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('corp_id', c.id)
          .eq('is_corporate', true);
        return { ...c, staff_count: count || 0 };
      })
    );

    return res.json(enriched);
  } catch (err) {
    console.error('GET /admin/corporates', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /admin/corporates/:id — toggle is_active or edit details
app.patch('/admin/corporates/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const allowed = ['company_name', 'uen', 'contact_email', 'is_active'];
    const clean = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)));
    const { error } = await supabase.from('corporates').update(clean).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('PATCH /admin/corporates/:id', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── SAVED PAYMENT METHODS (Session 27) ───────────────────────────────────────
// Platform-level card storage (Stripe SetupIntent + saved PaymentMethod).
// VOIP is its first consumer — card-locked rental billing needs a card on
// file — but nothing in this router is VOIP-specific.
const createPaymentMethodsRouter = require('./routes/payment-methods');
app.use('/payment-methods', createPaymentMethodsRouter({ supabase, requireAuth, stripe }));

// ── VOIP (Session 27 — card-locked billing + Twilio suspend mechanism) ───────
// sendPushToUser and sendEmail are module-local functions, not exports, so
// they're injected here for the dunning cascade. Mutating Twilio calls stay
// gated behind VOIP_TWILIO_LIVE until deliberately enabled.
const createVoipRouter = require('./routes/voip');
app.use('/voip', createVoipRouter({ supabase, requireAuth, stripe, sendPushToUser, sendEmail }));

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`juzgo backend running on port ${PORT}`);
});

// POST /admin/corporates/:id/approve — approve a pending corporate account
app.post('/admin/corporates/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: corp, error } = await supabase
      .from('corporates')
      .update({ is_active: true, approval_status: 'approved' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Email the company contact
    await sendEmail({
      to: corp.contact_email,
      subject: `Your Juzgo Corporate Account is Approved — ${corp.company_name}`,
      text: [
        `Hi there,`,
        ``,
        `Great news! ${corp.company_name}'s Juzgo corporate account`,
        `has been approved and is now active.`,
        ``,
        `You can now:`,
        `  - Log in and access your corporate dashboard`,
        `  - Top up your corporate wallet`,
        `  - Invite staff members`,
        `  - Start placing eSIM orders`,
        ``,
        `Log in here: https://juzgo.world/login`,
        ``,
        `Welcome aboard,`,
        `The Juzgo Team`,
      ].join('\n'),
    });

    console.log(`[CORP] Approved: ${corp.company_name} (${id})`);
    return res.json({ success: true, corp });
  } catch (err) {
    console.error('POST /admin/corporates/:id/approve', err);
    return res.status(500).json({ error: err.message });
  }
});
