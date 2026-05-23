import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: 'business' | 'pro';
  max_branches: number | null;
  monthly_price: number;
  is_active: boolean;
  features: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  store_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  billing_cycle_start: string;
  billing_cycle_end: string;
  next_renewal_at: string;
  paystack_customer_id?: string;
  trial_ends_at?: string;
  onboarding_fee_paid: boolean;
  onboarding_paid_at?: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  is_active?: boolean;
}

export interface Invoice {
  id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  status: 'unpaid' | 'paid' | 'failed';
  invoice_number: string;
  billing_date: string;
  due_date: string;
  paystack_reference?: string;
  paid_at?: string;
  pdf_url?: string;
  created_at: string;
}

interface SubscriptionState {
  subscription: Subscription | null;
  plans: SubscriptionPlan[];
  invoices: Invoice[];

  // Trial info
  trialDaysLeft: number | null;
  trialEndsAt: string | null;

  // Loading states
  loading: boolean;
  plansLoading: boolean;
  invoicesLoading: boolean;
  paymentInitializing: boolean;

  // Payment state
  paymentReference: string | null;
  paymentAuthorizationUrl: string | null;
  paymentError: string | null;

  // Error messages
  error: string | null;
}

const initialState: SubscriptionState = {
  subscription: null,
  plans: [],
  invoices: [],
  trialDaysLeft: null,
  trialEndsAt: null,
  loading: false,
  plansLoading: false,
  invoicesLoading: false,
  paymentInitializing: false,
  paymentReference: null,
  paymentAuthorizationUrl: null,
  paymentError: null,
  error: null,
};

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    // Fetch subscription
    fetchSubscriptionStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    fetchSubscriptionSuccess: (state, action: PayloadAction<Subscription>) => {
      state.loading = false;
      state.subscription = action.payload;

      // Calculate trial days left if in trial
      if (action.payload.trial_ends_at) {
        const now = new Date();
        const trialEnd = new Date(action.payload.trial_ends_at);
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        state.trialDaysLeft = Math.max(0, daysLeft);
        state.trialEndsAt = action.payload.trial_ends_at;
      }
    },
    fetchSubscriptionError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Fetch plans
    fetchPlansStart: (state) => {
      state.plansLoading = true;
      state.error = null;
    },
    fetchPlansSuccess: (state, action: PayloadAction<SubscriptionPlan[]>) => {
      state.plansLoading = false;
      state.plans = action.payload;
    },
    fetchPlansError: (state, action: PayloadAction<string>) => {
      state.plansLoading = false;
      state.error = action.payload;
    },

    // Fetch invoices
    fetchInvoicesStart: (state) => {
      state.invoicesLoading = true;
      state.error = null;
    },
    fetchInvoicesSuccess: (state, action: PayloadAction<Invoice[]>) => {
      state.invoicesLoading = false;
      state.invoices = action.payload;
    },
    fetchInvoicesError: (state, action: PayloadAction<string>) => {
      state.invoicesLoading = false;
      state.error = action.payload;
    },

    // Start trial
    startTrialStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    startTrialSuccess: (state, action: PayloadAction<Subscription>) => {
      state.loading = false;
      state.subscription = action.payload;

      if (action.payload.trial_ends_at) {
        const now = new Date();
        const trialEnd = new Date(action.payload.trial_ends_at);
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        state.trialDaysLeft = daysLeft;
        state.trialEndsAt = action.payload.trial_ends_at;
      }
    },
    startTrialError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Initialize onboarding payment
    initializeOnboardingStart: (state) => {
      state.paymentInitializing = true;
      state.paymentError = null;
    },
    initializeOnboardingSuccess: (state, action: PayloadAction<{
      authorization_url: string;
      reference: string;
      access_code: string;
    }>) => {
      state.paymentInitializing = false;
      state.paymentAuthorizationUrl = action.payload.authorization_url;
      state.paymentReference = action.payload.reference;
    },
    initializeOnboardingError: (state, action: PayloadAction<string>) => {
      state.paymentInitializing = false;
      state.paymentError = action.payload;
    },

    // Verify payment
    verifyPaymentStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    verifyPaymentSuccess: (state, action: PayloadAction<Subscription>) => {
      state.loading = false;
      state.subscription = action.payload;
      state.paymentAuthorizationUrl = null;
      state.paymentReference = null;
    },
    verifyPaymentError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Upgrade plan
    upgradePlanStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    upgradePlanSuccess: (state, action: PayloadAction<Subscription>) => {
      state.loading = false;
      state.subscription = action.payload;
    },
    upgradePlanError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Cancel subscription
    cancelSubscriptionStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    cancelSubscriptionSuccess: (state) => {
      state.loading = false;
      state.subscription = null;
      state.trialDaysLeft = null;
      state.trialEndsAt = null;
    },
    cancelSubscriptionError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Clear payment
    clearPayment: (state) => {
      state.paymentReference = null;
      state.paymentAuthorizationUrl = null;
      state.paymentError = null;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  fetchSubscriptionStart,
  fetchSubscriptionSuccess,
  fetchSubscriptionError,
  fetchPlansStart,
  fetchPlansSuccess,
  fetchPlansError,
  fetchInvoicesStart,
  fetchInvoicesSuccess,
  fetchInvoicesError,
  startTrialStart,
  startTrialSuccess,
  startTrialError,
  initializeOnboardingStart,
  initializeOnboardingSuccess,
  initializeOnboardingError,
  verifyPaymentStart,
  verifyPaymentSuccess,
  verifyPaymentError,
  upgradePlanStart,
  upgradePlanSuccess,
  upgradePlanError,
  cancelSubscriptionStart,
  cancelSubscriptionSuccess,
  cancelSubscriptionError,
  clearPayment,
  clearError,
} = subscriptionSlice.actions;

export default subscriptionSlice.reducer;
