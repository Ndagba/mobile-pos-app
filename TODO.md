# TODO.md — Desktop POS Implementation

Living task tracker for building the **Desktop POS** (`desktop/`) on top of the existing JayPOS/MobilePOS system.
Source brief: [`Claude Code Prompt_ Desktop POS Implementation.md`](Claude%20Code%20Prompt_%20Desktop%20POS%20Implementation.md). Standing rules: [`CLAUDE.md`](CLAUDE.md).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/needs decision
**Rule:** finish each phase with build + tests green, then **STOP and summarize** before the next.

---

## ⚠️ Guardrails (every phase)
- [ ] Inspect before modifying; trust existing code over the doc.
- [ ] Don't break mobile/backend — run their tests after any `shared/` change.
- [ ] Reuse via `shared/`; no duplicate API client / auth / business logic / models.
- [ ] No Electron/Tauri/WebSocket/microservices/extra state libs.
- [ ] Keep `offline_session_hash` formula byte-identical to mobile.
- [ ] Git: no reset/checkout/clean/force-push without instruction; commit/push/PR only when asked; **don't commit the pre-existing Phase‑1 inventory WIP as desktop work**.
- [ ] No hardcoded secrets; ship `.env.example`.

## 🔑 Decisions to confirm before Phase 1
- [x] **Monorepo tooling** — **DECIDED: npm workspaces, incremental** (shared+desktop first; backend/mobile join later, guarded). See [`MONOREPO_STRATEGY.md`](MONOREPO_STRATEGY.md). Confirmed the repo is *not* currently a workspace (root `package.json` only holds `docx`).
- [x] **Desktop offline store** — **Dexie/IndexedDB** (per brief) — **implemented Phase 1** (`DexieOfflineStore`). Note this is *separate* from the optional backend **SQLite local-mode** (Phase 6); the brief slightly conflates them.
- [!] **Printing approach** — start with **browser/CSS print** for receipts; add **ESC/POS via QZ Tray** only if true thermal hardware is required. Decide in Phase 6.
- [x] **Totals** — compute client-side identically to `cartSlice.recalculateTotals` (server trusts client math) — **extracted to `shared/utils/cart.ts` in Phase 1**, unit-tested against mobile arithmetic.

## 🧩 Backend extensions required (create only when the phase needs them)
- [~] **Procurement (Phase 4):** `PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceipt`(+`Item`) models + routes; wire receiving to a **`purchase`-type `InventoryMovement`** stock-in (none exists today). **Fully specified in [`DESKTOP_PROCUREMENT_DESIGN.md`](DESKTOP_PROCUREMENT_DESIGN.md) (4B); NOT built — awaiting approval.**
- [ ] **`SyncDevice` registry (Phase 5):** replace the loose `device_id` string with a real device table + endpoints.
- [ ] **Inter-branch stock transfer route (Phase 3/5):** movement type exists, endpoint doesn't.
- [ ] **(Optional) server-side validation:** adopt a schema validator (Joi already a dependency, unused).

---

## Phase 0 — Repository Audit  `[x]`
- [x] Inspect mobile, backend, Prisma, routes, auth, sync, offline storage.
- [x] Verify findings against the current (modified) working tree.
- [-] ~~Produce **`DESKTOP_IMPLEMENTATION_AUDIT.md`**~~ — **SKIPPED by request (2026-08-23).** Research is complete/verified and the load-bearing facts are captured in [`CLAUDE.md`](CLAUDE.md); the standalone audit doc was deprioritized to unblock progress.
- [x] Decide + document monorepo strategy → [`MONOREPO_STRATEGY.md`](MONOREPO_STRATEGY.md).
- [x] **STOP: present audit + plan for approval before Phase 1** (brief §29) — **approved 2026‑08‑23** ("yes start phase 1").

## Phase 1 — Foundation  `[x]`  ✅ complete 2026‑08‑23 — all gates green
- [x] Scaffold `desktop/` — Next.js **14.2.35** App Router + TypeScript 5.3 + Tailwind 3.4 + shadcn-style tokens.
- [x] Introduce workspaces (npm) at repo root (`workspaces: ["shared","desktop"]` only — mobile/backend deliberately left standalone/unhoisted); create `shared/` package (`@jaypos/shared`) with `types/`, `utils/`, `services/{api,sync,network}/`.
- [x] Extract first shared pieces: snake_case **types**, `generateId`, `naira()`/`alpha()`, `utils/inventory.ts`, cart math — extracted byte-identically; **mobile still consumes its own copies** (no mobile import rewiring in Phase 1), mobile tests confirmed green (20/20).
- [x] Port **ApiClient** to desktop behind `shared/`'s `IApiClient`: `/v1` base via `NEXT_PUBLIC_API_URL`, `{data:{...}}` unwrap, Bearer injection, **`/auth/refresh-token` 401-retry-once** (skips `/auth/*`, single `_retry`). Web `localStorage` token adapter (`ITokenStorage`) replaces `expo-secure-store`.
- [x] Auth: username+password login against existing JWT; session restore (`hydrated` flag); route guards (`(app)/layout.tsx`); Zustand auth store.
- [x] Layout: sidebar + topbar + online/offline pill + sync indicator (placeholder count until Phase 2).
- [x] **Online/offline detection** via `navigator.onLine` + online/offline events (`INetwork` → `BrowserNetwork`, `useNetworkStatus` via `useSyncExternalStore`).
- [x] **Dexie** setup implementing the `DatabaseService` method surface (`IOfflineStore` → `DexieOfflineStore`, DB `jaypos_desktop` v1, rows `_store_id`-scoped for multi-tenancy).
- [x] PWA foundation: `manifest.webmanifest`, service worker (`sw.js`, network-first nav + SWR assets), cached app shell, SVG icon.
- [x] ✅ Verify: **shared tests 7/7** (vitest) · **desktop typecheck clean** (`tsc --noEmit`) · **desktop build ✓** (6 static pages, Next 14.2.35) · **mobile tests 20/20** (jest, unchanged).

> **Security note (npm audit, prod deps only):** 2 *high* advisories remain, both in **Next.js** (and its bundled **postcss**). The only offered fix is `next@16` — a **major breaking change** — so it is **deferred, not auto-applied**. Revisit as a deliberate Next-major upgrade (its own task) rather than `npm audit fix --force`. Not a Phase-1 blocker; the app is not yet deployed.

## Phase 2 — Core POS  `[~]`  implementation complete + all hermetic gates green 2026‑08‑23; live scenarios pending a backend run
- [x] Product search + categories + barcode lookup (`GET /v1/products`, branch-scoped) — catalogue loaded per-category once and filtered client-side; Enter = barcode/sku exact match. (`hooks/useProducts.ts`, `useCategories.ts`, `components/pos/{ProductSearch,CategoryTabs,ProductGrid,ProductCard}.tsx`)
- [x] Cart (reuse shared cart logic) — qty changes (stock-gated via shared inventory helpers), **discount** (flat store-level), **per-line tax**; totals via `useCartTotals` → shared `calculateCartTotals` (never stored). (`store/cartStore.ts`, `components/pos/{CartPanel,CartLineItem,DiscountField}.tsx`)
- [x] Customer selection + **soft** credit check (warn when `credit_limit − total_spent < total`; **never blocks**; null limit = unlimited) — matches mobile. (`hooks/useCustomers.ts`, `components/pos/CustomerPicker.tsx`, `Checkout.tsx`)
- [x] Checkout + payment (cash/card/mobile_wallet — "Transfer" label); sale completion via shared `createTransaction`. (`components/pos/{PaymentMethodSelect,Checkout}.tsx`)
- [x] **Offline sales:** persist to Dexie, compute `offline_session_hash` (byte-identical, generated inside `createTransaction`), mark `is_sync_online=false`. (shared `services/transactions/*`, `lib/deviceId.ts`)
- [x] **Sync:** `POST /v1/transactions/batch`; **"Sync Now"** button + auto-sync on reconnect; live pending count. (`store/syncStore.ts`, `hooks/useAutoSync.ts`, `components/layout/StatusIndicators.tsx`)
- [x] Receipt generation (on-screen modal; printing deferred to Phase 6) + transaction history (server-backed, filters + paging + offline pending banner; Sidebar entry). (`components/pos/ReceiptModal.tsx`, `hooks/useTransactions.ts`, `app/(app)/sales/history/page.tsx`)
- [x] ✅ Hermetic gates: **shared vitest 22/22** (create/queue/sync/idempotency logic behind fakes) · **desktop typecheck clean** · **desktop build ✓ (8 pages, Next 14.2.35)** · **mobile tests 20/20** (intact after the `shared/` change).
- [~] ✅ **Live scenarios — PARTIALLY RUN 2026‑08‑25** against a live backend (`store_001`, active subscription). **Verified:** 1 (online sale — stock decrement + receipt number), 2 (offline sale — Dexie queue, backend untouched), 3 (reconnect auto-sync drains the queue), 5 (duplicate prevention — replaying the same client tx id returns the existing row, no double count/decrement). 4 (manual "Sync Now") path proven but the button is correctly disabled while offline and auto-sync drains on reconnect first, so a fully isolated manual click wasn't captured. **Still pending:** 6 (mobile↔desktop share). Steps + model in [`DESKTOP_OFFLINE_SYNC.md`](DESKTOP_OFFLINE_SYNC.md).
- [x] **Offline-catalog gap — FOUND & FIXED 2026‑08‑25 (during the live sweep).** Offline, the `/sales` product grid went empty ("No products found") despite Dexie holding the catalog: the six Dexie-backed hooks keyed React-Query on the live `online` flag under the default `networkMode:'online'`, so flipping offline created a fresh, **paused** query key and the Dexie fallback never ran. **Fix (desktop-only, no `shared/` touch):** `networkMode:'always'` + removed `online` from the queryKey on `useProducts`/`useCategories`/`useBranches`/`useCustomers`/`useLowStock`/`useMovements`; connectivity is decided inside each queryFn via `network.isOnline()`, and reconnect refreshes via the default `refetchOnReconnect`. Verified live: offline `/sales` renders all cached products, switching the category filter offline repopulates from Dexie on a fresh key (proving the queryFn runs offline, not just cache retention), reconnect restores the online grid with no console errors. Gates: desktop typecheck ✓ + build ✓ (14 routes). Online-only Phase-3/4A hooks (no Dexie fallback by design) left untouched.

## Phase 3 — Inventory  `[~]`  implementation complete + all hermetic gates green 2026‑08‑23; live scenarios pending a backend run
Admin+manager only (cashiers redirected). Product-centric catalog reusing `GET /v1/products` (branch- + category-scoped), stock status derived client-side. Built sub-step by sub-step (3A→3F), each buildable. Details in [`DESKTOP_INVENTORY.md`](DESKTOP_INVENTORY.md).
- [x] **3A — Catalog (read-only) + role gating + branch selector.** Tabs All/Products/Services/Categories/Low-Stock, client search (name/sku/barcode), category filter, admin branch chips (>1 branch). Additive `shared/` change: extended `Product`/`Category` types + new tested `stockStatus()` in `utils/inventory.ts`. (`app/(app)/inventory/{layout,page}.tsx`, `components/inventory/{InventoryTabs,ProductTable,StockBadge,LowStockList,CategoryList,BranchFilter}.tsx`, `hooks/{useBranches,useLowStock}.ts`, `useProducts` extended)
- [x] **3B — Stock adjustment + movement ledger + quick restock.** Signed delta + free-text reason (client non-negative guard; surfaces backend 400 `Insufficient stock…`); per-product ledger; **+10 quick restock** from Low-Stock. (`hooks/{useAdjustStock,useMovements}.ts`, `components/inventory/{StockAdjustModal,MovementLedgerModal}.tsx`)
- [x] **3C — Product/Service CRUD + image upload + category management.** Full mobile field set (marked/effective/cost price + live margin, tax, unit, initial qty, threshold, category inline-create, description); SERVICE hides stock fields; base64 image upload; **delete admin-only** (UI + backend). (`hooks/{useProductMutations,useUploadProductImage,useCategoryMutations}.ts`, `components/inventory/{ProductFormModal,CategoryFormModal}.tsx`)
- [x] **3D — Stock counts (admin-only).** Start → count-sheet (edits-overlay so background refetch never clobbers typing) → Accept/reconcile (writes `adjustment` movements per variance). (`app/(app)/inventory/counts/{layout,page,[id]/page}.tsx`, `hooks/{useStockCounts,useStockCountMutations}.ts`)
- [x] **3E — Bulk CSV import (admin-only) + Turnover + Expiring.** Raw-CSV import (backend parses) with per-row error report; store-scoped turnover (date range); expiring-batches view with **prominent not-store-scoped warning banner**. (`app/(app)/inventory/{import,turnover,expiring}/page.tsx`, `hooks/{useBulkImport,useTurnover,useExpiringBatches}.ts`, `components/inventory/{TurnoverTable,ExpiringList}.tsx`)
- [x] Respect SERVICE items (no physical inventory) — stock/threshold/unit/ledger hidden; adjust/count reject SERVICE server-side.
- [x] ✅ Hermetic gates: **shared vitest 33/33** · **desktop typecheck clean** · **desktop build ✓ (13 routes, Next 14.2.35)** · **mobile tests 20/20** (intact after the additive `shared/` change).
- [~] ✅ **Live scenarios — PARTIALLY RUN 2026‑08‑25** against a live backend (`store_001`). **Verified:** 3 (edit/delete role gating — a manager sees Adjust/Ledger/Edit but no Delete; backend enforces admin-only delete via 403 at `products.routes.ts`), 9 (turnover + expiring; the not-store-scoped warning banner is present). **Still pending:** 1 catalog/tabs/search, 2 create PRODUCT vs SERVICE, 4 adjust ±N + over-decrement 400 + quick restock, 5 movement ledger, 6 category CRUD, 7 stock count → accept → reconciliation movement, 8 bulk import w/ bad row. Steps in [`DESKTOP_INVENTORY.md`](DESKTOP_INVENTORY.md).

**⚠️ Backend caveats surfaced (NOT fixed this phase — they live in the pre-existing WIP `InventoryService.ts`/`inventory.routes.ts`; deliberately not entangled):**
- [ ] **Store-scope `GET /v1/inventory/expiring`** — `InventoryService.getExpiringBatches` returns batches across *all* stores. Desktop ships a warning banner; the real fix is to filter by `store_id`/authorized branches. **Recommended follow-up.**
- [ ] **`PATCH /v1/inventory/:productId`** has **no role/branch gate** (desktop gates admin+manager in UI only) and **does not write the movement ledger** — direct adjustments won't appear in a product's ledger (only stock-count reconciliation and sales do). Consider writing an `adjustment` movement + a server-side role/branch check.

## Phase 4 — Suppliers & Procurement  `[~]`  split 4A (build) / 4B (design-only) / 4C (docs) per approval 2026‑08‑24
Approved split: **4A = build the Suppliers/AP UI on the existing backend (zero backend/shared/mobile/prisma change); 4B = design doc only; STOP for approval before implementing 4B** (brief §29).

### 4A — Desktop Suppliers + Accounts Payable UI  `[~]`  implementation complete + all hermetic gates green 2026‑08‑24; live scenarios pending a backend run
- [x] Supplier CRUD (reuse `/v1/suppliers`, store-isolated) — directory with client search + tag chips (All/Preferred/Blocked), create/edit/**hard delete** (admin+manager). (`app/(app)/suppliers/{layout,page}.tsx`, `components/suppliers/{SupplierTable,SupplierFormModal}.tsx`, `hooks/{useSuppliers,useSupplierMutations}.ts`, `lib/roles.canManageSuppliers`)
- [x] AP invoices/payments + summary — per-supplier ledger (Invoiced/Paid/Outstanding), invoice create + inline status + delete, payment create (per-invoice balance guard, prefill) + delete; `GET /suppliers/summary` drives per-row outstanding. (`app/(app)/suppliers/[id]/page.tsx`, `components/suppliers/{InvoiceFormModal,PaymentFormModal}.tsx`, `hooks/{useSupplier,useInvoiceMutations,usePaymentMutations}.ts`)
- [x] Online-only (React-Query `online`-keyed, no Dexie) — same model as Phase-3 stock counts. **Zero** backend/`shared/`/mobile/prisma change (supplier types declared locally in desktop hooks).
- [x] ✅ Hermetic gates: **desktop typecheck clean** · **desktop build ✓ (14 routes, Next 14.2.35** — new `/suppliers`, `/suppliers/[id]`**)** · **shared vitest 33/33** (unchanged) · **mobile tests 20/20** (unchanged). Documented in [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md).
- [~] ✅ **Live scenarios — PARTIALLY RUN (live sweep, 2026‑08‑25)** against a live backend (`store_001`). **Verified:** cashier RBAC redirect (`/suppliers` → `/sales`); the AP payment flow — recording a payment rolls the linked invoice's status *forward*, and (finding) **deleting a payment does not roll it back**. Remaining supplier/invoice CRUD paths only partially exercised; see caveat below. Steps in [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md).

**⚠️ Backend caveat surfaced (NOT fixed — inherited from `/v1/suppliers*`):**
- [ ] **`DELETE /suppliers/:id/payments/:paymentId` does not roll back the linked invoice's status.** Verified live 2026‑08‑25: after deleting the only payment on a `partial` invoice, the invoice **stayed `partial`** while its paid total correctly returned to ₦0. `POST /payments` recomputes/advances the status; `DELETE` does not. The desktop UI can't fix this server-side, so the inline status select is the manual correction. Real fix = recompute the invoice's status on payment delete. Corrected the earlier wrong "recording/deleting rolls status" claim in [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md) §3/§4/§5.

### 4B — Procurement (PO → receive → stock-in)  `[!]`  **DESIGN DOC ONLY — awaiting approval before any implementation**
- [x] Design spec written → [`DESKTOP_PROCUREMENT_DESIGN.md`](DESKTOP_PROCUREMENT_DESIGN.md): 4 additive Prisma models (`PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceipt`, `GoodsReceiptItem`), derived state machine, receiving as an atomic `$transaction` that increments `Inventory.quantity_on_hand` + writes one `purchase`-type `InventoryMovement` per line, 7-route API surface, RBAC/scoping, desktop UI plan, additive migration + SQLite note, test plan, open decisions.
- [ ] **STOP — get explicit approval before implementing 4B** (brief §29). Then, in order: additive migration → backend routes/service → desktop PO/receive/stock-in UI + supplier history.
- [ ] **Backend (on approval):** add `PurchaseOrder` / `PurchaseOrderItem` / `GoodsReceipt` / `GoodsReceiptItem` + routes + **additive** migration (no edits to the pre-existing Phase‑1 inventory WIP).
- [ ] **Backend (on approval):** receiving increments inventory via `purchase`-type `InventoryMovement`.
- [ ] Desktop PO → receive → stock-in workflow + supplier history.

## Phase 5 — Analytics & Administration  `[ ]`
- [ ] Dashboard (reuse `/v1/analytics/dashboard`) + KPIs incl. outstanding sync count.
- [ ] Reports (EOD, voids), date-range filtering, **CSV** + **PDF** export, P&L where data supports.
- [ ] Employees + roles (reuse `/auth/register`, role PATCH); permissions UI.
- [ ] **Backend:** `SyncDevice` registry; desktop device/sync management + conflict view.

## Phase 6 — Printing & Deployment  `[ ]`
- [ ] Thermal receipt printing (browser print first; ESC/POS via QZ Tray if needed) + printer config in Settings.
- [ ] PWA installability verified (Chrome/Edge).
- [ ] Docker image for `desktop/`; local/on-prem + cloud deployment configs.
- [ ] **SQLite local-mode investigation** (backend): 6 `Json`→`String`, ~46 `@db.*` strips, separate SQLite schema + fresh migration baseline. Document blockers before implementing. **Don't touch prod Postgres.**
- [ ] ✅ Verify scenario **7 (PWA offline shell)**.

---

## Docs to keep current (describe *actual* implementation)
- [-] ~~`DESKTOP_IMPLEMENTATION_AUDIT.md`~~ (skipped by request; facts live in `CLAUDE.md`)
- [ ] `DESKTOP_ARCHITECTURE.md`
- [ ] `DESKTOP_SETUP.md`
- [x] `DESKTOP_OFFLINE_SYNC.md` — hybrid sync model, idempotency, triggers (Phase 2).
- [x] `DESKTOP_INVENTORY.md` — inventory endpoints, role/branch model, caveats (Phase 3).
- [x] `DESKTOP_SUPPLIERS.md` — Suppliers/AP UI, contract, parity decisions, caveats (Phase 4A).
- [x] `DESKTOP_PROCUREMENT_DESIGN.md` — PO/receiving spec, **design-only, not yet built** (Phase 4B).
- [ ] `DESKTOP_DEPLOYMENT.md`

## Definition of done (per success criteria)
Desktop works online + offline · offline sales sync reliably with no duplicates · mobile↔desktop data exchange · inventory consistent · suppliers/purchasing supported · reports + thermal printing + PWA install work · local + cloud deploy supported · **mobile app still fully intact** · tests pass · docs match reality.
