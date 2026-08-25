# DESKTOP_INVENTORY.md — Desktop POS: Inventory (Phase 3)

How the desktop app (`desktop/`) manages the catalog and stock. It reuses the **existing** backend endpoints mobile uses — no second inventory system. Verified against the on-disk (WIP) backend on **2026‑08‑23**; where the code and the docs disagree, the code governs.

Companion docs: [`CLAUDE.md`](CLAUDE.md) §3–§6 (architecture), [`TODO.md`](TODO.md) (tracker + follow-ups), [`DESKTOP_OFFLINE_SYNC.md`](DESKTOP_OFFLINE_SYNC.md) (Phase 2 sales/sync).

---

## 1. Design in one line

**The catalog is product-centric.** Everything hangs off a single branch- and category-scoped `GET /v1/products?limit=500` load (which includes each product's 1:1 `inventory` row and its `category`); stock status is derived **client-side**. This mirrors mobile exactly. We deliberately do **not** drive the catalog from `GET /v1/inventory` — that endpoint is store-only (no branch scoping), includes services, and its `nextCursor` is dropped by the envelope unwrap.

## 2. Access model (UI mirrors the backend)

| Capability | Who | Enforced |
| --- | --- | --- |
| View inventory (all tabs, turnover, expiring) | **admin + manager** | `app/(app)/inventory/layout.tsx` redirects cashier → `/sales`; Sidebar item hidden for cashier |
| Create / edit product, service, category | admin + manager | backend `POST`/`PATCH` allow both |
| **Delete** product / category | **admin only** | UI hides the action for managers; backend returns 403 otherwise |
| **Bulk CSV import** | **admin only** | `import/page.tsx` bounces managers; backend returns 403 |
| **Stock counts** (start / count / accept) | **admin only** (mobile parity) | `inventory/counts/layout.tsx` redirects non-admins. *(Backend has no inline role check on stock-count routes — the gate is UI-side, matching mobile.)* |

**Branch scoping** follows `branchHelper`: admin sees all branches (a branch selector appears only when >1 active branch); manager sees home + assigned; cashier is never here. On **writes that need a branch** (product create, stock-count create, bulk import) an **admin must supply `branch_id`** — `getAuthorizedBranchId` returns `null` for an admin who omits it (→ 400). The desktop forms always send one (default = first branch).

## 3. Endpoints used

All under `/v1`, envelope `{ status:'success', data, … }`. `apiClient` unwraps **one** `.data` level; sibling fields (`count`, `pagination`, `nextCursor`) are dropped — fine for these views. **Decimals arrive as JSON strings** and are coerced at the edge (`lib/normalize.ts` → `numify`/`numOr0`).

**Products / categories**
- `GET /products?search=&category_id=&limit=&offset=` — branch-scoped; includes `category` + `inventory`. (`/products/search` is dead — shadowed by `/:id`; search via this route.)
- `POST /products` (admin+manager) — client sends **`marked_price`** (tag) + optional `effective_price`; auto-creates the 1:1 Inventory row for PRODUCT, **skips it for SERVICE**. Admin → `branch_id` in body wins; manager → JWT branch.
- `PATCH /products/:id` (admin+manager, partial) — does **not** touch stock qty; enforces item_type transition rules. (Threshold edits go through `PATCH /inventory/:id`.)
- `DELETE /products/:id` (**admin only**) — soft delete (deactivate); past sales unaffected.
- `POST /products/upload-image { image }` (base64, admin+manager).
- `POST /products/bulk-import { branch_id, csv }` (**admin only**) → `{ categories_created, products_created, products_updated, errors:[{row,error}] }`. Required headers `category,name,sku` + one of `selling_price|price|marked_price`; optional incl. `initial_stock`, `low_stock_threshold`, `item_type`. Matched by SKU then barcode (re-import updates).
- `GET /categories` (branch-scoped, `_count.products`); `POST`/`PATCH` admin+manager; `DELETE` admin only.

**Inventory**
- `GET /inventory/low-stock?branch_id=` → `{ product_id, product_name, sku, current_quantity, low_stock_threshold, reorder_point, alert_level }` (numbers; SERVICE excluded).
- `PATCH /inventory/:productId { quantity?(delta), reason?(required with quantity), low_stock_threshold? }` → raw inventory row (Decimal **strings**). SERVICE → 400; negative result → **400 `Insufficient stock for this operation`**. ⚠️ See caveats.
- `GET /inventory/movements?product_id=&limit=&type=&dateFrom=&dateTo=` → ledger rows (+`product`, +`user`).
- `GET /inventory/turnover?dateFrom=&dateTo=` (**both required**, else 400; **store-scoped**) → `{ id, name, sku, total_sold, transaction_count, turnover_ratio }` (metrics as strings; ratio nullable).
- `GET /inventory/expiring?days=` → `{ batch_id, product_name, sku, batch_number, manufactured_date, expiry_date, quantity, days_until_expiry, urgency }`. ⚠️ **Not store-scoped** — see caveats.

**Stock counts** (admin-only in UI)
- `POST /stock-counts { notes?, branch_id? }` — pre-populates items for active PRODUCT items; returns the header.
- `GET /stock-counts?branch_id=` (branch-scoped list, +`started_by`/`completed_by`/`branch`).
- `GET /stock-counts/:id` (count + items; numeric `system_quantity`/`physical_quantity`/`variance`).
- `PATCH /stock-counts/:id/items { items:[{product_id, physical_quantity, notes}] }` (SERVICE → 400).
- `POST /stock-counts/:id/accept` — for each item with `physical != null && variance != 0`: sets on-hand = physical **and writes an `adjustment` `InventoryMovement`** (reference = count id); sets status `completed`. Re-accepting a completed count → 400. **This is the only non-sale writer of the movement ledger.**

**Branches**
- `GET /branches` — powers the admin multi-branch selector (rendered only when >1 active branch).

## 4. Where the code lives

- **Pages:** `app/(app)/inventory/{layout,page}.tsx`, `inventory/counts/{layout,page,[id]/page}.tsx`, `inventory/{import,turnover,expiring}/page.tsx`.
- **Components:** `components/inventory/{InventoryTabs,ProductTable,StockBadge,LowStockList,CategoryList,BranchFilter,StockAdjustModal,MovementLedgerModal,ProductFormModal,CategoryFormModal,TurnoverTable,ExpiringList}.tsx`.
- **Hooks:** `hooks/{useBranches,useProducts,useCategories,useLowStock,useMovements,useAdjustStock,useProductMutations,useUploadProductImage,useCategoryMutations,useStockCounts,useStockCountMutations,useBulkImport,useTurnover,useExpiringBatches}.ts`.
- **Shared (additive):** `Product`/`Category` types extended; new pure, tested `stockStatus(item, threshold)` in `shared/src/utils/inventory.ts`. Mobile still consumes its own copies — no mobile rewiring.

**Patterns reused from Phase 2:** read hooks are React Query **network-first + Dexie/SWR fallback** with `online` in the query key (products, low-stock); turnover / expiring / stock-counts are **online-only** (no Dexie method exists for them — pages show a "needs a connection" message on error). All **mutations require online** — inventory writes are never queued (mirrors mobile). View-only row shapes live in their desktop hook files, not `shared/`. The stock-count sheet uses an **edits-overlay** so a background refetch never clobbers unsaved typing.

## 5. Caveats (read before extending)

1. **`GET /inventory/expiring` is not store-scoped.** `InventoryService.getExpiringBatches` returns batches across *all* stores. The desktop Expiring view ships a **prominent amber warning banner** and treats results as indicative. **Recommended backend follow-up:** filter by `store_id`/authorized branches. Deliberately **not** bundled here — it touches the pre-existing WIP `InventoryService.ts`. Tracked in [`TODO.md`](TODO.md).
2. **`PATCH /inventory/:productId` has no role/branch gate and does not write the movement ledger.** Desktop gates it admin+manager **in the UI only**, and direct stock adjustments **won't appear** in a product's ledger — only stock-count reconciliation and sales write movements. If ledger completeness matters, adjust the backend to write an `adjustment` movement (and add a server-side role/branch check). Tracked in [`TODO.md`](TODO.md).
3. **SERVICE items** carry no inventory: stock/threshold/unit fields and the ledger are hidden in the UI, and the backend rejects adjust/count on them (400). The catalog derives status client-side, so SERVICE rows show a "Service" pill rather than a quantity.
4. **Client trusts no server math here, but sends tag prices.** Product create sends `marked_price` (+ optional `effective_price`); the server derives `effective_price` when absent. This is unrelated to the sales-total rule in `DESKTOP_OFFLINE_SYNC.md`.

## 6. Live verification (needs a running backend + active-subscription store, admin login)

Point `desktop/.env.local` `NEXT_PUBLIC_API_URL` at it, `npm run dev:desktop`, log in as admin, then:
1. **Catalog** loads branch-scoped; tabs filter (services show a Service pill, no stock); search matches name/sku/barcode; category filter + branch chips (admin) work.
2. **Create** a PRODUCT (stock + threshold + category) → correct badge, auto-created inventory row. Create a SERVICE → stock fields hidden, no inventory row.
3. **Edit** price/threshold; **Delete** hidden for a manager, works for admin.
4. **Adjust stock** +N / −N with a reason; over-decrement → inline **`Insufficient stock for this operation`**; SERVICE adjust rejected. **+10 quick restock** from Low-Stock drops the item off the list.
5. **Movement ledger** modal lists sales + adjustments for a product (note: direct `PATCH` adjustments won't show — caveat 2).
6. **Category** create / edit / delete (delete admin-only).
7. **Stock count:** start → enter physicals → **Accept** → on-hand matches physical and a reconciliation **movement** appears in the ledger.
8. **Bulk import** a CSV with one bad row → report shows created/updated counts + the per-row error.
9. **Turnover** for a date range renders numeric metrics; **Expiring** renders with the non-scoped warning banner.

**Status:** implementation complete + hermetic gates green (shared vitest **33/33**, desktop typecheck clean, desktop build ✓ **13 routes**, mobile **20/20**). Live scenarios **1–9 not yet run** — no backend with an active-subscription store reachable in the build environment.
