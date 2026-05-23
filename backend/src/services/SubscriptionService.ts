import { PrismaClient } from '@prisma/client';
import { addDays, addMonths } from 'date-fns';

const prisma = new PrismaClient();

export class SubscriptionService {
  /**
   * Check if a store has an active subscription
   */
  async isStoreActive(storeId: string): Promise<boolean> {
    const subscription = await prisma.subscription.findUnique({
      where: { store_id: storeId },
    });

    if (!subscription) return false;

    // Check if subscription is still active
    const now = new Date();
    if (subscription.status === 'active' && subscription.billing_cycle_end > now) {
      return true;
    }

    // Check if in trial
    if (subscription.trial_ends_at && subscription.trial_ends_at > now) {
      return true;
    }

    return false;
  }

  /**
   * Get current subscription with plan details
   */
  async getStoreSubscription(storeId: string) {
    return prisma.subscription.findUnique({
      where: { store_id: storeId },
      include: {
        plan: true,
      },
    });
  }

  /**
   * Validate if store can create a new branch
   * Business plan allows 1 branch, Pro allows unlimited
   */
  async validateBranchLimit(storeId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.getStoreSubscription(storeId);

    if (!subscription) {
      return { allowed: false, reason: 'No active subscription' };
    }

    const isActive = await this.isStoreActive(storeId);
    if (!isActive) {
      return { allowed: false, reason: 'Subscription inactive or expired' };
    }

    if (subscription.plan.max_branches === null) {
      // Unlimited branches (Pro plan)
      return { allowed: true };
    }

    // Check current branch count
    const branchCount = await prisma.branch.count({
      where: { store_id: storeId, is_active: true },
    });

    if (branchCount >= subscription.plan.max_branches) {
      return {
        allowed: false,
        reason: `Branch limit (${subscription.plan.max_branches}) reached. Upgrade to Pro plan for unlimited branches.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Validate if store can create new users
   * Can extend with user limits based on plan
   */
  async validateUserLimit(storeId: string): Promise<{ allowed: boolean; reason?: string }> {
    const subscription = await this.getStoreSubscription(storeId);

    if (!subscription) {
      return { allowed: false, reason: 'No active subscription' };
    }

    const isActive = await this.isStoreActive(storeId);
    if (!isActive) {
      return { allowed: false, reason: 'Subscription inactive or expired' };
    }

    // For now, all plans allow unlimited users
    // This can be extended based on future requirements
    return { allowed: true };
  }

  /**
   * Validate if store can create transactions
   * Requires active subscription
   */
  async validateTransactionCreation(storeId: string): Promise<{ allowed: boolean; reason?: string }> {
    const isActive = await this.isStoreActive(storeId);
    if (!isActive) {
      return { allowed: false, reason: 'Subscription inactive or expired. Please renew your subscription.' };
    }

    return { allowed: true };
  }

  /**
   * Create subscription after onboarding payment (covers 2 months)
   */
  async createSubscriptionAfterOnboarding(
    storeId: string,
    planSlug: 'business' | 'pro'
  ) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });

    if (!plan) {
      throw new Error(`Plan '${planSlug}' not found`);
    }

    const now = new Date();
    const billingCycleEnd = addMonths(now, 2); // 2 months of coverage
    const nextRenewalAt = addMonths(now, 2); // First renewal after 2 months

    const subscription = await prisma.subscription.create({
      data: {
        store_id: storeId,
        plan_id: plan.id,
        status: 'active',
        billing_cycle_start: now,
        billing_cycle_end: billingCycleEnd,
        next_renewal_at: nextRenewalAt,
        onboarding_fee_paid: true,
        onboarding_paid_at: now,
        auto_renew: true,
      },
      include: {
        plan: true,
      },
    });

    // Create invoice for onboarding fee
    await this.createInvoice(subscription.id, 50000, 'NGN', 'paid');

    return subscription;
  }

  /**
   * Create or start trial subscription
   */
  async createTrialSubscription(storeId: string) {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { slug: 'business' }, // Default to Business for trial
    });

    if (!plan) {
      throw new Error('Business plan not found');
    }

    const now = new Date();
    const trialEndsAt = addDays(now, 14); // 14-day trial

    const subscription = await prisma.subscription.create({
      data: {
        store_id: storeId,
        plan_id: plan.id,
        status: 'active',
        trial_ends_at: trialEndsAt,
        billing_cycle_start: now,
        billing_cycle_end: trialEndsAt, // Trial ends the billing cycle
        next_renewal_at: trialEndsAt, // Renewal when trial ends
        auto_renew: false, // Don't auto-renew trial
      },
      include: {
        plan: true,
      },
    });

    // Update store with trial start
    await prisma.store.update({
      where: { id: storeId },
      data: {
        trial_started_at: now,
      },
    });

    return subscription;
  }

  /**
   * Process subscription renewal (called by cron or webhook)
   */
  async processSubscriptionRenewal(subscriptionId: string, paystackReference: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const now = new Date();
    const nextBillingCycleEnd = addMonths(now, 1); // Next month
    const nextRenewal = addMonths(now, 1);

    // Update subscription
    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'active',
        billing_cycle_start: now,
        billing_cycle_end: nextBillingCycleEnd,
        next_renewal_at: nextRenewal,
      },
      include: { plan: true },
    });

    // Create invoice
    const invoice = await this.createInvoice(
      subscriptionId,
      Number(subscription.plan.monthly_price),
      'NGN',
      'paid',
      paystackReference
    );

    return { subscription: updated, invoice };
  }

  /**
   * Mark subscription as expired or past due
   */
  async handleExpiredSubscription(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Mark as expired
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'expired',
      },
    });

    // Log expired event (could trigger email/SMS here)
    console.log(`Subscription ${subscriptionId} marked as expired`);
  }

  /**
   * Activate subscription after successful payment
   */
  async activateSubscription(subscriptionId: string, paystackReference: string) {
    return await this.processSubscriptionRenewal(subscriptionId, paystackReference);
  }

  /**
   * Update Paystack customer ID after payment
   */
  async updatePaystackCustomerId(subscriptionId: string, paystackCustomerId: string) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paystack_customer_id: paystackCustomerId,
      },
    });
  }

  /**
   * Update Paystack authorization code for recurring charges
   */
  async updatePaystackAuthorizationCode(subscriptionId: string, authCode: string) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paystack_authorization_code: authCode,
      },
    });
  }

  /**
   * Create an invoice
   */
  private async createInvoice(
    subscriptionId: string,
    amount: number,
    currency: string,
    status: 'paid' | 'unpaid' | 'failed' = 'unpaid',
    paystackReference?: string
  ) {
    const invoiceNumber = `INV-${Date.now()}`;
    const now = new Date();

    return prisma.invoice.create({
      data: {
        subscription_id: subscriptionId,
        amount: new (require('decimal.js'))(amount),
        currency,
        status,
        invoice_number: invoiceNumber,
        billing_date: now,
        due_date: addDays(now, 7),
        paystack_reference: paystackReference,
        paid_at: status === 'paid' ? now : null,
      },
    });
  }

  /**
   * Get all subscriptions expiring soon (next 7 days)
   */
  async getSubscriptionsExpiringWithinDays(days: number = 7) {
    const now = new Date();
    const futureDate = addDays(now, days);

    return prisma.subscription.findMany({
      where: {
        next_renewal_at: {
          lte: futureDate,
          gte: now,
        },
        status: 'active',
      },
      include: {
        plan: true,
        store: true,
      },
    });
  }

  /**
   * Get all expired subscriptions that haven't sent reminder
   */
  async getExpiredSubscriptionsForReminder(reminderDay: 3 | 7) {
    const now = new Date();
    const reminderDate = addDays(new Date(0), reminderDay); // Convert day offset to date

    return prisma.subscription.findMany({
      where: {
        status: 'expired',
        next_renewal_at: {
          lt: now,
          gte: addDays(now, -reminderDay),
        },
        paymentReminders: {
          none: {
            reminder_day: reminderDay,
          },
        },
      },
      include: {
        store: true,
        plan: true,
      },
    });
  }

  /**
   * Mark payment reminder as sent
   */
  async markReminderSent(subscriptionId: string, reminderDay: 3 | 7) {
    return prisma.paymentReminder.upsert({
      where: {
        subscription_id_reminder_day: {
          subscription_id: subscriptionId,
          reminder_day: reminderDay,
        },
      },
      update: {
        sent_at: new Date(),
      },
      create: {
        subscription_id: subscriptionId,
        reminder_day: reminderDay,
        sent_at: new Date(),
      },
    });
  }

  /**
   * Upgrade or downgrade subscription plan
   */
  async changePlan(subscriptionId: string, newPlanSlug: 'business' | 'pro') {
    const newPlan = await prisma.subscriptionPlan.findUnique({
      where: { slug: newPlanSlug },
    });

    if (!newPlan) {
      throw new Error(`Plan '${newPlanSlug}' not found`);
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        plan_id: newPlan.id,
      },
      include: {
        plan: true,
      },
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'cancelled',
        cancelled_at: new Date(),
        auto_renew: false,
      },
    });
  }

  /**
   * Get subscription invoices
   */
  async getSubscriptionInvoices(subscriptionId: string) {
    return prisma.invoice.findMany({
      where: { subscription_id: subscriptionId },
      orderBy: { created_at: 'desc' },
    });
  }
}

export const subscriptionService = new SubscriptionService();
