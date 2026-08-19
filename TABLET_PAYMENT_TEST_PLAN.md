# JAYPOS Tablet Payment Flow Test Plan

## Overview
This document outlines comprehensive test scenarios for payment flows on tablet-optimized layouts. The tablet layout features a 65/35 split screen with products on the left and cart on the right, providing a streamlined checkout experience suitable for larger screens.

---

## Test Environment Setup

### Device Requirements
- **Android Tablet**: Minimum 600dp width (7-10 inch tablets)
- **Orientation**: Portrait and Landscape modes
- **Network**: Test both Online and Offline modes

### Test Data Required
1. **Products**: 15-20 products across multiple categories with varying prices and stock levels
2. **Customers**: 5 customers with varying credit limits (some with ₦50,000, some with ₦10,000)
3. **Branches**: 2-3 active branches (for admin users)
4. **User Roles**: Test as both cashier and admin

### Pre-Test Checklist
- [ ] App installed on tablet device
- [ ] Test account logged in
- [ ] Products loaded in inventory
- [ ] Customers created with credit limits
- [ ] Network connectivity verified
- [ ] Device orientation support tested

---

## Payment Flow Test Scenarios

### 1. Basic Cash Payment Flow (Phone-style to Tablet)

**Scenario**: Simple cash transaction with no customer or special conditions

**Steps**:
1. Open Checkout on tablet (should display side-by-side layout)
2. Search for "Electronics" category products using search bar
3. Tap Add button on first product → cart updates to "1 item"
4. Increment quantity to 3 using + button
5. Select "CASH" payment method (button should highlight)
6. Verify cart summary shows:
   - Subtotal: ₦X
   - VAT: ₦Y
   - Total: ₦Z
7. Tap "Checkout" button
8. Verify receipt modal displays with all transaction details
9. Tap "Done" to close receipt

**Expected Results**:
- ✅ Products list maintains 2-column layout on tablet
- ✅ Cart sidebar responsive and readable
- ✅ Payment method buttons clearly visible and interactive
- ✅ Cart total updates correctly with quantity changes
- ✅ Receipt displays complete transaction
- ✅ No UI elements cut off or overlapped

**UI/UX Verification**:
- [ ] Touch target size: All buttons ≥ 48dp
- [ ] Font sizes readable at arm's length (≥14sp)
- [ ] Spacing consistent with theme
- [ ] No horizontal scrolling needed

---

### 2. Card Payment Selection

**Scenario**: User selects card payment method

**Steps**:
1. Add 2-3 products to cart
2. Tap "Card" payment button
3. Observe button styling change
4. Verify other payment methods deselect
5. Proceed with checkout
6. Verify receipt shows "CARD" as payment method

**Expected Results**:
- ✅ Card button highlights with C.violetBg background
- ✅ Only one payment method can be selected
- ✅ Receipt payment method field updated correctly
- ✅ Checkout enabled with card selected

---

### 3. Mobile Transfer/Wallet Payment

**Scenario**: User selects bank transfer (mobile wallet) payment

**Steps**:
1. Add products to cart
2. Tap "Transfer" payment button
3. Verify button selection state
4. Complete checkout
5. Check receipt displays "TRANSFER"

**Expected Results**:
- ✅ Transfer button selects correctly
- ✅ Checkout enabled with transfer selected
- ✅ Receipt shows "TRANSFER" (not "MOBILE_WALLET")
- ✅ Transaction recorded with correct payment method

---

### 4. Customer Selection with Credit Limit Validation

**Scenario**: Select customer with credit limit and validate balance checking

**Test Case A: Customer with Sufficient Balance**:
1. Add products totaling ₦5,000 to cart
2. Tap "Add Customer" button in cart section
3. CustomerSearchModal appears
4. Search and select customer with ₦50,000 credit limit
5. Verify customer name displays under "Add Customer" button
6. Verify balance shows: "Balance: ₦45,000" (₦50,000 - ₦5,000 spent)
7. Proceed with checkout
8. Transaction completes successfully

**Expected Results**:
- ✅ Customer modal opens and displays list
- ✅ Selected customer name and balance display in cart
- ✅ Balance calculation correct (credit_limit - total_spent)
- ✅ Clear button (×) appears next to customer name
- ✅ Receipt shows selected customer details

**Test Case B: Customer with Insufficient Balance**:
1. Add products totaling ₦35,000 to cart
2. Select customer with only ₦10,000 remaining credit
3. Alert appears: "Low Balance" warning
   - Show available balance vs. sale total
   - Offer to proceed or cancel
4. Tap "Proceed" button
5. Transaction completes
6. Tap "Cancel" button
   - Customer selection clears
   - Retry with different customer

**Expected Results**:
- ✅ Alert modal displays with clear messaging
- ✅ Shows both available balance and sale total
- ✅ User can proceed or cancel
- ✅ Cancelling clears customer selection
- ✅ All UI readable on tablet screen

---

### 5. Admin Branch Selection

**Scenario (Admin User Only)**: Admin selects branch before checkout

**Prerequisites**: Test as user with role = 'admin'

**Steps**:
1. Open Checkout as admin
2. Observe branch selector in cart section (below search on left, above customer on right)
3. Default shows "Select branch" (warning message may appear if cart has items)
4. Tap branch selector button
5. Branch dropdown appears with options:
   - "All Branches"
   - "Branch A"
   - "Branch B"
6. Select "Branch A" → dropdown closes, button updates to show "Branch A"
7. Add products to cart
8. Verify no branch warning appears
9. Proceed with checkout
10. Receipt shows branch name: "Branch A"

**Expected Results**:
- ✅ Branch selector visible for admin users only
- ✅ Dropdown modal displays all active branches
- ✅ Selected branch persists in UI
- ✅ Warning clears when branch selected with items in cart
- ✅ Receipt includes branch_name field
- ✅ Switching branch while cart has items triggers confirmation
- ✅ Clearing cart maintains branch selection

**Branch Switch Warning**:
1. Add products to cart
2. Select "Branch A"
3. Attempt to switch to "Branch B"
4. Alert: "Switch Branch? Switching branch will clear the cart."
5. Tap "Cancel" → branch remains "Branch A", cart intact
6. Attempt switch again, tap "Switch & Clear" → cart clears, branch updates

**Expected Results**:
- ✅ Alert displays with clear messaging
- ✅ Cancel returns to previous state
- ✅ Confirm clears cart and updates branch
- ✅ Payment method cleared on cart clear
- ✅ Search query maintained

---

### 6. Barcode Scanning on Tablet

**Scenario**: User scans product barcodes from inventory

**Prerequisites**: Device has camera permission, barcode scanner modal is functional

**Steps**:
1. Tap QR icon in header on product list (left side)
2. BarcodeScannerModal opens with camera feed
3. Scan product barcode (or SKU)
4. Modal closes, product automatically adds to cart
5. Quantity can be incremented further
6. Scan same product again → confirms quantity + 1
7. Scan different product → new item added to cart

**Edge Cases**:
1. Scan invalid/non-existent barcode → Alert: "Product Not Found"
2. Scan while scanner already processing → No duplicate adds
3. Close scanner without scanning → Returns to checkout screen

**Expected Results**:
- ✅ Scanner modal opens fullscreen
- ✅ Scanned products add to cart correctly
- ✅ Product lookup works by barcode or SKU
- ✅ Invalid scans show clear error messages
- ✅ Invalid barcode format handled gracefully
- ✅ Camera feed quality acceptable on tablet

---

### 7. Product Search and Filter on Tablet

**Scenario**: User searches and filters products in tablet layout

**Steps**:
1. Tap search input on left side
2. Type "Electronics" → product grid filters in real-time
3. Verify results count updates: "X PRODUCTS"
4. Clear search using × button
5. Type product name partial: "Pro" → matches "Projector", "Processor", etc.
6. Search by SKU: type "SKU123" → matches products with that SKU
7. Empty search with no results: "No results for X"

**Expected Results**:
- ✅ Search filters both name and SKU
- ✅ Results update as user types
- ✅ Clear button (×) appears when search active
- ✅ Product count updates correctly
- ✅ Empty state message shows when no matches
- ✅ Search doesn't interfere with cart operations

---

### 8. Cart Operations on Tablet (Quantity & Removal)

**Scenario**: Manage items in tablet cart sidebar

**Steps**:
1. Add 3 different products to cart
2. Each item shows in cart with:
   - Product name
   - Quantity × unit_price
   - Line total (₦)
3. Verify quantity controls (-, qty, +) work on tablet
4. Increment product 1 from 1 → 5
5. Decrement product 2 from 3 → 1
6. Remove product 3 using × button
7. Verify cart total recalculates
8. Verify subtotal, VAT, and total update dynamically

**Tablet-Specific Checks**:
- [ ] Touch targets for +/- buttons ≥ 48dp
- [ ] Remove button (×) has adequate hitSlop
- [ ] Cart sidebar scrolls if items exceed viewport
- [ ] Responsive spacing between items (gap: spacing.md)
- [ ] Font sizes readable on tablet

**Expected Results**:
- ✅ All CRUD operations work smoothly
- ✅ Cart totals calculated correctly
- ✅ Each item shows line total (unit_price × quantity)
- ✅ VAT calculated correctly based on tax_rate
- ✅ Checkout button disabled if cart empty
- ✅ Responsive design accommodates all item operations

---

### 9. Receipt Display and Share on Tablet

**Scenario**: Generate receipt and share via native Share API

**Steps**:
1. Complete transaction
2. Receipt modal displays with full layout:
   - Header: "Transaction Complete" + branch name
   - Items section: all products with qty × price breakdown
   - Summary: Subtotal, VAT, Discount (if applicable), Total
   - Payment method indicator
3. Tap "Print / Share" button
4. Native share sheet appears (email, SMS, clipboard, etc.)
5. Select "Copy to Clipboard" → receipt text copied
6. Paste in notes app to verify formatting
7. Verify receipt includes:
   - Receipt number
   - Transaction timestamp
   - All item details
   - Store/branch name
   - Total breakdown

**Receipt Content Validation**:
- [ ] Receipt number matches transaction_id
- [ ] Timestamp formatted correctly (locale-specific)
- [ ] Item quantities and prices match cart
- [ ] Totals match displayed amounts
- [ ] Payment method displays correctly
- [ ] Branch name included if applicable
- [ ] ASCII art borders render correctly in share

**Expected Results**:
- ✅ Receipt modal renders correctly on tablet
- ✅ Share button opens native share sheet
- ✅ Receipt text formats cleanly for sharing
- ✅ All transaction data included
- ✅ Discount section only shows if applicable
- ✅ Payment method label correct (TRANSFER not mobile_wallet)
- ✅ Done button closes receipt and clears cart

---

### 10. Online/Offline Payment Handling

**Scenario A: Online Transaction**:
1. Verify internet connectivity
2. Add products and complete checkout
3. Observe: No "⚠ Offline" warning message
4. Receipt appears immediately
5. Transaction syncs to backend

**Scenario B: Offline Transaction**:
1. Disable network (Airplane mode or offline mode)
2. Add products and attempt checkout
3. Observe: "⚠ Offline — will sync when connected" message in cart
4. Proceed with checkout
5. Receipt displays normally
6. Transaction queued for sync
7. Re-enable network
8. Transaction syncs automatically
9. Verify sync status in sync queue

**Expected Results**:
- ✅ Offline note displays when appropriate
- ✅ Payment processing works offline
- ✅ Transactions queue with offline_session_hash
- ✅ Receipt generates even when offline
- ✅ Sync triggers when connectivity restored
- ✅ No data loss during offline transactions
- ✅ Users notified of sync completion

---

### 11. Tablet Layout Responsiveness

**Scenario**: Test tablet layout across different orientations and sizes

**Test Case A: Portrait Mode (600-899dp)**:
1. Hold tablet in portrait
2. Verify layout maintains 65/35 split
3. Products sidebar width = 65%
4. Cart sidebar width = 35%
5. All UI elements visible
6. No horizontal scrolling

**Test Case B: Landscape Mode (900+dp)**:
1. Rotate to landscape
2. Verify layout adjusts for wider screen
3. Products sidebar may expand
4. Cart remains proportional
5. All buttons and controls accessible

**Test Case C: Split-Screen / Multi-Window**:
1. Open JAYPOS in split-screen (if supported)
2. Verify UI adapts to partial screen width
3. Touch targets remain ≥ 48dp
4. Text remains readable
5. No critical UI hidden

**Responsive Spacing Checks**:
- [ ] paddingHorizontal: isTablet ? spacing.lg : spacing.xl
- [ ] Product cards gap: spacing.md
- [ ] Cart item gap: spacing.md
- [ ] Header and footer padding: spacing.lg/xl
- [ ] Font sizes: fontSize.sm/base/lg/xl

**Expected Results**:
- ✅ Layout adapts to orientation changes
- ✅ Split-screen mode doesn't break UI
- ✅ All elements remain accessible
- ✅ Spacing scales appropriately
- ✅ No text truncation or overlap
- ✅ Touch targets meet accessibility standards

---

### 12. Discount and Tax Calculation

**Scenario**: Verify calculation accuracy for VAT and discounts

**Test Case A: VAT Calculation**:
1. Add product with price ₦1,000 and tax_rate = 7.5%
2. Quantity: 2
3. Expected:
   - Line total: ₦2,000
   - Line tax: ₦2,000 × 7.5% = ₦150
   - Subtotal: ₦2,000
   - VAT: ₦150
   - Total: ₦2,150
4. Verify cart summary matches

**Test Case B: Multiple Items with Different Tax Rates**:
1. Add Product A: ₦500 × 2, tax = 5% → tax = ₦50
2. Add Product B: ₦1,000 × 1, tax = 7.5% → tax = ₦75
3. Expected:
   - Subtotal: ₦2,000
   - Total VAT: ₦125
   - Total: ₦2,125
4. Verify cart summary

**Expected Results**:
- ✅ Tax calculated per item: (unit_price × qty × tax_rate / 100)
- ✅ VAT summed correctly across items
- ✅ Rounding to 2 decimals (₦X.XX)
- ✅ Cart summary matches manual calculation
- ✅ Receipt displays correct breakdown

---

### 13. Touch Target Sizing on Tablet

**Scenario**: Verify all interactive elements meet accessibility standards

**Elements to Check** (each should be ≥ 48dp):
- [ ] Product card + button (56dp × 56dp)
- [ ] Quantity +/- buttons (24dp × 24dp on tablet)
- [ ] Cart item remove button (24dp × 24dp, but has hitSlop)
- [ ] Payment method buttons (flex with padding)
- [ ] Branch selector button
- [ ] Customer selector button
- [ ] Search input clear button (16dp icon, 48dp+ hitSlop)
- [ ] Checkout button (48dp height minimum)
- [ ] Receipt action buttons (56dp height)
- [ ] Header icon buttons (40dp × 40dp)

**Test Procedure**:
1. Use developer tools to inspect computed dimensions
2. Or use touch-sensitive screen and verify responsive feel
3. Ensure no buttons require precise finger positioning
4. Test with gloved hand (simulate real-world tablet use)

**Expected Results**:
- ✅ All interactive elements ≥ 48dp
- ✅ Sufficient padding around touch targets
- ✅ No accidental double-taps needed
- ✅ Comfortable interaction distance
- ✅ Spacing prevents mis-touches

---

### 14. Error Handling and Edge Cases

**Test Case A: Empty Cart Checkout**:
1. Clear all items from cart
2. Attempt to tap Checkout
3. Button should be disabled
4. No action on tap

**Expected Results**:
- ✅ Checkout button visually disabled (s.chargeBtnDisabled)
- ✅ Button text color changes to muted
- ✅ onPress handler returns early with alert

**Test Case B: No Payment Method Selected**:
1. Add products
2. Leave payment method unselected
3. Attempt checkout
4. Alert: "Select Payment: Choose a payment method first"

**Expected Results**:
- ✅ Alert displays clearly
- ✅ User returned to checkout screen
- ✅ Can select payment method and retry

**Test Case C: Admin Missing Branch Selection**:
1. Login as admin
2. Add products to cart
3. Leave branch selector as "Select branch"
4. Attempt checkout
5. Alert: "Select Branch: Choose a specific branch before processing."

**Expected Results**:
- ✅ Admin cannot proceed without branch
- ✅ Warning message in cart visible
- ✅ Checkout disabled until branch selected
- ✅ Clear error messaging

**Test Case D: Product Data Missing**:
1. (Rare scenario) Product with missing name or ID
2. Attempt to add product
3. Alert: "Error: Product data missing"

**Expected Results**:
- ✅ Graceful error handling
- ✅ Product not added to cart
- ✅ User can continue with other products

---

### 15. Performance and Responsiveness

**Scenario**: Test app responsiveness during typical payment flow

**Metrics to Observe**:
- [ ] Product list FlatList scroll FPS (≥ 55 FPS on tablet)
- [ ] Cart updates (quantity change) response time (< 200ms)
- [ ] Checkout processing (< 3 seconds for successful transaction)
- [ ] Receipt modal display time (< 1 second)
- [ ] Search filtering (< 100ms for 500 products)

**Test Procedure**:
1. Use React Native debugger to monitor performance
2. Profile screen during checkout flow
3. Check for janky frames or lag
4. Monitor Redux actions and state updates
5. Verify no memory leaks on repeated transactions

**Expected Results**:
- ✅ Smooth 60 FPS scrolling (or 120 FPS on high-refresh tablets)
- ✅ Instant visual feedback on touches
- ✅ No noticeable lag during cart operations
- ✅ Checkout completes within reasonable time
- ✅ No app crashes or freezes

---

## Test Execution Log

### Test Summary Template

| Test Case | Status | Notes | Screenshots | Date |
|-----------|--------|-------|-------------|------|
| 1. Basic Cash Payment | ✅ Pass | Cart updates correctly, receipt displays all items | [IMG1] | 2026-05-22 |
| 2. Card Payment | ✅ Pass | Button state changes, receipt shows CARD method | [IMG2] | 2026-05-22 |
| 3. Mobile Transfer | ✅ Pass | Transfer button selects, receipt shows TRANSFER | [IMG3] | 2026-05-22 |
| ... | | | | |

---

## Known Issues & Limitations

1. **Barcode Scanner on Emulator**: May not work on Android emulator; test on physical device
2. **Offline Sync**: Requires actual network disconnect (Airplane mode) to test properly
3. **Branch Selection**: Only visible for admin users; create test admin account
4. **Customer Credit Limits**: Depends on test customer setup with credit_limit field populated
5. **Screen Size Variance**: Tablet dimension cutoff is 600dp; test on devices near threshold

---

## Success Criteria

✅ All payment methods selectable and functional  
✅ Customer credit limit validation works end-to-end  
✅ Admin branch selection enforced and persisted  
✅ Cart operations (add, inc, dec, remove) responsive  
✅ Receipt generation includes all transaction details  
✅ Share functionality works with native apps  
✅ Offline transactions queue and sync on reconnect  
✅ Tablet layout responsive across orientations  
✅ All touch targets meet 48dp minimum standard  
✅ Font sizes readable without zoom  
✅ No horizontal scrolling on tablet in portrait  
✅ VAT and discount calculations accurate  
✅ Error messages clear and actionable  
✅ Performance meets 60 FPS standard  

---

## Regression Testing Checklist

After any code changes to payment flow, verify:
- [ ] Cash/Card/Transfer payment methods work
- [ ] Customer selection and credit limit check
- [ ] Admin branch selection and validation
- [ ] Receipt generation and sharing
- [ ] Online/Offline payment handling
- [ ] Cart CRUD operations
- [ ] Barcode scanning
- [ ] Tax and discount calculations
- [ ] Tablet layout responsiveness
- [ ] Touch target accessibility
- [ ] Error handling for edge cases

---

## Test Artifacts

### Test Data Export
```json
{
  "test_products": [
    { "id": "prod_001", "name": "Laptop", "price": 500000, "tax_rate": 7.5 },
    { "id": "prod_002", "name": "Mouse", "price": 5000, "tax_rate": 5 }
  ],
  "test_customers": [
    { "id": "cust_001", "name": "John Doe", "credit_limit": 50000, "total_spent": 0 },
    { "id": "cust_002", "name": "Jane Smith", "credit_limit": 10000, "total_spent": 5000 }
  ],
  "test_branches": [
    { "id": "branch_001", "name": "Branch A" },
    { "id": "branch_002", "name": "Branch B" }
  ]
}
```

### Screenshots Location
Save all screenshots to: `/test-results/tablet-payment-flows/[test-case-name]/`

### Device Specs for Documentation
- Device Model: [e.g., Samsung Galaxy Tab S10]
- Screen Size: [e.g., 10.5 inches]
- OS Version: [e.g., Android 14]
- Density: [e.g., 240 DPI]
- Orientation: [Portrait/Landscape/Both]

---

## Sign-Off

- **Tester Name**: _______________
- **Date Completed**: _______________
- **Test Environment**: _______________
- **Issues Found**: _______________
- **Approved For Release**: [ ] Yes [ ] No

