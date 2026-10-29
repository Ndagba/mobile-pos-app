# Phase 1 Handoff Brief — Products, Services & Decimal Inventory

**Audience:** Claude Code (or any engineer) picking up Phase 1 of MobilePOS.
**Read alongside:** `PHASE1_STATUS.md` (the "what changed" log). This document adds the architecture context, precise file pointers, remaining tasks with acceptance criteria, and the gotchas found during a code review — so you can resume without re-discovering the codebase.

---

## 1. TL;DR

Phase 1 introduced a **Product vs. Service** distinction in the catalog and converted every inventory quantity column to **`Decimal(15,4)`**. The core server and mobile changes are implemented and the backend compiles.

> ✅ **Status (2026-08-19): T1–T5 complete. Only T6 (a manual device e2e) remains.**
> - **T1** — migration applied to the dev DB (`mobilepos`) after a `pg_dump` backup (`backend/backup_pre_phase1.sql`); verified `item_type='PRODUCT'` for all rows and `numeric(15,4)` quantity columns.
> - **T2** — hermetic Prisma-mocked unit tests + a DB-backed integration test added; **31 tests pass**. See `backend/tests/helpers/mockPrisma.ts`, `backend/tests/unit/{TransactionService,InventoryService.services}.test.ts`, `backend/tests/integration/phase1-mixed-sale.test.ts`.
> - **T3** — analytics/reports split product vs. service revenue; turnover excludes services. Backend builds clean.
> - **T4** — `AnalyticsScreen` stock-verify list and `InventoryScreen` tablet detail pane now exclude services. `mobile` `tsc` clean.
> - **T5** — all pre-existing mobile TypeScript errors fixed; `npx tsc --noEmit` is clean.
> - **T6** — documented manual steps below; needs a device/emulator to execute.

> ⚠️ **The Phase-1 tests are green, but full `npm test` is not.** The *new* Phase-1 suites pass hermetically (and the integration suite passes against the migrated dev DB). The *pre-existing* `tests/integration/*` and `tests/security/*` suites are black-box against a running API server on `:3000` and remain infra-dependent — out of Phase-1 scope.

---

## 2. Stack & repo layout

**Backend** — Node + Express + TypeScript, Prisma ORM, PostgreSQL, Redis (`ioredis`) for inventory caching, Jest + ts-jest + supertest.
- Entry: `backend/src/index.ts`
- Routes: `backend/src/api/routes/*.ts`
- Services: `backend/src/services/*.ts`
- Schema: `backend/prisma/schema.prisma`
- Tests: `backend/tests/{unit,integration,security}/*.test.ts`, config `backend/jest.config.js`

**Mobile** — React Native + TypeScript + Redux Toolkit; offline-first with a local SQLite cache and a sync layer.
- Screens: `mobile/src/screens/*.tsx`
- Redux: `mobile/src/redux/slices/*.ts`
- Services: `mobile/src/services/*.ts` (`DatabaseService.ts` = local cache, `SyncManager.ts` = sync)

**Multi-tenancy** — everything is scoped by `store_id` / `branch_id`. Branch access is resolved via `backend/src/utils/branchHelper.ts` (`getAuthorizedBranchIds`).

---

## 3. Design invariants Phase 1 established — DO NOT REGRESS

1. **Server is authoritative for `item_type`.** Checkout re-loads each product from the catalog and decides product-vs-service from `Product.item_type`; it never trusts the client. (`TransactionService.createTransaction`)
2. **Services have no inventory.** No `Inventory` row is created for a `SERVICE`; no stock validation/deduction/restore; no batches; no low-stock thresholds; excluded from stock counts.
3. **Products move stock.** Product lines validate + decrement stock and write an `InventoryMovement` on sale; **void/refund restore stock for product lines only.**
4. **Decimal quantities.** All quantity columns are `Decimal(15,4)`. Be careful with `Number(...)` at read boundaries; prefer decimal-safe math. `decimal.js` is already a backend dependency.
5. **Offline safety.** Cached products without `item_type` are treated as `PRODUCT`; the cart may carry `item_type` for offline rendering only; the server remains authoritative on sync.

---

## 4. What's already implemented (with pointers)

**Schema & migration**
- `backend/prisma/schema.prisma`: `Product.item_type String @default("PRODUCT")`; `Decimal @db.Decimal(15,4)` on `Inventory` (`quantity_on_hand`, `quantity_reserved`, `low_stock_threshold`, `reorder_point`), `BatchTracking.quantity`, `TransactionItem.quantity`, `StockCountItem` (`system_quantity`, `physical_quantity`, `variance`), `InventoryMovement.quantity`.
- `backend/prisma/migrations/20260819000000_add_product_services_and_decimal_inventory/migration.sql`: adds `item_type` with default `'PRODUCT'`; `ALTER COLUMN ... TYPE DECIMAL(15,4) USING ...::DECIMAL(15,4)` for each quantity column. Preserves existing integers (`10` → `10.0000`). **Applied to the dev DB `mobilepos` on 2026-08-19** (see T1); rollback in `backend/backup_pre_phase1.sql`.

**Server**
- `products.routes.ts`: `normalizeItemType()` validation; **create** skips inventory for services; **PATCH** enforces conversion guards (product-with-stock → service blocked; service → product blocked without explicit inventory init); **bulk** + **CSV import** default to `PRODUCT` and skip service inventory.
- `services/InventoryService.ts`: `updateStock`, `updateThreshold`, `createBatch` reject services. `getInventoryStatus` / `getLowStockAlerts` read the `Inventory` table, so services are naturally excluded.
- `api/routes/stock-counts.routes.ts`: only physical products prepopulated/accepted.
- `services/TransactionService.ts`: `createTransaction` (product-vs-service branch), `voidTransaction`, `refundTransaction` all gate inventory on `item_type`.

**Mobile**
- `screens/CheckoutScreen.tsx`: services allowed, no product stock limits applied to them.
- `screens/InventoryScreen.tsx`: Product/Service selector (defaults to Product); service-aware display; physical inventory value **excludes services and uses `cost_price`**.
- `redux/slices/cartSlice.ts`: `item_type` on cart items (offline rendering only).
- `services/DatabaseService.ts`: legacy cache without `item_type` treated as `PRODUCT`.

---

## 5. Remaining work (actionable)

### T1 — Apply & rehearse the migration  ✅ DONE (2026-08-19)
- Backed up the shared dev DB first: `docker exec mobilepos_db pg_dump -U pos_user mobilepos > backend/backup_pre_phase1.sql`.
- `npx prisma migrate deploy` (clean) + `npx prisma generate`.
- **Verified:** every existing row has `item_type = 'PRODUCT'`; quantity columns are `numeric(15,4)`; a sample value read back as `96.0000`; backend build boots against the migrated DB.
- ⚠️ The `mobilepos` DB is **shared** with a separate older Docker checkout (`mobilepos_api` on `:3000`). The migration mutated that shared DB; the backup above is the rollback path.

### T2 — Backend automated test coverage  ✅ DONE (2026-08-19)
Hermetic Prisma-mocked unit tests plus one DB-backed integration test — **31 tests pass**:
- `backend/tests/helpers/mockPrisma.ts` — `createMockPrisma()` / `primeMockPrisma()`; `$transaction(cb)` runs `cb` against the same mock.
- `backend/tests/unit/TransactionService.test.ts` (rewritten hermetic) — idempotency, mixed cart (product decrements + one movement; service none), insufficient stock, wrong-branch/missing product, decimal qty (`1.5`, `0.25`), void/refund restore product-only, refund reverses customer stats, discount audit log.
- `backend/tests/unit/InventoryService.services.test.ts` — `updateStock`/`updateThreshold`/`createBatch` reject `SERVICE` with `AppError(400)` and never touch inventory; PRODUCT happy paths.
- `backend/tests/integration/phase1-mixed-sale.test.ts` — service-level against the migrated DB, self-seeding/self-cleaning (`p1itest_*` rows): decimal decrement + single movement, service untouched, void restores product only, duplicate `offline_session_hash` idempotent. Gated on Postgres being reachable (skips cleanly if not).
- Run: `npx jest tests/unit/TransactionService.test.ts tests/unit/InventoryService.services.test.ts tests/integration/phase1-mixed-sale.test.ts`.

### T3 — Analytics / reports: product vs. service split  ✅ DONE (2026-08-19)
- `analytics.routes.ts`: `/dashboard` returns `product_revenue` + `service_revenue` (via `FILTER (WHERE p.item_type=…)`) alongside total; `top_products` and the profit/cost query filter to `item_type='PRODUCT'`. `/sales` adds split revenue columns with product-only cost/profit. `/top-products` labels each row with `item_type`. `/employee-performance` and `/payments/methods` left as transaction-level totals (mixed is correct) with a clarifying comment.
- `InventoryService.getInventoryTurnover`: `AND p.item_type = 'PRODUCT'` (no inventory → ratio meaningless).
- `reports.routes.ts` (`/eod`, `/voids`): transaction-level; clarifying comments only.

### T4 — Review remaining mobile screens (service exclusion + decimal display)  ✅ DONE (2026-08-19)
- `AnalyticsScreen.tsx`: `stockVerifyItems` now filters out `item_type === 'SERVICE'` (no fabricated 0-on-hand / "out of stock" row in the table or CSV); empty-state keys off `stockVerifyItems.length`.
- `InventoryScreen.tsx`: tablet master-detail pane gates the stock card and the "Adjust Stock" button on `selectedProduct.item_type !== 'SERVICE'`, matching the phone-row pattern. "Edit" remains.
- Optional/deferred: aligning decimal-friendly keyboards on the stock-adjust threshold input vs. the product form (cosmetic; not required for correctness).

### T5 — Fix pre-existing mobile TypeScript errors  ✅ DONE (2026-08-19)
`npx tsc --noEmit` in `mobile` is clean (0 errors). Fixed `FloatingTabBar.tsx`, `CustomerLedgerScreen.tsx`, `CustomersScreen.tsx` (+ `CustomerRow.tsx`), `OnboardingPaymentScreen.tsx`, `StockCountsScreen.tsx`, `SubscriptionService.ts`, and the Phase-1 `cartSlice.test.ts` fallout.

### T6 — Manual end-to-end offline mixed sale  *(remaining; needs a device/emulator)*
The automated `phase1-mixed-sale.test.ts` proves the service logic; T6 is the on-device offline→sync leg the harness can't drive. Steps:

1. **Prep (online).** Point the app at the migrated backend. Ensure the active branch has one `PRODUCT` with known stock (note `quantity_on_hand`, e.g. `10.0000`) and one `SERVICE`.
2. **Go offline.** Enable airplane mode (or kill network) so the app falls back to the SQLite cache. Confirm the offline indicator appears.
3. **Build a mixed cart.** Add the product with a **decimal** quantity (e.g. `1.5`) and add the service (qty `1`). Confirm the service shows no stock limit/adjustment UI in the cart.
4. **Complete the sale offline.** Take payment (cash). The receipt/transaction should be queued locally with an `offline_session_hash`; the product's cached on-hand should reflect the decimal deduction locally.
5. **Reconnect & sync.** Restore network; let `SyncManager` flush the queue.
6. **Verify server-side** (query the migrated DB or the API):
   - exactly **one** `Transaction` with **two** `TransactionItem` lines (product + service);
   - product `Inventory.quantity_on_hand` decremented by `1.5` (e.g. `10.0000 → 8.5000`);
   - exactly **one** `InventoryMovement` (`movement_type='sale'`, `quantity=-1.5000`) for the product and **none** for the service;
   - totals match the cart.
7. **Idempotency.** Trigger a re-sync (or replay the queued item). Confirm **no** second transaction and **no** further stock decrement (same `offline_session_hash`).
8. **(Optional) Void round-trip.** Void the synced transaction; confirm the product stock returns to its starting value and the service line is a no-op.

**Done when:** the mixed offline sale syncs to a single transaction with correct decimal product movement, no service movement, and idempotent re-sync.

---

## 6. Gotchas & risks (read this before you start)

- **Phase-1 suites are GREEN; full `npm test` is not.** `tests/unit/TransactionService.test.ts` was rewritten hermetic (it previously called `createTransaction` **without `branch_id`** and instantiated a live `PrismaClient`). The Phase-1 suites — `tests/unit/TransactionService.test.ts`, `tests/unit/InventoryService.services.test.ts`, `tests/integration/phase1-mixed-sale.test.ts` — pass (**31 tests**). Run just those; do **not** expect a bare `npm test` to be green.
- **Pre-existing suites still need real infrastructure.** The *other* `tests/integration/*` and `tests/security/*` are black-box — they `axios` against a running API server at `http://localhost:3000/v1` (JWT secret `dev_secret_key`) and expect seeded products. Those remain infra-dependent and out of Phase-1 scope. For hermetic tests, follow the Phase-1 pattern: `jest.mock('../../src/lib/prisma', …)` via `tests/helpers/mockPrisma.ts`, plus mock `../../src/utils/logger` and `../../src/lib/redis`.
- **The migration is effectively a table rewrite.** In-place `ALTER COLUMN ... TYPE` locks and rewrites. Rehearse on a snapshot; check `_prisma_migrations` for prior `db push` drift before `migrate deploy`.
- **Decimal precision.** Watch for `Number()` truncation / float rounding when summing money or quantities; prefer `Prisma.Decimal` / `decimal.js` in new backend code and format consistently on mobile.
- **Analytics silently mixes services (T3).** Turnover ratio for services is `null`/garbage by design (no inventory row).
- **No standalone ProductForm file.** The product/service selector lives inside `InventoryScreen.tsx` — confirm before editing.

---

## 7. Validation commands

```bash
# Backend — build + Phase-1 test suites (hermetic unit + DB-backed integration)
cd backend && npx prisma validate && npx prisma generate && npm run build
cd backend && npx jest tests/unit/TransactionService.test.ts tests/unit/InventoryService.services.test.ts tests/integration/phase1-mixed-sale.test.ts

# Migration (already applied 2026-08-19; rollback = backend/backup_pre_phase1.sql)
cd backend && npx prisma migrate deploy

# Mobile
cd mobile && npx tsc --noEmit
cd mobile && npm test -- --runInBand src/redux/slices/cartSlice.test.ts

# Whitespace / conflict markers
git diff --check
```

---

## 8. Files changed in Phase 1

**Core (initial Phase-1 implementation):**
```
backend/prisma/schema.prisma
backend/prisma/migrations/20260819000000_add_product_services_and_decimal_inventory/migration.sql
backend/src/api/routes/inventory.routes.ts
backend/src/api/routes/products.routes.ts
backend/src/api/routes/stock-counts.routes.ts
backend/src/services/InventoryService.ts
backend/src/services/TransactionService.ts
mobile/src/redux/slices/cartSlice.ts
mobile/src/screens/CheckoutScreen.tsx
mobile/src/screens/InventoryScreen.tsx
mobile/src/services/DatabaseService.ts
```

**Follow-up T1–T5 (2026-08-19):**
```
backend/backup_pre_phase1.sql                              # T1 pre-migration backup
backend/src/api/routes/analytics.routes.ts                # T3 product/service split
backend/src/api/routes/reports.routes.ts                  # T3 clarifying comments
backend/src/services/InventoryService.ts                  # T3 getInventoryTurnover excludes services
backend/tests/helpers/mockPrisma.ts                       # T2 hermetic Prisma mock
backend/tests/unit/TransactionService.test.ts             # T2 rewritten hermetic
backend/tests/unit/InventoryService.services.test.ts      # T2 new
backend/tests/integration/phase1-mixed-sale.test.ts       # T2 DB-backed
mobile/src/screens/AnalyticsScreen.tsx                    # T4 exclude services from stock-verify
mobile/src/screens/InventoryScreen.tsx                    # T4 tablet detail pane service guard
mobile/src/components/ui/FloatingTabBar.tsx               # T5 tsc fix
mobile/src/screens/CustomerLedgerScreen.tsx               # T5 tsc fix
mobile/src/screens/CustomersScreen.tsx                    # T5 tsc fix
mobile/src/components/customers/CustomerRow.tsx           # T5 tsc fix
mobile/src/screens/OnboardingPaymentScreen.tsx            # T5 tsc fix
mobile/src/screens/StockCountsScreen.tsx                  # T5 tsc fix
mobile/src/services/SubscriptionService.ts                # T5 tsc fix
mobile/src/redux/slices/cartSlice.test.ts                 # T5 Phase-1 fallout
```

---

## 9. Suggested order

**T5** (unblocks the mobile typecheck; fully independent) → **T2** (lock in the invariants with tests) → **T3** (analytics split) → **T1** (migration rehearsal) → **T4** (mobile screen polish) → **T6** (manual e2e).
Alternatively lead with **T1** if a DB snapshot is ready and you want DB-backed integration tests in T2.
