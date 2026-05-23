import { Router, Request, Response } from 'express';
import { getPaystackService } from '../../services/PaystackSubscriptionService';
import { subscriptionService } from '../../services/SubscriptionService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/**
 * Paystack Webhook Handler
 * Verifies webhook signature and processes payment events
 *
 * Webhook events:
 * - charge.success: Payment successful
 * - charge.failed: Payment failed
 * - transfer.failed: Transfer failed (refunds)
 */
router.post('/paystack', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    const bodyStr = JSON.stringify(req.body);

    // Verify webhook signature
    const paystackService = getPaystackService();
    const isValid = paystackService.verifyWebhookSignature(bodyStr, signature);

    if (!isValid) {
      console.warn('Invalid Paystack webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body.event;
    const data = req.body.data;

    console.log(`Processing Paystack webhook: ${event}`);

    switch (event) {
      case 'charge.success':
        await handlePaymentSuccess(data);
        break;

      case 'charge.failed':
        await handlePaymentFailed(data);
        break;

      case 'transfer.failed':
        await handleTransferFailed(data);
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing Paystack webhook:', error);
    // Still return 200 to avoid Paystack retry
    res.status(200).json({ error: 'Processed with error' });
  }
});

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(data: any) {
  try {
    const reference = data.reference;
    const customerEmail = data.customer.email;
    const amount = data.amount / 100; // Convert kobo to ₦

    console.log(`Payment successful: ${reference} - ${customerEmail} - ₦${amount}`);

    // Find subscription by Paystack metadata
    const metadata = data.metadata || {};

    // If onboarding fee payment
    if (metadata.type === 'onboarding_fee') {
      const storeId = metadata.store_id;
      const planSlug = metadata.plan;

      // Check if subscription exists (from pending trial)
      let subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      // Update existing subscription with plan after payment
      if (subscription) {
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { slug: planSlug },
        });

        if (plan) {
          const now = new Date();
          const billingCycleEnd = new Date(now.getTime() + 2 * 30 * 24 * 60 * 60 * 1000); // 2 months

          subscription = await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              plan_id: plan.id,
              status: 'active',
              billing_cycle_start: now,
              billing_cycle_end: billingCycleEnd,
              next_renewal_at: billingCycleEnd,
              onboarding_fee_paid: true,
              onboarding_paid_at: now,
            },
          });

          // Create invoice for onboarding fee
          await prisma.invoice.create({
            data: {
              subscription_id: subscription.id,
              amount: 50000,
              currency: 'NGN',
              status: 'paid',
              invoice_number: `ONB-${reference}`,
              billing_date: now,
              due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              paystack_reference: reference,
              paid_at: now,
            },
          });

          // Mark store as active
          await prisma.store.update({
            where: { id: storeId },
            data: { is_active: true },
          });

          console.log(`Onboarding subscription activated: ${storeId}`);
        }
      }
    }
    // If monthly renewal payment
    else if (metadata.type === 'subscription_renewal') {
      const subscriptionId = metadata.subscription_id;

      await subscriptionService.processSubscriptionRenewal(subscriptionId, reference);

      console.log(`Subscription renewed: ${subscriptionId}`);
    }
    // If payment method update
    else if (metadata.type === 'payment_method_update') {
      const subscriptionId = metadata.subscription_id;

      // Verify transaction and extract authorization code
      const verification = await getPaystackService().verifyTransaction(reference);

      // Update subscription with new authorization code
      await subscriptionService.updatePaystackAuthorizationCode(
        subscriptionId,
        verification.authorization_code
      );

      console.log(`Payment method updated: ${subscriptionId}`);
    }
  } catch (error) {
    console.error('Error handling payment success webhook:', error);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data: any) {
  try {
    const reference = data.reference;
    const customerEmail = data.customer.email;

    console.log(`Payment failed: ${reference} - ${customerEmail}`);

    const metadata = data.metadata || {};

    // If onboarding fee failed, subscription status remains as is
    if (metadata.type === 'onboarding_fee') {
      console.log(`Onboarding payment failed for store: ${metadata.store_id}`);
    }
    // If renewal failed, mark subscription as past_due
    else if (metadata.type === 'subscription_renewal') {
      const subscriptionId = metadata.subscription_id;

      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'past_due' },
      });

      console.log(`Subscription marked as past_due: ${subscriptionId}`);
    }
  } catch (error) {
    console.error('Error handling payment failed webhook:', error);
    throw error;
  }
}

/**
 * Handle transfer/refund failures
 */
async function handleTransferFailed(data: any) {
  try {
    console.log(`Transfer failed: ${JSON.stringify(data)}`);
    // Handle refund failures if needed
  } catch (error) {
    console.error('Error handling transfer failed webhook:', error);
    throw error;
  }
}

// Health check endpoint for webhooks
router.get('/paystack/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
