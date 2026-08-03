import { subscriptionService } from '../services/SubscriptionService';
import { getPaystackService } from '../services/PaystackSubscriptionService';
import { prisma } from '../lib/prisma';
import { addDays } from 'date-fns';


/**
 * Daily subscription renewal check
 * Finds subscriptions due for renewal and initiates Paystack charges
 */
export async function processDailyRenewals() {
  try {
    console.log('[Cron] Starting daily subscription renewal check...');

    const subscriptionsToRenew = await subscriptionService.getSubscriptionsExpiringWithinDays(1);

    if (subscriptionsToRenew.length === 0) {
      console.log('[Cron] No subscriptions to renew');
      return;
    }

    console.log(`[Cron] Found ${subscriptionsToRenew.length} subscriptions to renew`);

    const paystackService = getPaystackService();

    for (const subscription of subscriptionsToRenew) {
      try {
        if (!subscription.paystack_authorization_code) {
          console.warn(
            `[Cron] Subscription ${subscription.id} has no authorization code. Marking as past_due.`
          );
          await subscriptionService.handleExpiredSubscription(subscription.id);
          continue;
        }

        // Get store email
        const store = subscription.store;
        const storeOwner = await prisma.user.findFirst({
          where: {
            store_id: store.id,
            role: 'admin',
          },
        });

        if (!storeOwner) {
          console.warn(`[Cron] No admin found for store ${store.id}`);
          continue;
        }

        // Charge customer
        const chargeResult = await paystackService.chargeRecurring(
          subscription.paystack_authorization_code,
          storeOwner.email,
          Number(subscription.plan.monthly_price),
          {
            subscription_id: subscription.id,
            store_id: store.id,
            type: 'subscription_renewal',
          }
        );

        if (chargeResult.status === 'success') {
          // Process renewal in our system
          await subscriptionService.processSubscriptionRenewal(subscription.id, chargeResult.reference);
          console.log(
            `[Cron] Subscription renewed successfully: ${subscription.id} (ref: ${chargeResult.reference})`
          );
        } else {
          // Mark as past due if charge unsuccessful
          await subscriptionService.handleExpiredSubscription(subscription.id);
          console.log(`[Cron] Subscription renewal failed: ${subscription.id}. Marked as past due.`);
        }
      } catch (error) {
        console.error(`[Cron] Error processing renewal for subscription ${subscription.id}:`, error);
        // Mark as past due on error
        await subscriptionService.handleExpiredSubscription(subscription.id);
      }
    }

    console.log('[Cron] Daily renewal check completed');
  } catch (error) {
    console.error('[Cron] Error in processDailyRenewals:', error);
  }
}

/**
 * Daily payment reminder check
 * Sends reminders at day 3 and day 7 of non-payment
 */
export async function processPaymentReminders() {
  try {
    console.log('[Cron] Starting payment reminder check...');

    // Check for day 3 reminders
    const day3Reminders = await subscriptionService.getExpiredSubscriptionsForReminder(3);
    console.log(`[Cron] Found ${day3Reminders.length} subscriptions for day 3 reminder`);

    for (const subscription of day3Reminders) {
      try {
        // Send email reminder (implement email service here)
        const store = subscription.store;
        const storeOwner = await prisma.user.findFirst({
          where: {
            store_id: store.id,
            role: 'admin',
          },
        });

        if (storeOwner) {
          // TODO: Send email via SendGrid or similar
          console.log(
            `[Cron] Sending day 3 payment reminder to ${storeOwner.email} for store ${store.name}`
          );

          // Mark reminder as sent
          await subscriptionService.markReminderSent(subscription.id, 3);
        }
      } catch (error) {
        console.error(
          `[Cron] Error sending day 3 reminder for subscription ${subscription.id}:`,
          error
        );
      }
    }

    // Check for day 7 reminders
    const day7Reminders = await subscriptionService.getExpiredSubscriptionsForReminder(7);
    console.log(`[Cron] Found ${day7Reminders.length} subscriptions for day 7 reminder`);

    for (const subscription of day7Reminders) {
      try {
        const store = subscription.store;
        const storeOwner = await prisma.user.findFirst({
          where: {
            store_id: store.id,
            role: 'admin',
          },
        });

        if (storeOwner) {
          // TODO: Send email via SendGrid or similar
          console.log(
            `[Cron] Sending day 7 payment reminder to ${storeOwner.email} for store ${store.name}`
          );

          // Mark reminder as sent
          await subscriptionService.markReminderSent(subscription.id, 7);
        }
      } catch (error) {
        console.error(
          `[Cron] Error sending day 7 reminder for subscription ${subscription.id}:`,
          error
        );
      }
    }

    console.log('[Cron] Payment reminder check completed');
  } catch (error) {
    console.error('[Cron] Error in processPaymentReminders:', error);
  }
}

/**
 * Sync Paystack customer subscription status
 * Catches missed webhooks by querying Paystack directly
 */
export async function syncPaystackStatus() {
  try {
    console.log('[Cron] Starting Paystack status sync...');

    const paystackService = getPaystackService();

    // Get all active subscriptions with Paystack customer IDs
    const subscriptions = await prisma.subscription.findMany({
      where: {
        paystack_customer_id: {
          not: null,
        },
        status: 'active',
      },
      include: {
        store: true,
        plan: true,
      },
    });

    console.log(`[Cron] Syncing ${subscriptions.length} Paystack subscriptions`);

    for (const subscription of subscriptions) {
      try {
        // Get customer from Paystack
        const customer = await paystackService.getCustomer(subscription.paystack_customer_id!);

        // Get recent transactions
        const transactions = await paystackService.listCustomerTransactions(
          customer.email,
          10
        );

        // Check if latest transaction is successful
        const latestSuccessful = transactions.find((tx: any) => tx.status === 'success');

        if (latestSuccessful) {
          const transactionDate = new Date(latestSuccessful.paid_at);
          const now = new Date();

          // If payment is recent, update renewal date
          if (now.getTime() - transactionDate.getTime() < 24 * 60 * 60 * 1000) {
            const nextRenewal = addDays(now, 30);
            const billingCycleEnd = addDays(now, 30);

            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: 'active',
                billing_cycle_start: now,
                billing_cycle_end: billingCycleEnd,
                next_renewal_at: nextRenewal,
              },
            });

            console.log(
              `[Cron] Synced subscription ${subscription.id} - payment confirmed from Paystack`
            );
          }
        }
      } catch (error) {
        console.error(`[Cron] Error syncing subscription ${subscription.id}:`, error);
      }
    }

    console.log('[Cron] Paystack status sync completed');
  } catch (error) {
    console.error('[Cron] Error in syncPaystackStatus:', error);
  }
}

/**
 * Mark expired subscriptions as inactive
 * Runs daily to update store is_active status
 */
export async function updateExpiredSubscriptionStatus() {
  try {
    console.log('[Cron] Starting expired subscription status update...');

    const now = new Date();

    // Find subscriptions that have expired.
    // A subscription is expired when status=active AND next_renewal_at is past
    // AND the trial window (if any) has also closed.
    const expired = await prisma.subscription.findMany({
      where: {
        status: 'active',
        next_renewal_at: { lt: now },
        OR: [
          { trial_ends_at: null },
          { trial_ends_at: { lt: now } },
        ],
      },
      include: {
        store: true,
      },
    });

    console.log(`[Cron] Found ${expired.length} expired subscriptions`);

    for (const subscription of expired) {
      try {
        // Mark subscription as expired
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'expired' },
        });

        // Mark store as inactive (use store_id directly — always present on
        // the subscription row, no need to dereference the included relation).
        await prisma.store.update({
          where: { id: subscription.store_id },
          data: { is_active: false },
        });

        console.log(`[Cron] Marked store ${subscription.store_id} as inactive`);
      } catch (error) {
        console.error(
          `[Cron] Error updating status for subscription ${subscription.id}:`,
          error
        );
      }
    }

    console.log('[Cron] Expired subscription status update completed');
  } catch (error) {
    console.error('[Cron] Error in updateExpiredSubscriptionStatus:', error);
  }
}

/**
 * Initialize all cron jobs
 * Can be called from the main server startup
 */
export function initializeBillingCrons() {
  try {
    // For production, use a proper cron library like 'node-cron' or 'bull'
    // For now, set up basic intervals

    if (process.env.NODE_ENV === 'production') {
      // Run daily renewal check every day at 1 AM
      setInterval(processDailyRenewals, 24 * 60 * 60 * 1000);

      // Run payment reminders every day at 2 AM
      setInterval(processPaymentReminders, 24 * 60 * 60 * 1000);

      // Run Paystack sync every 6 hours
      setInterval(syncPaystackStatus, 6 * 60 * 60 * 1000);

      // Run expired subscription status update every day at 3 AM
      setInterval(updateExpiredSubscriptionStatus, 24 * 60 * 60 * 1000);

      console.log('[Cron] Billing cron jobs initialized');
    } else {
      // In development, run less frequently to avoid too many logs
      console.log('[Cron] Billing cron jobs disabled in development mode');
    }
  } catch (error) {
    console.error('[Cron] Error initializing billing crons:', error);
  }
}
