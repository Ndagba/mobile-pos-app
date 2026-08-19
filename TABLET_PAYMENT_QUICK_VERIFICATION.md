# Tablet Payment Flow - Quick Verification Checklist

**Purpose**: Rapid validation of tablet payment flows without full test execution  
**Time Required**: 15-20 minutes per test case  
**Device**: Physical Android tablet (7-10 inches)  

---

## Pre-Test Verification (5 minutes)

- [ ] Tablet internet connectivity verified
- [ ] JAYPOS app installed and running
- [ ] User logged in (test account ready)
- [ ] Test products visible in inventory
- [ ] Test customers with credit limits created
- [ ] Test admin account available

---

## Quick Smoke Tests (5 minutes each)

### ✅ Test 1: Tablet Layout Detection
**Expected**: App shows split-screen layout (not phone drawer)
```
Steps:
1. Open Checkout
2. Verify:
   - Left side: Product list (65% width)
   - Right side: Cart sidebar (35% width)
   - NO floating cart drawer (phone style)
```

### ✅ Test 2: Payment Method Selection
**Expected**: Can select Cash/Card/Transfer
```
Steps:
1. Add product to cart
2. Verify payment buttons visible: Cash | Card | Transfer
3. Click each button - verify only one selected (highlighted)
4. Verify Checkout button only enabled when payment selected
```

### ✅ Test 3: Customer Credit Check
**Expected**: Alert shows for insufficient balance
```
Steps:
1. Add ₦30,000 worth of products
2. Tap "Add Customer"
3. Select customer with ₦10,000 balance
4. Alert: "Low Balance" shows actual balance vs sale total
5. Tap Proceed → transaction continues
6. Tap Cancel → customer clears
```

### ✅ Test 4: Admin Branch Selection
**Expected**: Admin can select branch, checkout blocked without it
```
Steps (Admin user):
1. Add products
2. Verify branch selector visible above customer button
3. Default shows "Select branch"
4. Click dropdown → shows "All Branches", "Branch A", "Branch B"
5. Select "Branch A" → button updates
6. Checkout → receipt shows "Branch A"
```

### ✅ Test 5: Receipt Display & Sharing
**Expected**: Receipt modal opens with all details, share works
```
Steps:
1. Complete checkout
2. Receipt modal shows:
   ✓ "Transaction Complete" header
   ✓ All purchased items with qty × price
   ✓ Subtotal, VAT, Total
   ✓ Payment method (Cash/Card/Transfer)
3. Tap "Print / Share"
4. Native share sheet appears (email, SMS, etc.)
5. Copy to clipboard → paste to verify format
```

---

## Responsive Design Quick Check (5 minutes)

### Portrait Mode
```
□ 65/35 split clearly visible
□ Product cards grid format
□ No horizontal scrolling
□ All buttons accessible (not hidden/cut off)
□ Text readable without zoom
□ Touch targets not too small (buttons ≥48dp)
```

### Landscape Mode
```
1. Rotate to landscape
□ Layout adjusts proportionally
□ Split still visible (not stacked)
□ Content readable
□ No elements disappear
□ Buttons remain accessible
```

---

## Cart Operations Quick Test (3 minutes)

```
1. Add 3 different products
   □ Each appears in cart
   □ Quantities show correctly
   □ Line totals (qty × price) calculate

2. Tap + button on first product
   □ Quantity increments
   □ Cart total updates immediately
   □ No lag/delay

3. Tap - button on second product
   □ Quantity decrements
   □ If qty reaches 0 → item removes

4. Tap × button on third product
   □ Item removed immediately
   □ Cart count updates
```

---

## Tax & Total Verification (2 minutes)

```
Example: Add product with ₦1,000 price, 7.5% tax rate, qty 2

Expected Calculation:
Subtotal: ₦2,000
VAT: ₦2,000 × 7.5% = ₦150
Total: ₦2,150

Check cart summary matches calculated amount
```

---

## Pass/Fail Decision Tree

### Critical Issues Found?
- ❌ Layout not split-screen (shows drawer instead)
- ❌ Checkout disabled with payment method selected
- ❌ Receipt missing payment method info
- ❌ Admin checkout works without branch
- ❌ Customer credit not validated
- ❌ Buttons unreachable/hidden

**→ FAIL - Do NOT proceed to production**

### Minor Issues Found?
- ⚠️ Text slightly blurry (acceptable if readable)
- ⚠️ Slight lag on cart update (acceptable if <500ms)
- ⚠️ Touch target slightly small but usable
- ⚠️ Spacing inconsistent but not breaking

**→ PASS with notation - Fix in next release**

### No Issues Found?
- ✅ All tests pass
- ✅ Layout responsive
- ✅ All features functional
- ✅ User experience smooth

**→ PASS - Clear for production**

---

## Quick Regression Test (If Changes Made)

**After any code changes, run these 2-minute tests**:

```
□ Payment methods select correctly
□ Customer credit limit shows
□ Admin branch selector works
□ Receipt displays
□ Cart totals calculate
□ Responsive on both orientations
□ No crashes or errors
```

**All pass?** → Safe to deploy

---

## Bug Report Template

If issues found, document as:

```
Bug: [Brief title]
Impact: [Customer-facing / Critical / Minor]
Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected: [What should happen]
Actual: [What happened instead]
Device: [Tablet model, OS version]
Screenshot: [Screenshot of issue]

Suggested Fix: [If obvious]
```

---

## Performance Baseline

**Quick perf check** (watch and estimate):

- [ ] Tap product → add to cart: < 100ms
- [ ] Cart total updates: < 200ms
- [ ] Tap Checkout → receipt appears: < 3 seconds
- [ ] Share button → native sheet: < 500ms
- [ ] Product list scroll: smooth, no jank

---

## Accessibility Quick Check

**Minimum criteria**:

```
□ All interactive elements ≥ 48dp
□ Text readable without zoom
□ Color contrast sufficient (not just colors)
□ No text cut off at screen edges
□ Touch feedback visible (button press)
```

---

## Device-Specific Notes

### If Testing on 7" Tablet
- Expect tighter spacing
- Verify no elements hidden
- Touch targets might feel closer together
- Cart sidebar still readable

### If Testing on 10" Tablet
- More spacious layout
- Verify proportions still correct
- No excessive whitespace
- Spacing feels balanced

### If Testing on 12" Tablet
- Largest test case
- Verify scaling is proportional
- Check product grid isn't too spread out
- Receipt should still be readable

---

## Sample Test Session Log

**Device**: Samsung Galaxy Tab S9 (11")  
**OS**: Android 13  
**App Version**: 1.0.0  
**Date**: 2026-05-22  
**Time**: 10:00-10:20 AM  

```
Test 1: Layout Detection ✅ PASS
- Split-screen visible, proportions correct

Test 2: Payment Methods ✅ PASS
- All 3 methods selectable, visual feedback works

Test 3: Customer Credit ✅ PASS
- Alert shows, low balance calculation correct

Test 4: Admin Branch ✅ PASS
- Selector visible, dropdown works, receipt includes branch

Test 5: Receipt & Share ✅ PASS
- Receipt complete, share sheet opens, format clean

Responsive (Portrait) ✅ PASS
Responsive (Landscape) ✅ PASS

Cart Operations ✅ PASS
Tax Calculation ✅ PASS

Issues Found: None
Performance: Smooth (60 FPS estimated)
Accessibility: Acceptable

Overall Result: ✅ PASS
```

---

## Common Issues & Quick Fixes

### Issue: Layout shows drawer instead of split-screen
**Check**: 
- Device width ≥ 600dp? (check: `adb shell dumpsys window | grep -i "cur size"`)
- If <600dp, issue is device definition, not code
- If ≥600dp, check `useResponsive()` hook in App.tsx

### Issue: Checkout disabled even with payment selected
**Check**:
- Cart has items? (verify cartCount > 0)
- Payment method selected? (verify selectedPayment !== null)
- For admin: branch selected? (verify selectedBranchId !== null)

### Issue: Receipt missing payment method
**Check**:
- Receipt object includes `payment_method` field
- Should display as "CASH", "CARD", or "TRANSFER" (not "mobile_wallet")

### Issue: Customer credit not showing
**Check**:
- Customer has credit_limit field in database
- `total_spent` field calculated correctly
- Formula: balance = credit_limit - total_spent

### Issue: Touch targets too small
**Check**:
- Product +/- buttons have hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }
- This makes 24×24dp button effective 40×40dp
- If still too small: increase hitSlop or button size

---

## Sign-Off

```
Tester Name: _______________________
Device: _______________________
OS Version: _______________________
Test Date: _______________________

Critical Issues Found: ☐ Yes ☐ No
Minor Issues Found: ☐ Yes ☐ No

Overall Assessment: ☐ PASS ☐ FAIL ☐ PASS WITH NOTES

Notes:
_________________________________________________________
_________________________________________________________
_________________________________________________________

Approved for Production: ☐ Yes ☐ No ☐ Conditional
```

---

## Time Tracking

| Phase | Time | Status |
|-------|------|--------|
| Pre-Test Setup | 5 min | |
| Smoke Tests (5 × 5 min) | 25 min | |
| Responsive Design | 5 min | |
| Cart Operations | 3 min | |
| Tax Verification | 2 min | |
| Bug Documentation | 5 min | |
| **Total** | **~45 min** | |

