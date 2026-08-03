import { Router, Request, Response } from 'express';
import { subscriptionService } from '../../services/SubscriptionService';
import { getPaystackService } from '../../services/PaystackSubscriptionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';

const router = Router();

// Get available subscription plans (public endpoint)
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { monthly_price: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Get current subscription (requires auth)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const subscription = await subscriptionService.getStoreSubscription(user.storeId);

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const isActive = await subscriptionService.isStoreActive(user.storeId);

    res.status(200).json({
      success: true,
      data: {
        ...subscription,
        is_active: isActive,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Start free 14-day trial
router.post('/start-trial', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const storeId = user.storeId;

    // Check if subscription already exists
    const existing = await subscriptionService.getStoreSubscription(storeId);
    if (existing) {
      return res.status(400).json({
        error: 'Store already has an active subscription. Cancel it first to start a trial.',
      });
    }

    const subscription = await subscriptionService.createTrialSubscription(storeId);

    res.status(201).json({
      success: true,
      message: 'Trial subscription started. You have 14 days to use the platform.',
      data: subscription,
    });
  } catch (error) {
    console.error('Error starting trial:', error);
    res.status(500).json({ error: 'Failed to start trial subscription' });
  }
});

// Initialize onboarding payment (₦50,000 for 2 months)
router.post('/onboarding', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { planSlug } = req.body;

    if (!planSlug || !['business', 'pro'].includes(planSlug)) {
      return res.status(400).json({ error: 'Invalid plan. Must be "business" or "pro".' });
    }

    const paystackService = getPaystackService();
    const storeData = await prisma.store.findUnique({ where: { id: user.storeId } });

    if (!storeData) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Initialize Paystack payment for ₦50,000 onboarding fee
    const paymentInit = await paystackService.initializeTransaction(
      50000, // ₦50,000
      user.email,
      {
        store_id: user.storeId,
        store_name: storeData.name,
        plan: planSlug,
        type: 'onboarding_fee',
      }
    );

    res.status(200).json({
      success: true,
      message: 'Onboarding payment initialized. Redirect user to authorization URL.',
      data: {
        authorization_url: paymentInit.authorization_url,
        access_code: paymentInit.access_code,
        reference: paymentInit.reference,
        amount: 50000,
        plan: planSlug,
      },
    });
  } catch (error) {
    console.error('Error initializing onboarding payment:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Verify onboarding payment and activate subscription
router.post('/onboarding/verify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { reference, planSlug } = req.body;

    if (!reference || !planSlug) {
      return res.status(400).json({ error: 'Missing reference or planSlug' });
    }

    const paystackService = getPaystackService();

    // Verify Paystack payment
    const verification = await paystackService.verifyTransaction(reference);

    if (verification.status !== 'success') {
      return res.status(400).json({
        error: 'Payment verification failed',
        status: verification.status,
      });
    }

    // Create subscription after successful payment
    const subscription = await subscriptionService.createSubscriptionAfterOnboarding(
      user.storeId,
      planSlug as 'business' | 'pro'
    );

    // Store Paystack customer and authorization code
    await subscriptionService.updatePaystackCustomerId(subscription.id, verification.customer_code);
    await subscriptionService.updatePaystackAuthorizationCode(
      subscription.id,
      verification.authorization_code
    );

    // Update store as active
    await prisma.store.update({
      where: { id: user.storeId },
      data: { is_active: true },
    });

    res.status(201).json({
      success: true,
      message: 'Onboarding payment successful! Your subscription is now active.',
      data: subscription,
    });
  } catch (error) {
    console.error('Error verifying onboarding payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Upgrade or downgrade plan
router.post('/upgrade', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { newPlanSlug } = req.body;

    if (!newPlanSlug || !['business', 'pro'].includes(newPlanSlug)) {
      return res.status(400).json({ error: 'Invalid plan. Must be "business" or "pro".' });
    }

    const subscription = await subscriptionService.getStoreSubscription(user.storeId);

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const updated = await subscriptionService.changePlan(subscription.id, newPlanSlug as 'business' | 'pro');

    res.status(200).json({
      success: true,
      message: 'Plan updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error upgrading plan:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// Get subscription invoices
router.get('/invoices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const subscription = await subscriptionService.getStoreSubscription(user.storeId);

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const invoices = await subscriptionService.getSubscriptionInvoices(subscription.id);

    res.status(200).json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Cancel subscription
router.post('/:id/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const subscription = await subscriptionService.getStoreSubscription(user.storeId);

    if (!subscription || subscription.id !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const cancelled = await subscriptionService.cancelSubscription(id);

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled',
      data: cancelled,
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Update payment method
router.patch('/:id/payment-method', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const subscription = await subscriptionService.getStoreSubscription(user.storeId);

    if (!subscription || subscription.id !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Initialize new payment verification
    const paystackService = getPaystackService();
    const storeData = await prisma.store.findUnique({ where: { id: user.storeId } });

    const amount = Number(subscription.plan.monthly_price);

    const paymentInit = await paystackService.initializeTransaction(
      amount,
      user.email,
      {
        store_id: user.storeId,
        subscription_id: subscription.id,
        type: 'payment_method_update',
      }
    );

    res.status(200).json({
      success: true,
      message: 'Payment method update initialized',
      data: {
        authorization_url: paymentInit.authorization_url,
        access_code: paymentInit.access_code,
        reference: paymentInit.reference,
      },
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

export default router;
