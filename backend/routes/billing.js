const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');

/**
 * Create a Checkout Session for a new subscription
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
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: trialDays,
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard`,
      metadata: {
        userId: user._id.toString(),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout Session Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * Stripe Webhook Handler
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
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = await stripe.subscriptions.retrieve(session.subscription || session.id);
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
        // Fallback: look up by customerId
        await User.findOneAndUpdate({ 'subscription.customerId': customerId }, updateData);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = session;
      await User.findOneAndUpdate(
        { 'subscription.subscriptionId': subscription.id },
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
