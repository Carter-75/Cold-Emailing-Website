const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');

// ---------- Data Service Pricing (in cents) — ONE-TIME, NON-REFUNDABLE ----------
const DATA_PRICES = {
  'data': {
    price: parseInt(process.env.PRICE_DATA || '14900'),              // $149 one-time
    name: 'Data Intelligence',
    description: 'AI-enriched public records with full contact info, budgets, and AI summaries. One-time purchase, non-refundable. Buy again anytime.'
  }
};

/**
 * Create a Checkout Session for outreach engine subscription (existing — Carter's internal tool)
 */
router.post('/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const trialDays = parseInt(process.env.STRIPE_TRIAL_DAYS || '3');
    const priceId = process.env.STRIPE_PRICE_ID;

    if (!priceId) {
      return res.status(400).json({ message: 'Stripe Price ID not configured in system environment.' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: { trial_period_days: trialDays },
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard`,
      metadata: { userId: user._id.toString() },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout Session Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/billing/data-pricing
 * Return data service pricing to frontend (used by Cold Email dashboard)
 */
router.get('/data-pricing', (req, res) => {
  const testMode = process.env.TEST_MODE === 'true';
  const pricing = {};
  for (const [key, config] of Object.entries(DATA_PRICES)) {
    const p = testMode ? 100 : config.price;
    pricing[key] = {
      ...config,
      price: p,
      priceDisplay: `$${(p / 100).toFixed(0)}`,
      paymentType: 'one-time'
    };
  }
  res.json(pricing);
});

/**
 * Stripe Webhook Handler (Cold Email internal — handles outreach subscription events)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`[Stripe Webhook] Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      // Standard outreach subscription handling (Carter's internal tool)
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const customerId = subscription.customer;
        const status = subscription.status;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        const userId = session.metadata?.userId;

        const updateData = {
          'subscription.customerId': customerId,
          'subscription.status': status,
          'subscription.subscriptionId': subscription.id,
          'subscription.priceId': subscription.items.data[0].price.id,
          'subscription.currentPeriodEnd': currentPeriodEnd,
        };

        if (userId) {
          await User.findByIdAndUpdate(userId, updateData);
        } else {
          await User.findOneAndUpdate({ 'subscription.customerId': customerId }, updateData);
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = await stripe.subscriptions.retrieve(session.id);
      await User.findOneAndUpdate(
        { 'subscription.subscriptionId': subscription.id },
        {
          'subscription.status': subscription.status,
          'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
        }
      );
      break;
    }

    case 'customer.subscription.deleted': {
      await User.findOneAndUpdate(
        { 'subscription.subscriptionId': session.id },
        { 
          'subscription.status': 'canceled',
          'subscription.currentPeriodEnd': new Date()
        }
      );
      break;
    }
  }

  res.json({ received: true });
});

module.exports = router;
