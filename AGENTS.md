# AGENTS.md — JayPOS / MobilePOS + Desktop POS

Working instructions for Codex on this repo. **These override default behavior.**
Companion docs: [`TODO.md`](TODO.md) (living task tracker) and, once produced, `DESKTOP_IMPLEMENTATION_AUDIT.md` (full Phase‑0 audit). Architecture facts below are verified against the working tree on **2026‑08‑23**.

---

## 1. What this project is

- **JayPOS / MobilePOS** — a production-oriented, multi-tenant, multi-branch POS for the Nigeria market (₦ / VAT). Two existing apps:
  - `backend/` — Node.js + Express + Prisma + PostgreSQL + Redis. API mounted under **`/v1/*`**.
  - `mobile/` — Expo SDK 54 / React Native 0.81 / React 19 / Redux Toolkit. Branded **JayPOS v2.4.1**.
- **New goal:** build a **Desktop POS** in `desktop/` as a **Next.js 14 App-Router PWA** (TypeScript, Tailwind, shadcn/ui, TanStack Query, Zustand, Dexie/IndexedDB) that reuses the existing backend, auth, and sync — **not** a second POS system. Full brief: [`Codex Prompt_ Desktop POS Implementation.md`](Codex%20Code%20Prompt_%20Desktop%20POS%20Implementation.md).

Target monorepo layout: `mobile/  desktop/  backend/  shared/` at repo root.

---

## 2. Non-negotiable guardrails

1. **Inspect → Understand → Plan → Implement → Test → Verify.** Never "generate everything and hope."
2. **Trust existing code over the architecture doc.** If the doc and the code disagree, the code wins; adapt the plan. (Brief §27.)
3. **Do not break mobile or backend.** After any shared-code change, run backend + mobile tests (§7). A desktop change that breaks mobile is not done.
4. **Reuse, don't duplicate.** No second API client, auth system, business-logic copy, or DB model. Extract into `shared/` instead.
5. **No overengineering.** No **Electron, Tauri, WebSocket real-time, microservices**, or extra state libraries. Desktop is a PWA in the browser.
6. **Git safety.** Never `reset`/`checkout`/`clean`/force-push without explicit instruction. Commit/push/PR **only when asked**. ⚠️ The tree currently holds **pre-existing uncommitted Phase‑1 inventory WIP that is NOT desktop work** — do not sweep it into desktop commits.
7. **Env hygiene.** Never hardcode secrets, DB creds, JWT secrets, prod URLs, printer creds. Use `.env` / `.env.local`; ship `.env.example`.
8. **Keep the idempotency hash byte-identical** across mobile and desktop (see §5) — desktop-created sales must dedupe against the same backend.

---

## 3. Backend architecture (verified)

- **Base URL** `/v1`. **Response envelope** `{ status:'success', data, [pagination] }` — except subscription/webhook routes use `{ success:true, data }`. The mobile `ApiClient` unwraps one `.data` level (`response.data.data`).
- **Auth** — `backend/src/services/AuthService.ts`: JWT **HS256**, access token **24h** (`JWT_SECRET`), refresh **7d** (`REFRESH_TOKEN_SECRET`), passwords bcrypt cost 10. Access-token claims: `{ userId, email, role, storeId, branchId, is_super_admin }`. Endpoints: `/auth/login`, `/auth/refresh-token`, `/auth/biometric-verify`, `/auth/me`, `/auth/register`, user role/deactivate/reset-password. **Desktop auth = username + password only** (no biometric/OAuth).
- **RBAC** — 3 string roles `admin | manager | cashier` + `is_super_admin` boolean. Enforcement is **per-route inline checks** (`roleMiddleware` exists but is effectively unused). Subscription/feature gating via `featureGate.middleware.ts`.
- **Multi-tenancy / multi-branch** — tenant = **`store_id`** (plain string, e.g. `store_001`; **not FK-enforced** except Subscription/StoreSetting). Location = **`branch_id`**. Central helper `backend/src/utils/branchHelper.ts`: `getAuthorizedBranchId(req)` (writes) / `getAuthorizedBranchIds(req)` (reads) → **admin = all branches, manager = home + assigned (`ManagerBranch`), cashier = home only**. Desktop must respect this scoping.
- **Core services** — `TransactionService.ts` (sales engine: idempotent create, batch sync, void/refund, stock decrement, receipt numbers), `InventoryService.ts` (status/low-stock/expiring/adjust/batches/turnover, rejects SERVICE items, blocks negative stock), `AuthService.ts`, `AuditService.ts`, subscription/Paystack services.
- **Server trusts client math.** `subtotal`/`tax_amount`/`total_amount` are **passed in by the client and written as-is** — the server does **not** recompute them. Desktop must compute totals identically to mobile (§5).
- **Validation** — `joi` is installed but **never imported**; all validation is manual inline `AppError(400, …)`.

---

## 4. Data model (Prisma — verified: 27 models, 0 enums)

- Provider **`postgresql`**; `backend/prisma/schema.prisma`. UUID string PKs throughout. **Zero Prisma `enum`s** — all enum-like values are documented `String` fields (favorable for SQLite portability).
- Money = `Decimal(15,2)`, quantities = `Decimal(15,4)` (supports weighed goods). Hierarchy: **Store (string tenant) → Branch → {Category, Product, Inventory, Transaction, StockCount, CashShift, InventoryMovement}**.
- Sales core: `Transaction` (header) → `TransactionItem` (lines) → `Product` → 1:1 `Inventory`; plus `InventoryMovement` ledger, `BatchTracking` (lot/expiry), `StockCount`/`StockCountItem`, `CashShift`.
- **Offline-sync fields exist on sales only:** `Transaction.offline_session_hash String? @unique`, `is_sync_online`, `synced_at`. `OfflineSyncQueue` model + `/v1/sync/*` routes exist but are **unused scaffolding** — the mobile app never calls them.
- SaaS billing subsystem: `SubscriptionPlan`/`Subscription`/`Invoice`/`PaymentReminder` (Paystack).

---

## 5. Offline & sync (the crux for desktop)

- **Mobile storage is AsyncStorage key-value JSON** via `mobile/src/services/DatabaseService.ts` (singleton) — **not** a real DB. **Redux is NOT persisted**; the durable pending-sync source of truth is the `{store}_transactions` array filtered by `is_sync_online`. Cart lives only in Redux.
- **Idempotency (preserve exactly):**
  ```ts
  offline_session_hash = SHA256(`${deviceId}-${transactionId}-${timestamp}`)   // crypto-js
  // transactionId = client UUID v4 from mobile/src/utils/generateId.ts (Math.random based)
  ```
  Sent in the **batch body** (not an HTTP header); backend enforces `@unique` and returns the **existing** row on collision (`TransactionService.createTransaction` `findFirst`). **Desktop must reproduce this formula byte-identically.**
- **Sync protocol:** push-only for sales via **`POST /v1/transactions/batch { transactions:[...] }`** → `{ data:{ results:[{offline_session_hash, transaction_id, status}], errors:[...] } }` (partial success per row). No per-item retry/backoff — the whole unsynced set is re-sent each trigger. Everything else (products/inventory/customers/settings) is **pull-only, server-wins overwrite**.
- **No client-side conflict resolution exists** (and none is needed for sales, given idempotency). There is **no `ConflictResolver`, no last-write-wins timestamp logic** in `mobile/src` despite what the doc implies. Do not claim to "reuse" a conflict resolver that isn't there.
- **Reconnect→sync** is wired in `mobile/src/App.tsx` via a `NetInfo` listener → `runPendingSync()` (reads AsyncStorage directly). `syncMiddleware` auto-sync and `useNetworkStatus.ts` are effectively dormant/dead.

### Shared-code boundary (mobile → `shared/`)
- **Portable as-is (pure TS):** `cartSlice`, `syncSlice`, `syncMiddleware`, `utils/generateId.ts`, `SyncManager.generateOfflineSessionHash`, `utils/inventory.ts` (tested), `CustomerPaymentService` credit math, `TransactionService.validateTransaction`/`calculateTax`, theme `naira()`/`alpha()`. Scattered snake_case types (`Product`, `CartItem`, `Customer`, `Supplier`, `User`, `TransactionInput`, `StoreSettings`, …) lift cleanly once exported.
- **Portable behind an interface:** `SyncManager` + mobile `TransactionService` — pure orchestration that only touches RN via `DatabaseService` and `ApiClient`. Define `IOfflineStore` / `IApiClient` / `INetwork`.
- **RN-locked → reimplement for desktop (~2 files):** `DatabaseService` (AsyncStorage → **Dexie/IndexedDB**, same method surface), `ApiClient` token storage (`expo-secure-store` → web secure storage), network detection (`NetInfo` → `navigator.onLine` + online/offline events).
- **Cart math to replicate** (`cartSlice.recalculateTotals`): `subtotal = Σ(unit_price·qty)`; `tax = Σ(unit_price·qty·tax_rate/100)` (per-line rate); `total = subtotal + tax − discount` (flat store-level). Per-line values rounded to 2 dp in `TransactionService`.

---

## 6. Known gaps / greenfield (desktop will need backend extensions)

- **Procurement is missing.** `Supplier` + single-line `PurchaseInvoice` (AP ledger) + `SupplierPayment` exist, but **no `PurchaseOrder`, `PurchaseOrderItem`, or `GoodsReceived`**. Critically, `PurchaseInvoice` has **no product FK and does not touch inventory** — no `purchase`-type `InventoryMovement` is ever written. Receiving/stock-in is genuine greenfield.
- **No `SyncDevice` registry** — `device_id` is a loose unvalidated string.
- **No inter-branch stock-transfer route** (movement type exists, endpoint does not).
- **No thermal printing anywhere** — mobile only builds a plaintext receipt via RN `Share` + an on-screen modal (`CheckoutScreen.handlePrintReceipt`). Configurable footer via `@pos_receipt_footer`. Phase 6 printing is fully net-new.
- **No server-side schema validation** (Joi unused).

## Caveats to respect
- JWT secrets fall back to hardcoded `'secret'`/`'refresh-secret'` if env unset — **must** be set for prod/desktop.
- `GET /v1/products/:id` has **no** auth middleware; `GET /v1/products/search` is **shadowed** by `/:id` (route order) — search via `GET /v1/products/?search=`.
- **SQLite local-mode = MODERATE effort** (a *backend deployment* option, distinct from the desktop's Dexie browser storage). Blockers: 6 `Json` fields → `String` + app serialize (incl. `OfflineSyncQueue.payload`); ~46 `@db.Decimal`/`@db.Date` attribute strips; Postgres-locked migration baseline needs a separate SQLite schema + fresh `migrate`. **Do not replace PostgreSQL globally.**

---

## 7. Commands

```bash
# Backend (from backend/)
npm run build      # tsc
npm test           # Jest/ts-jest. UNIT suites are hermetic (mockPrisma). INTEGRATION/SECURITY suites hit a live http://localhost:3000/v1 and fail unless the API+DB are up — a full run is NOT all-green out of the box.

# Mobile (from mobile/)
npm test           # jest-expo. Only 2 small suites (cartSlice, inventory utils).

# Desktop (from desktop/, once scaffolded)
npm run dev
npm run test
```

- **Prod deployment** is manual **SFTP + SSH to Opalstack** (`DEPLOY.md`); public API `https://distro.pcnigeria.org.ng/v1`. `docker-compose.yml` exists for local/self-host (postgres 5432, redis 6379, api 3000).

## 8. Local-dev gotchas
- **Run from the main repo** `C:\Projects\MobilePOS\backend` & `mobile` — not the `.Codex/worktrees/` copy.
- `mobile/.env` (`EXPO_PUBLIC_API_URL`) points at **remote prod** by default; repoint for local on-device testing. Note the `/v1` suffix.

---

## 9. Current status
Phase‑0 research is **complete and verified** against the working tree. The standalone `DESKTOP_IMPLEMENTATION_AUDIT.md` was **skipped by request** — its facts live in this file. **Monorepo strategy is decided:** npm workspaces, adopted incrementally (see [`MONOREPO_STRATEGY.md`](MONOREPO_STRATEGY.md)). **Phase 1 (Foundation) is complete as of 2026‑08‑23.**

**Phase 2 (Core POS) implementation is complete as of 2026‑08‑23**, with all hermetic gates green: shared vitest **22/22**, desktop typecheck clean, desktop build ✓ (**8 pages**, Next 14.2.35), mobile tests **20/20** (intact). Delivered: product search/categories/barcode, stock-gated cart with per-line tax + flat discount, optional customer with **soft** credit warning, checkout (cash/card/mobile_wallet) via shared `createTransaction`, offline persistence to Dexie with byte-identical `offline_session_hash`, batch sync ("Sync Now" + auto on reconnect) with live pending count, on-screen receipt, and server-backed transaction history. The pure create/queue/sync/idempotency logic is extracted to `@jaypos/shared` (`services/transactions/*`) behind the `IApiClient`/`IOfflineStore`/`INetwork` ports; mobile still runs its own copies (no mobile rewiring this phase). Hybrid sync model documented in [`DESKTOP_OFFLINE_SYNC.md`](DESKTOP_OFFLINE_SYNC.md).

**Phase 3 (Inventory) implementation is complete as of 2026‑08‑23**, with all hermetic gates green: shared vitest **33/33**, desktop typecheck clean, desktop build ✓ (**13 routes**, Next 14.2.35), mobile tests **20/20** (intact). Delivered (admin+manager; cashiers gated out): product-centric catalog with All/Products/Services/Categories/Low-Stock tabs (branch- + category-scoped `GET /products`, client search), product & service create/edit/delete (**delete admin-only**) with base64 image upload, category management, stock adjustment (signed delta + reason) with per-product movement ledger, low-stock alerts + **+10 quick restock**, admin branch selector, **stock counts** (start → count-sheet → accept/reconcile; admin-only), **bulk CSV import** (admin-only), and **turnover** + **expiring-batches** views. One additive `shared/` change: extended `Product`/`Category` types + new tested `stockStatus()` helper (mobile still runs its own copies). Endpoints, role/branch model, and caveats documented in [`DESKTOP_INVENTORY.md`](DESKTOP_INVENTORY.md). **Two backend caveats surfaced (not fixed — they touch the pre-existing WIP `InventoryService.ts`):** `GET /inventory/expiring` is **not store-scoped** (may leak other stores' batches — the desktop view carries a prominent warning banner), and `PATCH /inventory/:productId` has **no role/branch gate** and **does not write the movement ledger** (only stock-count reconciliation and sales do). Both are logged as follow-ups in [`TODO.md`](TODO.md).

**Phase 4 is split: 4A (approved 2026‑08‑24) and 4B (approved & built 2026‑09‑07) are both complete.**

**Phase 4A (Suppliers & Accounts Payable — desktop UI) is complete as of 2026‑08‑24**, with all hermetic gates green: desktop typecheck clean, desktop build ✓ (**14 routes**, Next 14.2.35 — new `/suppliers`, `/suppliers/[id]`), shared vitest **33/33** (unchanged), mobile tests **20/20** (intact). Delivered (admin+manager; cashiers gated out): a **UI-only** Suppliers directory + per-supplier **AP ledger** on the **existing** `/v1/suppliers*` backend — **zero** backend / `shared/` / mobile / Prisma change. Supplier CRUD (client search + Preferred/Blocked tag chips, create/edit/**hard delete**), purchase invoices (create, inline status, delete), payments (create against an open invoice with a per-invoice balance guard, delete), and store-wide outstanding from `/suppliers/summary`. **Online-only** (React-Query `online`-keyed, no Dexie — same model as Phase-3 stock counts); supplier types are declared locally in the desktop hooks (not lifted to `@jaypos/shared`). Endpoints, parity decisions, and caveats documented in [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md).

**Phase 4B (Procurement: PO → receive → stock-in) implementation is complete as of 2026‑09‑07**, with all hermetic gates green: backend build ✓, backend unit `PurchaseOrderService` **23/23** (existing unit suites intact), shared vitest **33/33** (unchanged — server-only PO math, **no `@jaypos/shared` change**), mobile tests **20/20** (intact), desktop typecheck clean, desktop build ✓ (**17 routes**, Next 14.2.35 — new `/purchasing`, `/purchasing/new`, `/purchasing/[id]`). Delivered (admin+manager; cashiers gated out): 4 **additive** Prisma models (`PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceipt`, `GoodsReceiptItem`) + one nullable `PurchaseInvoice.purchase_order_id` column via a strictly-additive migration (`CREATE TABLE`/`ADD COLUMN` only); a 7-route `/v1/purchase-orders` API (list/create-draft/detail/patch-transition/delete/receive/receipt-history) with **server-computed** PO totals (per-product `tax_rate`, client math not trusted), a derived `draft→ordered→partially_received→received`/`cancelled` state machine, and **receiving as an atomic `$transaction`** that per line increments `Inventory.quantity_on_hand` and writes exactly one **`purchase`-type `InventoryMovement`** (closing the Phase‑3 ledger loop — the first code path to ever write that movement type). **Confirmed build decisions:** AP invoice on receipt is **off by default, opt-in `create_invoice:true`** (links via the new `purchase_order_id`); **over-receipt allowed + flagged** (stock rises by the real received amount); **`cost_price` left untouched** on receive; supplier FK `onDelete: Restrict`; line quantities locked after `ordered`; `po_number` client-supplied with server `@@unique` + fallback generation; optional `receipt_hash` idempotency. Desktop is **online-only** (React-Query `online`-keyed, no Dexie); PO/receipt wire types declared locally in the desktop hooks (not lifted to `@jaypos/shared`). Endpoints, decisions, and as-built notes documented in [`DESKTOP_PROCUREMENT_DESIGN.md`](DESKTOP_PROCUREMENT_DESIGN.md) (§0 Build outcome). **4A follow-up shipped alongside (Step 6):** the supplier `DELETE` route now maps the Prisma FK violation (`P2003`) from `onDelete: Restrict` to a clear **409** and the desktop delete-confirm copy warns up-front (see [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md) §5).

**Not yet run:** live end-to-end scenarios — Phase 2 **1–6**, Phase 3 **1–9**, Phase 4A (create/edit/delete supplier, record invoice, record/partial-pay + status roll-up, delete, cashier RBAC redirect), and Phase 4B (raise PO → submit `ordered` → partial receive → confirm `quantity_on_hand` rose **and** a `purchase` `InventoryMovement` landed in the product ledger → receive remainder → status `received` → opt-in AP invoice payable via the 4A ledger → cashier redirected from `/purchasing`) — each needs a running backend with an active-subscription store (none reachable in the build environment). Remaining open decision (printing) and the phased plan are in [`TODO.md`](TODO.md). Per brief §29, **STOP for approval before implementing the next phase.**
