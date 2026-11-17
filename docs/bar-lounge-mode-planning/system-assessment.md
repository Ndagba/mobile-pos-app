# System Assessment — JayPOS as it exists today

> Bar / Lounge Mode planning · document 1 of 8 · written 2026‑11‑17
> Every fact below was verified against the working tree on `develop` (HEAD `7813c11c`). Where an older doc and the code disagree, the code is what is recorded here.

---

## 1. Project structure

| Folder | Stack | Role |
|---|---|---|
| `backend/` | Node + Express + Prisma + PostgreSQL + Redis | Single API under `/v1/*` for every client. |
| `mobile/` | Expo SDK 54 / React Native 0.81 / Redux Toolkit | Phone/tablet POS (JayPOS v2.4.1). Offline-first for sales via AsyncStorage. |
| `desktop/` | Next.js 14 App Router PWA, TanStack Query, Zustand, Dexie | Browser POS + back-office. Offline sales via IndexedDB; back-office screens are online-only. |
| `shared/` | Pure TypeScript (`@jaypos/shared`, vitest) | Ports (`IApiClient`, `IOfflineStore`, `INetwork`), transaction build/queue/sync, offline hash, cart math, types. |

One backend, one database, one auth system serve both clients. **This is the most important fact for the expansion:** whatever Bar / Lounge mode needs must land in the same backend and be read by both clients. Nothing needs a second system.

---

## 2. Backend architecture

- **Routing:** 23 route files in `backend/src/api/routes/`. Services hold the business logic: `TransactionService`, `InventoryService`, `PurchaseOrderService`, `ExpenseService`, `FinancialService`, `AuditService`, `AuthService`, subscription services.
- **Response shape:** `{ status: 'success', data, [pagination] }`.
- **Validation:** written by hand in each route with `AppError(400, …)`. Joi is installed but not used.
- **Background jobs:** one cron (`backend/src/jobs/billingCron.ts`). So the codebase already has a pattern for scheduled jobs. Bar mode should not need one (see the carry-forward design).
- **Transactions:** multi-row writes use `prisma.$transaction(async tx => …)`. This holds for sales, voids, refunds and PO receiving.

---

## 3. Authentication & authorization

| Aspect | Today |
|---|---|
| Auth | JWT HS256. 24 h access token, 7 d refresh token. Claims: `{ userId, email, role, storeId, branchId, is_super_admin }`. |
| Roles | `User.role` is a plain string: `admin`, `manager` or `cashier`. `AuthService` types and the `PATCH /auth/users/:id/role` validator only accept these three. |
| Super admin | `User.is_super_admin` boolean. Platform operator; the only user who can create stores. |
| Enforcement | **Inline per route.** Most routes check `role !== 'admin' && role !== 'manager'`. A few check `role === 'cashier'` (for example `analytics.routes.ts:41` `isCashier = role === 'cashier'`, which scopes dashboard data to the cashier's own sales). `roleMiddleware` exists but is effectively unused. |
| Branch scoping | `utils/branchHelper.ts`: admin gets all store branches, manager gets home + `ManagerBranch` rows, **anything else is treated as a cashier and gets the home branch only**. |
| Store toggles | `StoreSetting` holds cashier permission flags (`allow_cashier_refund`, `allow_cashier_discount`, `max_discount_percent`, customer/supplier menu toggles). |
| Client gating | Desktop: `desktop/lib/roles.ts` helpers + `components/layout/nav.ts` + per-section `layout.tsx` redirect guards. Mobile: `ROLE_TABS` map in `mobile/src/App.tsx`. Both show or hide only; the backend is the authority. |

**Why this matters for Bar mode:** role checks are written in two opposite styles. Some test "is admin/manager". Others test "is literally `cashier`". If a new `role` string were added (for example `cashier_two`), it would get cashier-level access on the first style but **would escape the cashier-only scoping on the second style**. For example, the dashboard analytics would show it store-wide data. This drives the recommendation in `proposed-architecture.md` to keep `role = 'cashier'` and add a separate *operational profile*.

---

## 4. Store / tenant management

- **Tenant = `store_id`**, a plain string like `store_001`. It is not FK-enforced on most tables. `Store` is a registry row (`name`, `currency`, trial fields) with a 1:1 `Subscription`.
- **Store creation** (`stores.routes.ts`) is **super-admin only**. It atomically creates the `Store` row and its first `admin` user. There is no self-serve store sign-up and no setup wizard for the owner. So "select a mode at store creation" means the super-admin store wizard, plus an owner-facing choice in Settings before the first sale.
- **Multi-branch:** `Branch` belongs to a store. Products, categories, locations, transactions, shifts, movements, expenses and POs are all branch-scoped.
- **Store-level config:** `StoreSetting` (1 row per store, lazily created by `GET /v1/settings`, edited by admin/manager via `PATCH /v1/settings`).

---

## 5. Sales workflow (the most important thing to understand)

Path: client cart → `POST /v1/transactions` (online) or `POST /v1/transactions/batch` (offline sync) → `TransactionService.createTransaction`.

1. **Idempotency:** looks up `offline_session_hash` (unique). If it exists, it returns the existing row.
2. **One DB transaction** that:
   - creates the `Transaction` header with `status='completed'` and `payment_status='completed'`. **A sale is born completed. There is no pending or draft state anywhere in the sales model.**
   - for each line: loads the product. For a `PRODUCT`, it checks `quantity_on_hand ≥ qty`, decrements stock, writes a `sale` `InventoryMovement` and snapshots `cost_price`. For a `SERVICE`, it does the same for each `PART` component and adds `LABOR` cost.
   - writes `TransactionItem` rows.
   - updates `Customer.total_spent` / `transaction_count`.
3. Writes an `APPLY_DISCOUNT` audit row if a discount was given.

Key properties:

| Property | Today | Implication for Bar mode |
|---|---|---|
| Attribution | `user_id` is **always the JWT user who posted the request** (`transactions.routes.ts:26`). | Cashier One posts the sale, but it must be attributed to Cashier Two. That needs a **server-side** attribution path. A client-supplied `user_id` must never be trusted. |
| Totals | `subtotal`/`tax_amount`/`total_amount` are **client-computed and stored as sent.** | Bar orders should use **server-computed** totals, as Purchase Orders already do (Phase 4B precedent). |
| Payment | One `payment_method` per sale (`cash`, `card`, `transfer`, `mobile_wallet`, `split`) plus `payment_splits` JSON `{cash, card, transfer}`. `payment_status` is always `completed`. | "POS" in the brief maps to `card`. Customer-payment mix can reuse these fields. Remittances need their own table. |
| Stock check | Read-then-decrement inside the DB transaction. There is no conditional `WHERE quantity_on_hand >= qty`. | Two Cashier Ones fulfilling at the same moment can oversell. The fulfilment path should use a guarded decrement. |
| Reserved stock | `Inventory.quantity_reserved` exists and is **read** (available = on_hand − reserved in `InventoryService` status) but is **never written anywhere**. | A ready-made, unused column if we choose to reserve stock for pending orders. |
| Void | `POST /transactions/:id/void`: restores stock, writes `adjustment` movements, sets `status='voided'`. **No role gate and no store check.** It does not reverse customer stats. | It is pre-existing, but Bar mode must not inherit it. Reversals of bar sales need their own gated path. |
| Refund | admin/manager, or cashier if `allow_cashier_refund`. Restores stock and customer stats. | Same. |
| Listing | `GET /transactions`: store-scoped but **not role-scoped**. Any cashier can list every sale in the store and filter by `userId`. `GET /transactions/:id` has **no store check**. | This **directly breaks** the "Cashier Two must not see other cashiers' records" requirement unless bar screens use new, scoped endpoints. |

---

## 6. Inventory & ledger

- `Inventory` is 1:1 with `Product`. It holds `quantity_on_hand` (Decimal 15,4), `quantity_reserved` (unused), thresholds.
- `InventoryMovement` is an **append-only ledger**: `movement_type` is a string (`sale`, `purchase`, `adjustment`, `transfer` in comments; `purchase` written only by PO receiving), `quantity` is signed, and it also holds `reference_id`, `user_id`, `notes`.
- **Writers of the ledger today:** sales (`sale`), void/refund (`adjustment`), stock-count reconciliation, PO receiving (`purchase`).
- **Gap:** `PATCH /v1/inventory/:productId` (manual adjustment) has **no role gate** and **does not write a ledger row**. This is already logged in `TODO.md`. Flat-beer write-offs must **not** reuse this endpoint.
- `BatchTracking` (lot/expiry) exists and is optional per line.

---

## 7. Payments and money owed

There are three unrelated "money owed" mechanisms today. None of them fits cashier remittance, but they show house patterns:

| Mechanism | Pattern | Lesson |
|---|---|---|
| Customer credit (`Customer` + `Payment`) | Outstanding = `total_spent − Σ payments`, **derived, never stored**. Overpayment is **rejected** (`customers.routes.ts:304`). | Derived balances carry forward for free. Bar mode should use the same idea with an explicit ledger. |
| Supplier AP (`PurchaseInvoice` + `SupplierPayment`) | Invoice status `unpaid/partial/paid` rolled up from payments. | Fine for invoices. Too coarse for many small daily remittances. |
| `CashShift` | Per-user open/close. Expected = opening + **cash** sales by that user since open. Records over/short. | Close in spirit to Cashier One's daily close, but it only counts the user's *own* cash sales. In Bar mode that would be wrong: Cashier One posts sales they did not collect. |

---

## 8. Expenses module

- `ExpenseCategory` (per branch) and `Expense` (`amount`, `expenseDate`, `paymentMethod`, `referenceNumber`, `status recorded|voided`, `createdBy`).
- **Routes have no role gate and no branch-authorization check** (`expenses.routes.ts`). Any authenticated user can record, edit or void expenses for any `branchId` they pass. This is pre-existing and out of scope here, but commission-to-expense posting must not rely on these routes.
- There is **no source/link field**, so nothing ties an expense to its origin. This means nothing prevents the same commission being posted twice. Bar mode needs a link column or a link table.
- `FinancialService` / P&L reads expenses, so commission posted as an expense **will flow into P&L automatically**. This is good.

---

## 9. Dashboards, analytics, reports

- `analytics.routes.ts` (dashboard KPIs, top products, payment breakdown, employee performance by `t.user_id`, hourly). Cashier view is scoped by `role === 'cashier'` → `user_id = me`.
- `reports.routes.ts`: `/eod` (payment-method breakdown of completed sales, void totals), `/voids`.
- **Almost every report filters `status = 'completed'`.** This matters for the database design. If pending bar orders were stored in `Transaction` with a new status, every query that *forgets* the filter would silently count them. `getStoreTransactions` returns them in lists. `exportTransactions` has **no status filter at all**. This is a strong reason to keep pending orders **out** of the `Transaction` table.
- Employee performance groups by `Transaction.user_id`. If bar sales are written with `user_id = Cashier Two`, **every existing employee/sales report attributes them correctly for free**.
- Day boundaries use `setHours(0,0,0,0)` in the **server's local timezone**. Bars trade past midnight, so this matters (see edge cases).

---

## 10. Audit

- `AuditLog`: `store_id`, `branch_id`, `user_id`, `action`, `resource_type`, `resource_id`, `changes` JSON, `ip_address`, `device_id`.
- `AuditService.log()` is **best-effort**. It runs **outside** the business DB transaction and swallows errors.
- **Finding:** `voidTransaction` / `refundTransaction` write audit rows **without `store_id`**. The audit viewer filters by `store_id`, so **void and refund events never show up in the store's audit screen**. This is pre-existing and worth a separate fix.
- For Bar mode, financial events (remittance, damage, reversal, commission) need audit rows written **inside** the same DB transaction, so the event and its audit trail either both exist or neither does.

---

## 11. Offline & sync

- Sales are offline-first. Hash = `SHA256(deviceId-transactionId-timestamp)`, pushed via `/transactions/batch`, deduped by the unique hash.
- Back-office features (stock counts, suppliers, POs) are **online-only** by design.
- There is **no real-time channel**, and the guardrail says no WebSockets. Clients poll with React Query.
- Bar mode is a **hand-off between two people on two devices**. An order Cashier Two submits offline cannot reach Cashier One anyway. Bar-mode order flow is naturally **online-only with short-interval polling**.

---

## 12. Reusable vs. new — summary

| Reuse as-is | Reuse with a small additive extension | Genuinely new |
|---|---|---|
| Auth/JWT, branch scoping, Product/Category/Inventory, InventoryMovement ledger, Transaction/TransactionItem as the **completed-sale** record, payment method vocabulary, EOD/employee reports, Expense + P&L, AuditLog table, StoreSetting pattern, desktop nav/role-guard pattern, React-Query online pattern | `TransactionService.createTransaction` core (needs an internal "post on behalf of" entry point with server-computed totals and a guarded decrement), `Transaction` (+ `sales_order_id`, `fulfilled_by_user_id`), `User` (+ operational profile), `Store`/`StoreSetting` (+ mode, commission and business-day settings), `Expense` (+ source link) | Sales orders (pending → fulfilled), cashier ledger (sales, remittances, damages, write-offs), remittances, damage records, daily close / management handover, commission runs, bar dashboards and reports |

---

## 13. Pre-existing risks found during this assessment (not fixed — reported only)

| # | Risk | Where | Severity for Bar mode |
|---|---|---|---|
| R1 | Any cashier can list all store transactions and filter by another user | `GET /v1/transactions` | **High.** It breaks Cashier Two isolation if bar UIs reuse it. |
| R2 | `GET /v1/transactions/:id` has no store check (cross-tenant read by ID) | `transactions.routes.ts:99` | High (general). |
| R3 | `POST /v1/transactions/:id/void` has no role or store gate | `transactions.routes.ts:143` | **High.** Cashier Two could void a posted sale and erase their own liability. |
| R4 | Expense routes have no role or branch gate | `expenses.routes.ts` | Medium. Commission expenses could be tampered with. |
| R5 | Manual stock adjust has no role gate and writes no ledger row | `PATCH /v1/inventory/:productId` | Medium. Damage must not use it. |
| R6 | Void/refund audit rows have no `store_id`, so they are invisible in the audit UI | `TransactionService.ts:466,561` | Medium. |
| R7 | Stock check is not race-safe | `TransactionService.ts:106` | Medium when two fulfillers are active. |
| R8 | Client-computed totals trusted | `createTransaction` | Medium. Bar orders should be server-priced. |
| R9 | Day boundaries use server-local time | reports/analytics/shifts | Medium. Bars trade past midnight. |

**Recommendation:** R1 and R3 must be closed **before** Bar mode goes live. At minimum, close them for stores in bar mode. R2 and R6 are cheap, general fixes worth doing in the same window. They are listed as Phase 0 in `implementation-roadmap.md`.
