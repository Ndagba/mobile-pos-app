# MobilePOS Phase 1 Developer Handoff (v2)
## Safe Foundation for Inventory and Services Integration (Adaptive Store Type Model)

This handoff document details the technical strategy, data model extensions, business logic rules, and safety guardrails required to implement **Phase 1: Safe Foundation** of the MobilePOS Inventory and Services Integration [1, 20]. It incorporates the **Adaptive Store Type configuration**, which allows live retail stores to remain completely unaffected by default, while enabling modular, opt-in service integrations [9, 22].

---

## 1. Core Philosophy: "Boring, Small, and Reversible"
*   **Do NOT rebuild the inventory system** or replace the existing offline-first state architecture [9, 19].
*   **Extend rather than replace.** Use modular conditional blocks (switchboards) based on store configuration rather than branching the codebase [19, 22].
*   **Zero Impact on Active Users:** Active stores default to `PRODUCT_ONLY` mode [9]. They will see absolutely zero UI changes or performance overhead [15, 16].

---

## 2. Store Type Configuration & Schema Updates

To prevent retail-only stores from being cluttered with service options, we introduce a Store-level setting to dynamically adapt the app layout [18, 22].

### A. Store/Merchant Model Schema Update
Add a new field to the Store/Merchant database schema:
*   **Field Name:** `store_type`
*   **Data Type:** `VARCHAR` / `ENUM`
*   **Allowed Values:**
    *   `PRODUCT_ONLY` (Standard physical retail workflow. Default)
    *   `SERVICE_ONLY` (Services-only workflow, e.g., pure consulting or massage therapy)
    *   `MIXED` (Both physical products and services, e.g., salon/spa/barbershop)
*   **BACKWARD COMPATIBILITY GUARDRAIL:** During database migration, all existing live stores must have `store_type` set to `PRODUCT_ONLY` [9]. This isolates the active user base from any risk of accidental UI disruption.

### B. Item Model Schema Update
Add `item_type` to the item model [9]:
*   **Field Name:** `item_type`
*   **Data Type:** `VARCHAR` / `ENUM`
*   **Allowed Values:** `PRODUCT` or `SERVICE` [9]
*   **BACKWARD COMPATIBILITY GUARDRAIL:** All existing item records must default to `PRODUCT` upon migration to prevent data loss or type mismatch [9].

### C. Quantity/Stock Column Update
Modify the local SQLite and remote API database column type for inventory stock from integer to a decimal/numeric format (e.g., `DECIMAL(10, 3)` or `NUMERIC`) to support fractional consumption of physical goods [3, 17].

---

## 3. Adaptive UI Switchboard Mapping

The React Native UI must dynamically query the active store’s `store_type` from the global Redux state and adjust the layout according to the matrix below:

| UI Area / Component | `PRODUCT_ONLY` (Default Live State) | `SERVICE_ONLY` (Pure Services) | `MIXED` (Products & Services) |
| :--- | :--- | :--- | :--- |
| **"Add Item" Form** [15] | • Standard layout (Product-only).<br>• Hides Item Type selector.<br>• Quantity field remains mandatory. | • Hides Item Type selector.<br>• Defaults entirely to Service behavior.<br>• Hides Stock, Restock, and Alert fields. | • Displays **Item Type Toggle** (Product/Service) [15].<br>• Dynamically masks input fields based on active type selection. |
| **Inventory Catalog** [16] | • Standard layout (shows stock).<br>• No type filters active. | • Hides stock levels and "Out of Stock" alerts.<br>• Hides "Restock" buttons. | • Displays filters: `[All] [Products] [Services]` [16].<br>• Products display actual physical quantities [16].<br>• Services display stock as `N/A` or blank [16]. |
| **Analytics & Reports** [14] | • Standard Physical Asset Valuation [12].<br>• Standard Sales Volume Reports. | • Hides "Inventory Valuation" dashboard (value is ₦0) [12].<br>• Standard Revenue Reports. | • Displays the split: Product Sales vs. Service Sales [14].<br>• Excludes Services from physical asset inventory valuation [12]. |

---

## 4. Conditional UI Masking & Validation Rules (Phase 1)

When a merchant operates in a `MIXED` store, the "Add Item" screen must apply strict input masking and client-side validation rules [15]:

### A. When `item_type === PRODUCT` Selected:
*   **Name, Category, Cost Price, Selling Price, and Branch** are required [15].
*   **Quantity/Stock** is required (supports decimals; e.g., `10`, `9.5`, `8.25`) [3, 15].
*   Standard inventory warning thresholds apply.

### B. When `item_type === SERVICE` Selected:
*   **Name, Category, Selling Price, and Branch** are required [15].
*   **Cost Price** is optional (representing manual/estimated cost for basic margin analysis) [5, 11].
*   **Quantity/Stock** and **Restock Trigger** fields must be disabled, hidden, or locked to null [15]. A service cannot have physical stock [11].

---

## 5. Offline-First & Data Integrity Guardrails

Because MobilePOS operates in offline-first environments, all data additions must integrate cleanly with local Redux stores, local storage, and the synchronization queue [17].

### 1. Standardized Decimal Precision Guardrail
*   To prevent floating-point calculation errors during offline state reconstruction, we must enforce a strict **three-decimal-place limit** (e.g., `.000`) across Redux actions, SQLite database queries, and JSON API schemas [17].
*   Example: A salon bottle of shampoo is stored in milliliters as `10.000` units rather than float-point integers.

### 2. "Mixed-Cart" Historical Transaction Logging
*   When checking out, the receipt database must record the exact `item_type` (`PRODUCT` or `SERVICE`) on each cart line-item *at the moment of transaction* [13].
*   **Why:** If a merchant subsequently edits an item to change its type, the historical sales report for earlier transactions remains unaffected. This preserves accurate sales splits (Product Sales vs. Service Sales) [14].

### 3. Valuation Query Safety Filter
*   The inventory valuation report (`SUM(cost_price * quantity)`) must have a hardcoded, database-level safety clause: `WHERE item_type = 'PRODUCT'` [12].
*   This makes it mathematically impossible for service item margins to skew physical inventory valuation, even if an estimated cost price is manually assigned to the service [12].

### 4. Offline Sync Circuit Breaker
*   Update the offline synchronization queue engine with a validation filter [17]:
    *   If any outgoing offline sync payload contains a transaction trying to update stock levels for an item marked `item_type = SERVICE`, the payload must be flagged.
    *   This prevents corrupted offline queues from accidentally decrementing/incrementing imaginary stock on service lines during syncing [17].

### 5. Transitioning Existing Workaround Services
For live stores that upgrade to `MIXED` store types:
*   They may have previously created "Services" (e.g., "Pedicure") as products under a manual "Services" category with dummy stock quantities like `999` [2].
*   We should provide a **one-time bulk-conversion script** triggered in the UI. When selected, it converts items in that specific category to `item_type: SERVICE` and automatically clears the dummy stock level to `null` to restore the accuracy of their physical inventory valuation [12, 16].

---

## 6. Store Isolation Rules
*   All new fields (`store_type`, `item_type`) must respect the existing merchant/branch schema boundaries [18].
*   **Never allow service items created under Store A to be synced or rendered in Store B [18].** All branch-filtering, manager permissions, and cashier rules remain strictly locked to their current isolation models [18].

---

## 7. Profile Editing & Reversibility Rules
Merchants can change their `store_type` in their business profile (e.g., moving from `PRODUCT_ONLY` to `MIXED` as their operations grow).
*   **The "No-Deletion" Rule:** If a merchant downgrades from `MIXED` back to `PRODUCT_ONLY`, **no database deletion should occur** [19].
*   Existing services and historical sales records must remain completely intact in the local database to preserve financial histories and receipts [13].
*   The change in `store_type` simply triggers the UI Switchboard to hide the services filters and item selectors, reverting the app's visual state back to a clean, retail-only view [15, 16].

---

## 8. Verification & QA Checklist for Developers

Before merging Phase 1 modifications, developers must verify:
- [ ] **Default Migration:** Do existing stores default to `PRODUCT_ONLY` and existing items default to `PRODUCT`? [9]
- [ ] **Decimal Support:** Can a user input and sync fractional values like `9.45` stock for physical products without local DB crashes or rounding mismatch? [3, 17]
- [ ] **Valuation Integrity:** Does the physical inventory asset valuation exclude service items, even if a service has a defined `cost_price`? [12]
- [ ] **Adaptive UI rendering:** Does changing `store_type` on the store level instantly adjust the Add Item screen, Inventory view, and Reports without requiring an app restart? [15, 16]
- [ ] **Zero Performance Overheads:** Ensure offline queue operations, indexing, and item retrieval remain within normal runtime boundaries on low-end hardware.
