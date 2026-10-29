import { ApiClient } from './ApiClient';
import { Subscription, SubscriptionPlan, Invoice } from '../redux/slices/subscriptionSlice';

export class SubscriptionServiceClass {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  /**
   * Fetch available subscription plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const plans = await this.api.get<SubscriptionPlan[]>('/subscriptions/plans');
      return plans || [];
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  }

  /**
   * Get current store subscription
   */
  async getSubscription(): Promise<Subscription | null> {
    try {
      const subscription = await this.api.get<Subscription>('/subscriptions');
      return subscription || null;
    } catch (error: any) {
      // 404 means no subscription yet, which is fine
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching subscription:', error);
      throw error;
    }
  }

  /**
   * Start a free 14-day trial
   */
  async startTrial(): Promise<Subscription> {
    try {
      return await this.api.post<Subscription>('/subscriptions/start-trial', {});
    } catch (error) {
      console.error('Error starting trial:', error);
      throw error;
    }
  }

  /**
   * Initialize onboarding payment (₦50,000 for 2 months)
   * Returns authorization URL to redirect user to Paystack
   */
  async initializeOnboarding(planSlug: 'business' | 'pro'): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
    amount: number;
  }> {
    try {
      return await this.api.post<{
        authorization_url: string;
        access_code: string;
        reference: string;
        amount: number;
      }>('/subscriptions/onboarding', {
        planSlug,
      });
    } catch (error) {
      console.error('Error initializing onboarding payment:', error);
      throw error;
    }
  }

  /**
   * Verify onboarding payment after successful Paystack payment
   * Call this after user completes payment on Paystack
   */
  async verifyOnboardingPayment(
    reference: string,
    planSlug: 'business' | 'pro'
  ): Promise<Subscription> {
    try {
      return await this.api.post<Subscription>('/subscriptions/onboarding/verify', {
        reference,
        planSlug,
      });
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }

  /**
   * Upgrade or downgrade subscription plan
   * For existing paid subscriptions
   */
  async upgradePlan(newPlanSlug: 'business' | 'pro'): Promise<Subscription> {
    try {
      return await this.api.post<Subscription>('/subscriptions/upgrade', {
        newPlanSlug,
      });
    } catch (error) {
      console.error('Error upgrading plan:', error);
      throw error;
    }
  }

  /**
   * Get billing history (invoices)
   */
  async getInvoices(): Promise<Invoice[]> {
    try {
      const invoices = await this.api.get<Invoice[]>('/subscriptions/invoices');
      return invoices || [];
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.api.post(`/subscriptions/${subscriptionId}/cancel`, {});
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(subscriptionId: string): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    try {
      return await this.api.patch<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>(`/subscriptions/${subscriptionId}/payment-method`, {});
    } catch (error) {
      console.error('Error updating payment method:', error);
      throw error;
    }
  }

  /**
   * Calculate days remaining in trial
   */
  calculateTrialDaysLeft(trialEndsAt: string): number {
    const now = new Date();
    const trialEnd = new Date(trialEndsAt);
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysLeft);
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(subscription: Subscription | null): boolean {
    if (!subscription) return false;

    const now = new Date();

    // Check if in active status with valid billing cycle
    if (subscription.status === 'active' && new Date(subscription.billing_cycle_end) > now) {
      return true;
    }

    // Check if in trial
    if (subscription.trial_ends_at && new Date(subscription.trial_ends_at) > now) {
      return true;
    }

    return false;
  }

  /**
   * Check if store has onboarding fee paid
   */
  hasOnboardingFeePaid(subscription: Subscription | null): boolean {
    return subscription?.onboarding_fee_paid ?? false;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Get plan details by slug
   */
  getPlanBySlug(plans: SubscriptionPlan[], slug: string): SubscriptionPlan | undefined {
    return plans.find((plan) => plan.slug === slug);
  }
}

// Initialize with ApiClient singleton
let instance: SubscriptionServiceClass | null = null;

export function getSubscriptionService(api: ApiClient): SubscriptionServiceClass {
  if (!instance) {
    instance = new SubscriptionServiceClass(api);
  }
  return instance;
}

export default SubscriptionServiceClass;
