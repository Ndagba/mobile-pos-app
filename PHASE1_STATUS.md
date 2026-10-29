# Phase 1 Status: Products, Services, and Decimal Inventory

## Implemented

### Data and migration

- Added `Product.item_type` with `PRODUCT` as the database default.
- Added a Prisma migration at `backend/prisma/migrations/20260819000000_add_product_services_and_decimal_inventory`.
- The migration preserves every existing product as `PRODUCT`; it does not infer services from category names.
- Converted these quantities to `Decimal(15,4)`:
  - `Inventory.quantity_on_hand`
  - `Inventory.quantity_reserved`
  - `Inventory.low_stock_threshold`
  - `Inventory.reorder_point`
  - `BatchTracking.quantity`
  - `TransactionItem.quantity`
  - `StockCountItem.system_quantity`
  - `StockCountItem.physical_quantity`
  - `StockCountItem.variance`
  - `InventoryMovement.quantity`

### Server behavior

- Product creation accepts `item_type`; only `PRODUCT` records create inventory.
- Service records have no manufactured or placeholder stock.
- Unsafe product/service conversions are prevented:
  - A product with stock cannot become a service until its stock is zero.
  - A service cannot become a product without an explicit inventory initialization workflow.
- Inventory adjustments, low-stock thresholds, and batch creation reject services server-side.
- Stock counts only prepopulate and accept physical products.
- Checkout loads the authoritative product record for every transaction line:
  - Products validate stock, deduct inventory, and create inventory movements.
  - Services create transaction lines but do not validate, deduct, or restore inventory.
- Voids and refunds restore inventory only for product lines.
- Bulk/CSV imports default missing item types to `PRODUCT` and do not create service inventory.

### Mobile behavior

- Product form has an explicit Product/Service selector, defaulting to Product.
- Service forms hide initial stock and low-stock inputs.
- Inventory list identifies services without displaying artificial stock or inventory actions.
- Physical inventory value excludes services and uses `cost_price` rather than selling price.
- Checkout permits services with no inventory and does not apply product stock limits to them.
- Cart items can carry `item_type` for offline rendering only; the server remains authoritative.
- Cached products without `item_type` are treated as `PRODUCT`, preserving legacy offline data.

## Validation completed

- `npx prisma validate` — passed.
- `npx prisma generate` — completed.
- `npm run build` in `backend` — passed.
- **Migration applied** to the dev DB `mobilepos` via `npx prisma migrate deploy` (after a `pg_dump` backup to `backend/backup_pre_phase1.sql`). Verified: all rows `item_type='PRODUCT'`, quantity columns `numeric(15,4)`, sample value read back as `96.0000`.
- **Backend Phase-1 test suites — 31 tests pass:** `npx jest tests/unit/TransactionService.test.ts tests/unit/InventoryService.services.test.ts tests/integration/phase1-mixed-sale.test.ts` (hermetic Prisma-mocked unit tests + a DB-backed integration test that self-seeds/cleans `p1itest_*` rows and skips cleanly if Postgres is unreachable).
- **`npx tsc --noEmit` in `mobile` — clean (0 errors).**
- Focused cart test command was run: `npm test -- --runInBand src/redux/slices/cartSlice.test.ts`.
- `git diff --check` — passed.

## Remaining Phase 1 work

Only **T6** remains — a manual end-to-end offline mixed sale on a device/emulator (build an offline cart with one product + one service, sync, and verify a single transaction with a decimal product-stock decrement, no service movement, and idempotent re-sync). Step-by-step instructions are in `PHASE1_HANDOFF.md` §5 (T6). All code-complete follow-ups (T1–T5) are done; see "Validation completed" above.

> Note: a bare `npm test` in `backend` is still not green — the *pre-existing* `tests/integration/*` and `tests/security/*` suites are black-box against a running API server on `:3000` and remain infra-dependent, out of Phase-1 scope.

## Pre-existing mobile TypeScript errors — fixed (T5)

`npx tsc --noEmit` in `mobile` was failing on issues outside the Phase-1 changes. All are now resolved and the typecheck is clean:

- `src/components/ui/FloatingTabBar.tsx`: removed invalid `strokeWidth` from the icon `TextStyle`.
- `src/screens/CustomerLedgerScreen.tsx`: removed the duplicate `errorText` object-literal property.
- `src/screens/CustomersScreen.tsx` (+ `src/components/customers/CustomerRow.tsx`): aligned the `Customer` shape (`phone?: string`) and retyped the `SectionList` renderers.
- `src/screens/OnboardingPaymentScreen.tsx`: `WebView` now imported from `react-native-webview`.
- `src/screens/StockCountsScreen.tsx`: added `barcode?: string | null` to the inline product type.
- `src/services/SubscriptionService.ts`: typed each response and dropped the extra `.data` unwrap (`ApiClient` already unwraps).
- `src/redux/slices/cartSlice.test.ts`: updated `addItem` calls for the Phase-1 `CartItem` shape (`tax_rate`, no `line_total`).

## Files changed for the current implementation

**Core:**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260819000000_add_product_services_and_decimal_inventory/migration.sql`
- `backend/src/api/routes/inventory.routes.ts`
- `backend/src/api/routes/products.routes.ts`
- `backend/src/api/routes/stock-counts.routes.ts`
- `backend/src/services/InventoryService.ts`
- `backend/src/services/TransactionService.ts`
- `mobile/src/redux/slices/cartSlice.ts`
- `mobile/src/screens/CheckoutScreen.tsx`
- `mobile/src/screens/InventoryScreen.tsx`
- `mobile/src/services/DatabaseService.ts`

**Follow-up T1–T5 (2026-08-19):**

- `backend/backup_pre_phase1.sql` — T1 pre-migration backup
- `backend/src/api/routes/analytics.routes.ts` — T3 product/service revenue split
- `backend/src/api/routes/reports.routes.ts` — T3 clarifying comments
- `backend/tests/helpers/mockPrisma.ts` — T2 hermetic Prisma mock (new)
- `backend/tests/unit/TransactionService.test.ts` — T2 rewritten hermetic
- `backend/tests/unit/InventoryService.services.test.ts` — T2 new
- `backend/tests/integration/phase1-mixed-sale.test.ts` — T2 DB-backed (new)
- `mobile/src/screens/AnalyticsScreen.tsx` — T4 exclude services from stock-verify list/CSV
- `mobile/src/components/ui/FloatingTabBar.tsx` — T5
- `mobile/src/screens/CustomerLedgerScreen.tsx` — T5
- `mobile/src/screens/CustomersScreen.tsx` — T5
- `mobile/src/components/customers/CustomerRow.tsx` — T5
- `mobile/src/screens/OnboardingPaymentScreen.tsx` — T5
- `mobile/src/screens/StockCountsScreen.tsx` — T5
- `mobile/src/services/SubscriptionService.ts` — T5
- `mobile/src/redux/slices/cartSlice.test.ts` — T5

_(`backend/src/services/InventoryService.ts` and `mobile/src/screens/InventoryScreen.tsx` also received T3/T4 edits respectively; listed once under Core.)_
