# CODEX HANDOFF: MobilePOS Inventory & Services Study

## Status

**PHASE: ARCHITECTURAL STUDY ONLY**

Codex must NOT modify the codebase during this phase.

This handoff is intended to be uploaded into Codex alongside the existing MobilePOS repository.

The objective is to understand the existing implementation and produce a safe implementation plan for adding Products + Services and decimal inventory quantities.

---

# 1. PROJECT CONTEXT

This is an existing **offline-first Mobile POS application**.

The application currently handles physical products and inventory.

The business also serves businesses such as:

- Salons
- Pedicure shops
- Spas
- Barbershops
- Other service businesses

These businesses sell both:

1. Physical products
2. Services

Examples of services:

- Pedicure
- Manicure
- Hair washing
- Hair styling
- Massage
- Hair treatment

The current workaround is to create services as normal products and give them an imaginary quantity.

Example:

```text
Pedicure
Category: Services
Quantity: 999
Cost price: ₦3,000
Selling price: ₦10,000
```

This is not a correct inventory model because a service is not physical stock.

---

# 2. PRIMARY OBJECTIVE

Study the existing MobilePOS codebase and determine the **smallest, safest, backward-compatible implementation** that can eventually support:

```text
PRODUCT
SERVICE
```

without rebuilding the application.

The eventual first phase should allow:

### Product

A physical inventory item.

### Service

A sellable service that does not have physical inventory quantity.

---

# 3. CRITICAL SAFETY RULE

## DO NOT MODIFY CODE DURING THIS STUDY

Codex must not:

- Create files
- Delete files
- Rewrite files
- Refactor code
- Change database schemas
- Run migrations
- Install packages
- Change APIs
- Change Redux/state architecture
- Change navigation
- Change offline synchronization
- Change authentication
- Change branch/store architecture
- Fix unrelated issues

The purpose of this task is **research, architecture discovery, risk analysis, and planning**.

Implementation will happen only after the study is reviewed and explicitly approved.

---

# 4. READ THE EXISTING CODE FIRST

Inspect the entire relevant codebase.

Identify the actual architecture for:

- Products
- Inventory
- Sales
- Cart
- Checkout
- Store
- Branch
- Local persistence
- Offline mode
- Synchronization
- State management
- API
- Reporting

Do not assume how the application works. Follow the actual code.

---

# 5. PRODUCT MODEL AUDIT

Find the current Product model/interface/type/schema.

Document:

- Exact file path
- Fields
- Data types
- Required fields
- Optional fields
- Quantity type
- Cost price type
- Selling price type
- Category relationship
- Store relationship
- Branch relationship
- Sync fields
- Created/updated timestamps
- Soft deletion
- Inventory-related fields

Show the actual current structure. Do not modify it.

---

# 6. ITEM TYPE INVESTIGATION

Search the entire repository for existing concepts such as:

```text
type
productType
itemType
isService
serviceType
item_type
```

Determine whether an existing abstraction can support:

```text
PRODUCT
SERVICE
```

The preferred conceptual model is:

```text
ITEM
 |
 +-- PRODUCT
 |
 +-- SERVICE
```

However, do NOT assume a new `Item` model is required.

Determine whether the existing Product model can safely be extended with something like:

```text
itemType: PRODUCT | SERVICE
```

If that is the safest approach, recommend it.

If not, explain why.

---

# 7. CATEGORY AUDIT

The existing system may use a category such as:

```text
Services
```

Do not use category names as the primary mechanism for determining whether an item is a service.

Avoid logic such as:

```text
if category.name === "Services"
```

unless the existing application already intentionally depends on that behavior.

Determine how categories currently work:

- Global or store-specific?
- Branch-specific?
- Used by reports?
- Used by filters?
- Used in validation?
- Used by inventory calculations?

---

# 8. QUANTITY AUDIT

This is one of the most important parts of the investigation.

Trace the existing quantity field through the whole application.

Find every place where quantity is:

- Defined
- Validated
- Parsed
- Converted
- Rounded
- Stored
- Loaded
- Displayed
- Incremented
- Decremented
- Compared
- Calculated
- Sent to API
- Received from API
- Stored locally
- Synchronized

Look specifically for:

```text
parseInt()
Math.floor()
Math.round()
Number.parseInt()
integer validation
```

Determine whether quantity is:

```text
integer
decimal/number
string
other
```

---

# 9. DECIMAL QUANTITY REQUIREMENT

The future system needs to support fractional physical inventory.

Example:

A salon has shampoo.

Instead of only:

```text
10 bottles
```

the system may need to represent:

```text
9.45
```

or another fractional quantity.

The immediate requirement is simply:

**Do not force physical stock quantities to integers.**

Do NOT yet introduce a complete measurement/unit-conversion system.

Do NOT introduce:

- ml
- litres
- grams
- kilograms
- conversion tables
- complex unit management

Those are future phases.

Determine whether the existing quantity system can be safely changed to support decimals with minimal impact.

---

# 10. INVENTORY AUDIT

Identify all inventory-related code.

Find:

- Inventory screens
- Stock adjustment
- Stock movement
- Stock deduction
- Restocking
- Inventory valuation
- Low-stock logic
- Inventory history
- Inventory APIs
- Local inventory state

Determine how stock is currently changed.

Map:

```text
Purchase/restock
      ↓
Inventory
      ↓
Sale
      ↓
Stock deduction
      ↓
Inventory balance
```

---

# 11. INVENTORY VALUATION AUDIT

Find exactly how physical inventory value is calculated.

For example, determine whether the application uses:

```text
quantity × costPrice
```

or another formula.

Then determine what happens if a service currently has:

```text
quantity = 999
costPrice = ₦3,000
```

Would the service incorrectly increase inventory value?

Document every affected calculation.

The future design must ensure:

```text
PRODUCT
→ contributes to physical inventory valuation

SERVICE
→ does not contribute to physical inventory valuation
```

---

# 12. SALES FLOW AUDIT

Trace the entire sales lifecycle.

Find:

```text
Product selection
      ↓
Cart
      ↓
Checkout
      ↓
Payment
      ↓
Sale
      ↓
Sale item
      ↓
Inventory deduction
      ↓
Receipt
      ↓
Sales history
```

Identify the actual files, models, functions, hooks, services, and API endpoints involved.

Determine whether the existing sale-line structure can support both:

```text
PRODUCT
SERVICE
```

without major restructuring.

---

# 13. CART AUDIT

Determine:

- Cart item structure
- Quantity handling
- Price handling
- Cost handling
- Product IDs
- Variant handling
- Discount handling
- Tax handling
- Offline cart persistence

Determine whether a Service can use the same cart architecture.

The desired eventual behavior is:

```text
Cart

Shampoo       1 × ₦5,000
Pedicure      1 × ₦10,000

Total         ₦15,000
```

At checkout:

```text
Shampoo:
Reduce inventory.

Pedicure:
Do not reduce physical inventory.
```

---

# 14. OFFLINE-FIRST AUDIT

This is a critical area.

Map exactly how offline operation works.

Identify:

- Local database
- AsyncStorage/MMKV/SQLite/etc.
- Redux persistence
- Offline queue
- Sync engine
- Retry logic
- Conflict handling
- Local IDs
- Server IDs
- Synchronization timestamps
- API retry behavior

Trace:

## Offline product creation

```text
User
 ↓
UI
 ↓
State
 ↓
Local persistence
 ↓
Sync queue
 ↓
Server
```

## Offline sale

```text
Cart
 ↓
Checkout
 ↓
Local transaction
 ↓
Inventory update
 ↓
Sync queue
 ↓
Server
```

Determine risks associated with introducing:

```text
itemType = SERVICE
```

and:

```text
quantity = decimal
```

---

# 15. STORE AND BRANCH AUDIT

The application has store/branch concepts.

Determine:

- Store model
- Branch model
- Product ownership
- Inventory ownership
- Sale ownership
- Branch filters
- User permissions
- Cashier permissions
- Manager permissions

Determine whether the new Service item can follow the existing store/branch architecture without changes.

Do not redesign branch management.

---

# 16. UI AUDIT

Find the existing screens for:

- Product list
- Inventory
- Add Product
- Edit Product
- Product details
- Cart
- Checkout
- Sales history

Determine the minimum UI changes needed.

The future Add Product experience should conceptually become:

```text
Item Type

○ Product
○ Service
```

Product:

```text
Name
Category
Cost price
Selling price
Quantity
Branch
```

Service:

```text
Name
Category
Cost price
Selling price
Branch
```

Services should not require physical stock quantity.

Do not redesign the application.

---

# 17. SERVICE MODEL

The initial service implementation should be intentionally simple.

A Service should have:

```text
Type: SERVICE
Name
Category
Cost price
Selling price
Store/Branch
```

A Service should:

- Be sellable
- Appear in cart
- Appear on receipts
- Appear in sales history
- Generate revenue
- Not have physical stock
- Not reduce physical inventory
- Not contribute to physical inventory valuation

---

# 18. SERVICE COST

For Phase 1, service cost can be manually entered.

Example:

```text
Pedicure
Selling price: ₦10,000
Cost price: ₦3,000
```

This allows:

```text
Gross profit
=
Selling price - Cost price
```

Do NOT automatically calculate service cost from inventory in Phase 1.

---

# 19. FUTURE SERVICE CONSUMPTION

The long-term system should eventually support services that consume inventory.

Example:

```text
Hair Wash
    ↓
Shampoo
    ↓
Conditioner
```

But consumption varies.

Example:

```text
Customer A:
30 ml shampoo

Customer B:
50 ml shampoo

Customer C:
75 ml shampoo
```

Therefore the future architecture should support:

```text
Service
 ↓
Expected consumption
 ↓
Actual consumption
 ↓
Inventory movement
 ↓
Variance
 ↓
Actual material cost
```

Example:

```text
Expected:
50 ml

Actual:
70 ml

Variance:
+20 ml
```

---

# 20. FUTURE VARIABLE CONSUMPTION

A future version may support:

```text
Small: 30 ml
Medium: 50 ml
Large: 80 ml
```

or service variants:

```text
Short Hair
Medium Hair
Long Hair
```

Do NOT implement this now.

The current architecture study should only determine whether Phase 1 leaves a clean path for this future capability.

---

# 21. FUTURE SERVICE RECIPES

Eventually:

```text
SERVICE
 |
 +-- COMPONENTS
       |
       +-- Shampoo
       +-- Conditioner
       +-- Lotion
```

Each component may have an expected quantity.

Again:

**DO NOT IMPLEMENT THIS NOW.**

Only identify what architectural changes would eventually be required.

---

# 22. FUTURE ACTUAL CONSUMPTION

The long-term objective is to record actual consumption.

Example:

```text
Hair Wash

Expected shampoo:
50 ml

Actual shampoo:
70 ml

Variance:
20 ml
```

Inventory should eventually deduct the actual quantity.

This will allow the business owner to understand:

- Material consumption
- Waste
- Overuse
- Service cost
- Service profitability
- Expected vs actual consumption

But this is future scope.

---

# 23. REPORTING AUDIT

Find current:

- Sales dashboard
- Revenue report
- Product sales report
- Profit report
- Inventory valuation
- Daily sales
- Transaction reports

Determine whether reports currently assume every sellable item is a physical product.

The future reporting model should eventually distinguish:

```text
Product Sales
Service Sales
Total Sales
```

and:

```text
Physical Inventory Value
```

should exclude services.

---

# 24. DATA MIGRATION REQUIREMENT

Existing products are important production data.

The eventual implementation must preserve them.

Existing products should safely become:

```text
itemType = PRODUCT
```

unless there is an existing reliable field that proves an item is a service.

Do NOT guess that a category named `Services` means every item should be converted.

If existing services cannot be safely identified, report the problem and propose a migration strategy.

Do not perform the migration during this study.

---

# 25. BACKWARD COMPATIBILITY

Existing functionality must remain valid.

Existing:

```text
Product
Quantity: 10
```

must continue to work.

Existing sales must continue to work.

Existing inventory must continue to work.

Existing offline functionality must continue to work.

Existing branch/store logic must continue to work.

Existing reports must not silently change meaning.

---

# 26. RISK ASSESSMENT

Identify risks and classify them:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Pay special attention to:

- Database changes
- Quantity precision
- Offline sync
- Cached data
- API compatibility
- Inventory valuation
- Existing sales
- Branch isolation
- Migration
- Reporting

---

# 27. REQUIRED OUTPUT

After studying the codebase, produce a report with these exact sections:

## A. Executive Summary

Explain the current architecture and whether it can support the proposed change safely.

## B. Current Architecture

Describe:

- Frontend
- State management
- Local persistence
- Backend/API
- Offline sync
- Sales
- Inventory
- Store/branch

## C. Product Data Model

Show the current Product model with exact file path.

## D. Quantity Flow

Show exactly how quantity flows through the system.

## E. Sales Flow

Show exactly how products become completed sales.

## F. Inventory Flow

Show exactly how inventory is changed.

## G. Inventory Valuation

Show exactly how current valuation is calculated.

## H. Offline/Sync Flow

Explain how offline products, inventory, and sales synchronize.

## I. Service Feasibility

Explain how easily the existing system can support PRODUCT + SERVICE.

## J. Decimal Quantity Feasibility

Explain whether the current quantity architecture can support decimals safely.

## K. Minimal Phase 1 Architecture

Recommend the smallest safe change.

## L. Exact Files Likely to Change

For each file provide:

```text
File:
Purpose:
Why it changes:
Expected change:
Risk:
```

## M. Database/API Changes

Identify required changes, but do not implement them.

## N. Migration Strategy

Explain how existing production data can be preserved.

## O. Testing Strategy

Include:

- Unit tests
- Integration tests
- UI tests
- Offline tests
- Sync tests
- Regression tests

## P. Risks

List all identified risks and severity.

## Q. Systems That Should NOT Be Changed

Explicitly identify architecture that should remain untouched.

## R. Future Service Consumption Architecture

Explain how the system could eventually support:

```text
Service
 ↓
Expected Consumption
 ↓
Actual Consumption
 ↓
Inventory Deduction
 ↓
Variance
 ↓
Actual Cost
 ↓
Profitability
```

without implementing it now.

## S. Recommended Implementation Sequence

Provide a safe step-by-step implementation plan.

## T. Final Decision

End with exactly:

```text
READY FOR IMPLEMENTATION: YES
```

or:

```text
READY FOR IMPLEMENTATION: NO
```

If NO, explain what must be resolved first.

---

# 28. SUCCESS CRITERIA

A successful study should allow another developer or coding agent to implement Phase 1 without guessing.

The report should answer:

1. Where should `itemType` live?
2. Can the existing Product model be reused?
3. Where does quantity need to change to support decimals?
4. Which database/API fields need modification?
5. Which screens need modification?
6. Which sales logic needs modification?
7. Which inventory logic needs modification?
8. Which reports need modification?
9. What happens to offline synchronization?
10. How will existing data be migrated safely?
11. What must remain untouched?
12. What tests must pass before deployment?

---

# 29. NON-NEGOTIABLE PRINCIPLE

The existing MobilePOS is more important than the new feature.

The implementation should eventually follow:

```text
Existing working system
        ↓
Smallest safe extension
        ↓
Backward compatible
        ↓
Test thoroughly
        ↓
Deploy
```

Not:

```text
New requirement
        ↓
Rewrite existing architecture
```

The first release should be intentionally small.

The advanced inventory/service system can be introduced later.

---

# 30. FINAL INSTRUCTION TO CODEX

**Study first.**

**Understand second.**

**Plan third.**

**Wait for approval.**

Do not implement anything during this task.

The desired result is a high-confidence architectural map and implementation plan for safely adding Product/Service support and decimal inventory quantities to the existing MobilePOS.
