# JAYPOS Subscription System - Implementation Guide

## ✅ Completed Implementation

### Phase 1: Database & Core Services
- ✅ Prisma schema with subscription models (SubscriptionPlan, Subscription, Invoice, PaymentReminder)
- ✅ SubscriptionService with all core logic
- ✅ PaystackSubscriptionService with payment integration
- ✅ Subscription plans seeded (Business ₦12,500/mo, Pro ₦24,000/mo)

### Phase 2: Backend Routes & Middleware
- ✅ `/v1/subscriptions` API endpoints (GET plans, POST trial, POST onboarding, etc.)
- ✅ `/v1/webhooks/paystack` webhook handler
- ✅ `featureGate` middleware for subscription validation
- ✅ Feature gates integrated into branches and transactions routes

### Phase 3: Billing Logic
- ✅ 4 cron jobs for subscription management (renewals, reminders, status sync)
- ✅ Integrated cron initialization in main server

### Phase 4: Mobile Frontend
- ✅ Redux subscription slice with full state management
- ✅ SubscriptionService for API calls
- ✅ 4 new screens:
  - TrialScreen.tsx - Free trial countdown and upgrade CTA
  - OnboardingPaymentScreen.tsx - Plan selection and Paystack payment
  - SubscriptionScreen.tsx - Current subscription details and invoices
  - BillingScreen.tsx - Full invoice history

---

## 🔧 Remaining Integration Tasks

### 1. **Environment Variables Setup**

Add to `backend/.env`:
```env
PAYSTACK_SECRET_KEY=sk_test_xxxxx  # Get from Paystack dashboard
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx  # Get from Paystack dashboard
```

Add to `mobile/.env`:
```env
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx  # Same as backend
```

### 2. **Register Subscription Screens in Navigation**

Update `mobile/src/App.tsx` or navigation file to include:
```typescript
import TrialScreen from './screens/TrialScreen';
import OnboardingPaymentScreen from './screens/OnboardingPaymentScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import BillingScreen from './screens/BillingScreen';

// Add to navigation stack:
<Stack.Screen name="Trial" component={TrialScreen} />
<Stack.Screen name="OnboardingPayment" component={OnboardingPaymentScreen} />
<Stack.Screen name="Subscription" component={SubscriptionScreen} />
<Stack.Screen name="Billing" component={BillingScreen} />
```

### 3. **Add Subscription Middleware to App**

Create `mobile/src/redux/middleware/subscriptionMiddleware.ts`:
```typescript
// Middleware to:
// 1. Fetch subscription on app launch
// 2. Check if store is read-only (inactive subscription)
// 3. Block write operations if inactive
// 4. Show subscription banners
```

Then integrate into `mobile/src/redux/store.ts`:
```typescript
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware().concat(syncMiddleware, subscriptionMiddleware),
```

### 4. **Add Subscription Check to Dashboard**

Update `mobile/src/screens/DashboardScreen.tsx`:
```typescript
// 1. Dispatch action to fetch subscription on mount
// 2. Check if subscription is active
// 3. Show trial countdown banner if in trial
// 4. Show upgrade prompt if expired
// 5. Block transaction creation if inactive
```

### 5. **Add Settings Link to Billing**

Update `mobile/src/screens/SettingsScreen.tsx`:
```typescript
// Add button to navigate to SubscriptionScreen
// Show current plan and subscription status
```

### 6. **Configure Paystack Webhook in Backend**

In Paystack dashboard:
1. Go to Settings → API Keys & Webhooks
2. Add webhook URL: `https://your-api.com/v1/webhooks/paystack`
3. Select events:
   - charge.success
   - charge.failed
   - transfer.failed
4. Copy webhook secret and verify in code

### 7. **Add Email Service for Payment Reminders**

The cron jobs are set up to send reminders, but need email integration:

Update `backend/src/jobs/billingCron.ts`:
```typescript
// Replace TODO comments with actual email service
// Options:
// - SendGrid
// - Mailgun
// - AWS SES
// - Node Mailer

// Example with SendGrid:
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: storeOwner.email,
  from: 'billing@jaypos.com',
  subject: 'Payment Reminder',
  html: `Your subscription expires in X days...`,
});
```

---

## 🧪 Testing Checklist

### Backend Testing

- [ ] **Database**: Check Prisma models created
  ```bash
  cd backend
  npx prisma db push
  npx prisma studio  # Check subscription tables exist
  ```

- [ ] **Subscription Plans Seeded**: Verify plans in database
  ```sql
  SELECT * FROM subscription_plans;
  ```

- [ ] **API Endpoints**: Test with Postman
  - [ ] GET `/v1/subscriptions/plans` - Should return 2 plans
  - [ ] POST `/v1/subscriptions/start-trial` - Requires auth
  - [ ] POST `/v1/subscriptions/onboarding` - Should return Paystack URL
  - [ ] POST `/v1/subscriptions/onboarding/verify` - Verify payment

- [ ] **Feature Gates**: Test protected routes
  - [ ] POST `/v1/transactions` should require active subscription
  - [ ] POST `/v1/branches` should check branch limits
  - [ ] Test with expired subscription should return 403

- [ ] **Paystack Integration**: Test with Paystack sandbox
  - [ ] Webhook handler accepts valid signatures
  - [ ] Payment success webhook updates subscription
  - [ ] Payment failure webhook marks as past_due

### Mobile Testing

- [ ] **Redux State**: Check subscription slice in Redux
  ```typescript
  // In console:
  // store.getState().subscription
  // Should have subscription, plans, loading states
  ```

- [ ] **Navigation**: Screens accessible
  - [ ] Navigate to TrialScreen - Should show trial UI
  - [ ] Navigate to OnboardingPaymentScreen - Should show plan selection
  - [ ] Navigate to SubscriptionScreen - Should show subscription details
  - [ ] Navigate to BillingScreen - Should show invoices

- [ ] **API Integration**: SubscriptionService calls work
  - [ ] getPlans() returns 2 plans
  - [ ] startTrial() creates trial subscription
  - [ ] initializeOnboarding() returns Paystack URL
  - [ ] getSubscription() returns current subscription

- [ ] **Paystack Payment**: Full payment flow
  - [ ] Select plan on OnboardingPaymentScreen
  - [ ] Click "Proceed to Payment"
  - [ ] Paystack web view opens with payment form
  - [ ] Test card: 4111111111111111, any expiry, any CVV
  - [ ] Complete payment
  - [ ] Verify webhook updates subscription
  - [ ] App navigates to Dashboard and shows active subscription

- [ ] **Feature Gating**: Write operations blocked when inactive
  - [ ] Cancel subscription in SubscriptionScreen
  - [ ] Try to create transaction - should show "Subscription expired" error
  - [ ] Try to add branch - should show "Branch limit exceeded" error

- [ ] **Trial Flow**: Full trial experience
  - [ ] Start free trial
  - [ ] See trial countdown on TrialScreen
  - [ ] Trial expires - features blocked
  - [ ] Upgrade to Business plan
  - [ ] See 2-month coverage

- [ ] **Upgrade Flow**: Plan changes
  - [ ] Activate via trial/onboarding
  - [ ] Change plan from Business to Pro
  - [ ] Verify plan limits update

---

## 🚀 Paystack Sandbox Testing

### Test Cards:
- **Visa**: 4111 1111 1111 1111
- **Mastercard**: 5531 8866 5214 2950
- **Verve**: 5061 0211 2008 3625
- **Any expiry**: 05/23 or later
- **Any CVV**: 123

### Webhook Testing:
1. Use [ngrok](https://ngrok.com/) to expose local backend:
   ```bash
   ngrok http 3000
   # Then update Paystack webhook URL to:
   # https://your-ngrok-url/v1/webhooks/paystack
   ```

2. Complete payment in sandbox
3. Check server logs for webhook receipt
4. Verify subscription status updated in database

---

## 📊 Deployment Checklist

- [ ] Paystack API keys configured in production
- [ ] Database migrations run on production
- [ ] Cron jobs enabled (set NODE_ENV=production)
- [ ] Webhook URL pointing to production API
- [ ] Email service configured for payment reminders
- [ ] SSL/TLS enabled on production
- [ ] Rate limiting configured appropriately
- [ ] Logs monitoring setup for errors
- [ ] Database backups scheduled
- [ ] Payment reconciliation process documented

---

## 🐛 Common Issues & Solutions

### Issue: "PAYSTACK_SECRET_KEY not set"
**Solution**: Add to `.env` and restart server

### Issue: Paystack webhook not being received
**Solution**: Check webhook URL in Paystack dashboard, verify signature validation, check server logs

### Issue: "Subscription expired" but not expired in DB
**Solution**: Check cron job status, ensure `next_renewal_at` is set correctly

### Issue: Trial days showing negative
**Solution**: Check calculation in TrialScreen.tsx, ensure `trial_ends_at` is set

### Issue: Payment successful but subscription not updated
**Solution**: Check webhook handler logs, verify Paystack reference format, ensure database transaction committed

---

## 📚 Key Files Summary

### Backend
- `backend/src/services/SubscriptionService.ts` - Core subscription logic
- `backend/src/services/PaystackSubscriptionService.ts` - Payment provider
- `backend/src/api/routes/subscriptions.routes.ts` - API endpoints
- `backend/src/api/middleware/featureGate.middleware.ts` - Feature validation
- `backend/src/api/routes/webhooks.routes.ts` - Payment webhook handler
- `backend/src/jobs/billingCron.ts` - Scheduled billing tasks
- `backend/prisma/schema.prisma` - Database schema

### Mobile
- `mobile/src/redux/slices/subscriptionSlice.ts` - Redux state
- `mobile/src/services/SubscriptionService.ts` - API service
- `mobile/src/screens/TrialScreen.tsx` - Trial UI
- `mobile/src/screens/OnboardingPaymentScreen.tsx` - Payment UI
- `mobile/src/screens/SubscriptionScreen.tsx` - Subscription details
- `mobile/src/screens/BillingScreen.tsx` - Invoice history
- `mobile/src/redux/store.ts` - Redux store configuration

---

## 🔐 Security Notes

- ✅ Paystack webhook signature validation implemented
- ✅ Feature gates prevent unauthorized access
- ✅ JWT tokens required for all subscription endpoints
- ✅ Subscription checks on read-only operations
- ⚠️ **TODO**: Add rate limiting to Paystack endpoints
- ⚠️ **TODO**: Add CORS whitelist for webhook endpoint
- ⚠️ **TODO**: Encrypt stored Paystack authorization codes

---

## 📞 Support & Documentation

For more information:
- Paystack Docs: https://paystack.com/developers/docs
- Prisma Docs: https://www.prisma.io/docs/
- Redux Toolkit: https://redux-toolkit.js.org/
- React Native: https://reactnative.dev/

