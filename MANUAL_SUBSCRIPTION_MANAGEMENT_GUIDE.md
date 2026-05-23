# Manual Subscription Management Guide

## Overview

The Manual Subscription Management System allows **Super Admins** to manage subscriptions without Paystack integration. This is useful for:

- **Testing** subscription features in development
- **Special deals** or custom subscription arrangements
- **Manual payment** handling (offline payments, wire transfers, etc.)
- **Trial extensions** for customer support
- **Subscription fixes** and adjustments

---

## Backend Admin Endpoints

All endpoints require `is_super_admin = true` in JWT token.

### **1. List All Subscriptions**

**GET** `/v1/admin/subscriptions?status=active&limit=50&offset=0`

**Query Parameters:**
- `status` (optional): Filter by status (active, expired, past_due, cancelled)
- `limit` (optional): Default 50
- `offset` (optional): Default 0

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sub_123",
      "store_id": "store_001",
      "plan": { "name": "Business", "monthly_price": 12500 },
      "status": "active",
      "billing_cycle_start": "2026-05-22",
      "billing_cycle_end": "2026-06-22",
      "next_renewal_at": "2026-06-22"
    }
  ],
  "pagination": { "total": 10, "limit": 50, "offset": 0 }
}
```

---

### **2. Get Single Store Subscription**

**GET** `/v1/admin/subscriptions/:storeId`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "sub_123",
    "store_id": "store_001",
    "plan": { "name": "Business" },
    "invoices": [
      {
        "id": "inv_123",
        "amount": 12500,
        "status": "paid"
      }
    ]
  }
}
```

---

### **3. Create Subscription Manually**

**POST** `/v1/admin/subscriptions`

**Request Body:**
```json
{
  "storeId": "store_001",
  "planSlug": "business",
  "durationMonths": 2,
  "reason": "Special promotion for early adopter"
}
```

**What happens:**
- ✅ Creates subscription with status = "active"
- ✅ Sets billing cycle for specified months
- ✅ Creates paid invoice automatically
- ✅ Marks store as active
- ✅ Logs admin action in audit trail

**Response:**
```json
{
  "success": true,
  "message": "Subscription created successfully",
  "data": { ...subscription }
}
```

---

### **4. Update Subscription**

**PATCH** `/v1/admin/subscriptions/:storeId`

**Request Body:**
```json
{
  "planSlug": "pro",
  "extendMonths": 3,
  "newStatus": "active",
  "reason": "Customer upgraded to Pro"
}
```

**Capabilities:**
- Change plan (business → pro or vice versa)
- Extend subscription by N months
- Change status (active/expired/past_due)

**Response:**
```json
{
  "success": true,
  "message": "Subscription updated successfully",
  "data": { ...updated subscription }
}
```

---

### **5. Extend Trial**

**POST** `/v1/admin/subscriptions/:storeId/extend-trial`

**Request Body:**
```json
{
  "days": 7,
  "reason": "Customer support - requested extension"
}
```

**Only for:** Subscriptions in trial status

**Response:**
```json
{
  "success": true,
  "message": "Trial extended by 7 days",
  "data": { ...subscription }
}
```

---

### **6. Activate Subscription**

**POST** `/v1/admin/subscriptions/:storeId/activate`

**Request Body:**
```json
{
  "reason": "Customer made offline payment"
}
```

**What happens:**
- ✅ Sets status = "active"
- ✅ Updates billing cycle (today + 1 month)
- ✅ Marks store as active

**Response:**
```json
{
  "success": true,
  "message": "Subscription activated",
  "data": { ...subscription }
}
```

---

### **7. Deactivate Subscription**

**POST** `/v1/admin/subscriptions/:storeId/deactivate`

**Request Body:**
```json
{
  "reason": "Non-payment / customer request"
}
```

**What happens:**
- ✅ Sets status = "expired"
- ✅ Marks store as inactive
- ✅ Blocks write operations (feature gates activate)

**Response:**
```json
{
  "success": true,
  "message": "Subscription deactivated",
  "data": { ...subscription }
}
```

---

### **8. Delete Subscription**

**DELETE** `/v1/admin/subscriptions/:storeId`

**Request Body:**
```json
{
  "reason": "Test subscription cleanup"
}
```

**Caution:** Permanently deletes subscription. Use deactivate instead for real scenarios.

---

### **9. View Audit Log**

**GET** `/v1/admin/subscriptions-audit-log?storeId=store_001&action=CREATE_SUBSCRIPTION`

**Query Parameters:**
- `storeId` (optional): Filter by store
- `action` (optional): Filter by action (CREATE_SUBSCRIPTION, UPDATE_SUBSCRIPTION, etc.)
- `limit` (optional): Default 100
- `offset` (optional): Default 0

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "log_123",
      "user": { "email": "admin@company.com" },
      "action": "ADMIN_CREATE_SUBSCRIPTION",
      "resource_type": "subscription",
      "resource_id": "store_001",
      "changes": {
        "planSlug": "business",
        "durationMonths": 2,
        "reason": "Special offer"
      },
      "created_at": "2026-05-22T10:30:00Z"
    }
  ]
}
```

---

## Mobile Admin Screen

The **AdminSubscriptionsScreen** provides a UI for managing subscriptions.

### **Features:**

✅ **List View**
- Search by store name or ID
- Filter by status (Active, Expired, Past Due)
- See plan, expiry date, and status at a glance

✅ **Quick Actions** (per subscription)
- Extend Trial (if in trial)
- Activate (if expired)
- Deactivate (if active)

✅ **Details View**
- Full subscription information
- All important dates
- Manual status management

### **Integration:**

Add to navigation in `mobile/src/App.tsx`:

```typescript
import AdminSubscriptionsScreen from './screens/AdminSubscriptionsScreen';

// In your navigation:
<Stack.Screen name="AdminSubscriptions" component={AdminSubscriptionsScreen} />
```

Then link from an admin settings screen:

```typescript
<TouchableOpacity onPress={() => navigation.navigate('AdminSubscriptions')}>
  <Text>Manage Subscriptions</Text>
</TouchableOpacity>
```

---

## Usage Examples

### **Example 1: Create Subscription for New Customer**

```bash
# Super admin creates a 1-month Business subscription
POST /v1/admin/subscriptions

{
  "storeId": "store_999",
  "planSlug": "business",
  "durationMonths": 1,
  "reason": "New customer - first month trial setup"
}
```

**Result:**
- Store can use all Business features
- Store status = active
- Subscription expires after 1 month
- Manual renewal needed (not automatic)

---

### **Example 2: Extend Trial for Customer Support**

```bash
# Customer asked for more time
POST /v1/admin/subscriptions/store_001/extend-trial

{
  "days": 7,
  "reason": "Customer support - system migration delay"
}
```

**Result:**
- Trial period extended by 7 days
- Subscription remains active
- Auto-renewal still off (no Paystack)

---

### **Example 3: Upgrade Customer from Business to Pro**

```bash
# Customer wants multiple branches
PATCH /v1/admin/subscriptions/store_001

{
  "planSlug": "pro",
  "reason": "Customer upgraded to Pro plan"
}
```

**Result:**
- Plan changed to Pro
- Unlimited branches now allowed
- All Pro features enabled

---

### **Example 4: Handle Offline Payment**

**Scenario:** Customer pays ₦50,000 via bank transfer

```bash
# Admin creates 2-month subscription
POST /v1/admin/subscriptions

{
  "storeId": "store_002",
  "planSlug": "pro",
  "durationMonths": 2,
  "reason": "Offline payment received - bank transfer"
}
```

**Result:**
- Subscription immediately active
- Invoice created (marked as paid)
- No Paystack integration needed
- Perfect for manual payment workflows

---

### **Example 5: Deactivate for Non-Payment**

```bash
# Customer hasn't paid renewal
POST /v1/admin/subscriptions/store_001/deactivate

{
  "reason": "Non-payment of ₦12,500 renewal"
}
```

**Result:**
- Subscription status = "expired"
- Store status = inactive
- Write operations blocked
- Store can see historical data (read-only)

---

## Testing Workflow

### **1. Create Test Subscription**

```bash
# Create subscription for test store
POST /v1/admin/subscriptions
{
  "storeId": "test_store",
  "planSlug": "business",
  "durationMonths": 1,
  "reason": "Testing subscription system"
}
```

### **2. Use Test Subscription**

- Log in with test store
- Create transactions
- Add products/customers
- Everything works normally

### **3. Test Expiration**

```bash
# Deactivate subscription
POST /v1/admin/subscriptions/test_store/deactivate
{
  "reason": "Testing expiration behavior"
}
```

- Try to create transaction → Error "Subscription expired"
- Try to add branch → Error "Subscription expired"
- Can still view data (read-only mode works)

### **4. Test Reactivation**

```bash
# Activate subscription
POST /v1/admin/subscriptions/test_store/activate
{
  "reason": "Reactivating for continued testing"
}
```

- Transactions work again
- All features available

---

## Audit Trail

Every admin action is logged with:
- **Who** (admin email)
- **What** (action type)
- **When** (timestamp)
- **Why** (reason provided)
- **Details** (changes made)

**View logs:**

```bash
GET /v1/admin/subscriptions-audit-log?storeId=store_001
```

**Why this matters:**
- Compliance tracking
- Customer support (verify who made what change)
- Debugging issues
- Legal requirements

---

## Permissions

**Only Super Admins can:**
- Create subscriptions
- Modify subscriptions
- Deactivate stores
- View audit logs

**Regular admins cannot:**
- Access `/v1/admin/*` endpoints
- View other stores' subscriptions
- Make changes to subscription status

**Check in database:**

```sql
-- View super admins
SELECT email, is_super_admin FROM "User" WHERE is_super_admin = true;

-- Promote to super admin
UPDATE "User" SET is_super_admin = true WHERE email = 'manager@store.com';
```

---

## Best Practices

✅ **Always provide a reason** for manual changes  
✅ **Check audit logs** before making bulk changes  
✅ **Use deactivate, not delete** for real subscriptions  
✅ **Test with trial extensions** before creating paid subscriptions  
✅ **Document special deals** in the reason field  
✅ **Verify store ID** before creating subscriptions  

---

## Troubleshooting

### Issue: "Super admin access required"
**Solution:** User is not a super admin. Promote them in database or create new super admin account.

### Issue: "Store already has a subscription"
**Solution:** Delete the old subscription first (if test) or update it instead of creating new.

### Issue: "Plan not found"
**Solution:** Use correct slug: `business` or `pro` (lowercase).

### Issue: Store still inactive after activating subscription
**Solution:** Run the activate endpoint. It explicitly sets `store.is_active = true`.

---

## Integration with Paystack

**Migration from Manual to Paystack:**

1. Manual subscriptions work without Paystack
2. When ready for production, switch to Paystack endpoints
3. Existing manual subscriptions remain active
4. New customers go through Paystack onboarding
5. Manual management still available for exceptions

---

## Quick Reference

| Action | Endpoint | Method |
|--------|----------|--------|
| List subscriptions | `/admin/subscriptions` | GET |
| Get one | `/admin/subscriptions/:storeId` | GET |
| Create | `/admin/subscriptions` | POST |
| Update | `/admin/subscriptions/:storeId` | PATCH |
| Extend trial | `/admin/subscriptions/:storeId/extend-trial` | POST |
| Activate | `/admin/subscriptions/:storeId/activate` | POST |
| Deactivate | `/admin/subscriptions/:storeId/deactivate` | POST |
| Delete | `/admin/subscriptions/:storeId` | DELETE |
| View logs | `/admin/subscriptions-audit-log` | GET |

---

## Next Steps

1. ✅ Test manual subscription creation
2. ✅ Verify feature gating works (stores blocked when inactive)
3. ✅ Integrate AdminSubscriptionsScreen into app navigation
4. ✅ Create test data for Paystack integration testing
5. ✅ Document approval process for manual changes

