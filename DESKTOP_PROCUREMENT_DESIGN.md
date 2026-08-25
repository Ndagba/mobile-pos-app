# DESKTOP_PROCUREMENT_DESIGN.md — Phase 4B Design (SPEC ONLY)

> **Status: DESIGN ONLY. Not implemented.** This document specifies the Purchase-Order → Receiving → Stock-in subsystem that Phase 4 needs. **No `schema.prisma` edits, no migration, and no route code have been written for this.** Per the brief (§29) and `CLAUDE.md §9`, implementation begins only after **separate, explicit approval**. Everything below is a proposal to be reviewed.
>
> Companion docs: [`CLAUDE.md`](CLAUDE.md) (guardrails + verified architecture), [`DESKTOP_SUPPLIERS.md`](DESKTOP_SUPPLIERS.md) (the Phase 4A AP UI that shipped), [`TODO.md`](TODO.md).
> Schema facts below were verified against `backend/prisma/schema.prisma` on **2026‑08‑24**.

---

## 1. Why this exists (the gap)

Phase 4A delivered the **accounts-payable** side of suppliers: `Supplier`, single-line `PurchaseInvoice`, `SupplierPayment`, and a `/suppliers/summary` — all of which already existed in the backend and now have a desktop UI. What is **genuinely missing** (confirmed in `CLAUDE.md §6`) is the **operational procurement flow**:

- **No `PurchaseOrder` / `PurchaseOrderItem`.** There is no way to raise a multi-line order to a supplier, track it, or receive against it.
- **Purchasing never touches stock.** `PurchaseInvoice` has **no product FK** and writes **no `InventoryMovement`**. The `InventoryMovement.movement_type` column already documents a **`purchase`** value (`schema.prisma:601`), but **nothing ever writes one** — the only stock-in paths today are stock-count reconciliation (`adjustment`) and the un-ledgered `PATCH /inventory/:productId`.

So Phase 4B is the **greenfield** half: model a PO lifecycle, and make **receiving** the single place that increases inventory via a proper `purchase` movement.

### What already exists and is reused (not rebuilt)
- `Supplier` (tenant-scoped, tagged) — POs reference it.
- `Product` + 1:1 `Inventory` (`quantity_on_hand`) — receiving increments this.
- `InventoryMovement` ledger with a reserved `purchase` type — receiving writes here.
- `PurchaseInvoice` + `SupplierPayment` (AP) — a received PO can **optionally spawn** a `PurchaseInvoice` so the payable and the receipt stay linked.
- `BatchTracking` (lot/expiry) — receiving *may* create a batch when the product is batch-tracked.
- `branchHelper.getAuthorizedBranchId/Ids` — reused verbatim for scoping.

---

## 2. Design principles (guardrails for the implementer)

1. **Strictly additive schema.** New models + new **back-relation fields** on `Supplier`, `Branch`, `Product`, `User` only. **No column is renamed, retyped, or dropped.** No change to `Transaction`, `Inventory`, `PurchaseInvoice` semantics. This keeps the migration a pure `CREATE TABLE` + `ADD COLUMN`(FK back-refs are relation-only, no physical column on the parent) set — safe to run on the live Postgres.
2. **Follow existing conventions exactly.** UUID string PKs (`@default(uuid())`), money `Decimal(15,2)`, quantity `Decimal(15,4)`, **string enum-like status fields with inline comments (zero Prisma `enum`s)**, `store_id` string tenant + `branch_id` string location, `created_at @default(now())` / `updated_at @updatedAt`, indexes on `store_id`/`branch_id`/FKs/`status`.
3. **Receiving is the *only* new stock-in.** Increment `Inventory.quantity_on_hand` **and** write one `InventoryMovement { movement_type: 'purchase', quantity: +received, reference_id: <goods_receipt_id> }` **in the same Prisma transaction**. Never adjust stock from PO creation or from AP invoices.
4. **Reuse the sales stock engine's shape, not a copy.** Mirror how `TransactionService` decrements stock (per-line, inside `prisma.$transaction`) — receiving is the mirror-image increment. Extract shared quantity math into `@jaypos/shared` only if it earns its place; otherwise keep it server-side.
5. **RBAC + scoping identical to suppliers/inventory.** All PO writes = **admin | manager**; reads = any authed user in the store; every query filtered by `getAuthorizedBranchIds`. Cashiers never see procurement.
6. **No overengineering.** No approval-workflow engine, no multi-currency, no landed-cost allocation, no supplier catalog/price lists, no auto-reorder. Draft → order → receive (with partial receipts) → close. That's it.
7. **Idempotent receiving (offline-safe option).** Receiving is an online admin action, so full offline queueing is **out of scope for 4B**. But to make a double-submit safe, `GoodsReceipt` carries an optional `receipt_hash String? @unique` mirroring the sales `offline_session_hash` idea; the endpoint returns the existing receipt on collision. (Optional — see §11.)

---

## 3. Proposed data model (additive)

Four new models. Field types mirror the verified schema.

### 3.1 `PurchaseOrder` (header)
```prisma
model PurchaseOrder {
  id            String    @id @default(uuid())
  store_id      String    // tenant isolation (string, not FK — matches Transaction/Supplier)
  branch_id     String    // receiving location
  supplier_id   String
  po_number     String    // human ref, unique per store (see @@unique)
  status        String    @default("draft") // draft, ordered, partially_received, received, cancelled
  order_date    DateTime? @db.Date          // set when moved to "ordered"
  expected_date DateTime? @db.Date
  currency      String    @default("NGN")   // single-currency today; column reserved
  subtotal      Decimal   @default(0) @db.Decimal(15, 2) // Σ(line qty × unit_cost)
  tax_amount    Decimal   @default(0) @db.Decimal(15, 2)
  total_amount  Decimal   @default(0) @db.Decimal(15, 2)
  notes         String?
  created_by_user_id String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  supplier Supplier            @relation(fields: [supplier_id], references: [id], onDelete: Restrict)
  branch   Branch              @relation(fields: [branch_id], references: [id])
  created_by User?             @relation("POCreatedBy", fields: [created_by_user_id], references: [id], onDelete: SetNull)
  items    PurchaseOrderItem[]
  receipts GoodsReceipt[]

  @@unique([store_id, po_number])
  @@index([store_id])
  @@index([branch_id])
  @@index([supplier_id])
  @@index([status])
  @@index([order_date])
}
```

> **`onDelete: Restrict` on supplier** — a supplier with POs can't be hard-deleted. **Caveat:** Phase 4A's `DELETE /suppliers/:id` is a hard delete; once POs exist, that delete will start failing with an FK error for suppliers that have orders. That's arguably correct (don't delete a supplier with history), but it changes 4A's delete behavior, so it must be called out and the 4A confirm-dialog copy revisited when 4B lands. Alternative: `onDelete: SetNull` + nullable `supplier_id` if we prefer soft orphaning. **Decision needed (§12).**

### 3.2 `PurchaseOrderItem` (lines)
```prisma
model PurchaseOrderItem {
  id                String  @id @default(uuid())
  purchase_order_id String
  product_id        String
  quantity_ordered  Decimal @db.Decimal(15, 4)
  quantity_received Decimal @default(0) @db.Decimal(15, 4) // running total across receipts
  unit_cost         Decimal @db.Decimal(15, 2)
  line_total        Decimal @db.Decimal(15, 2) // quantity_ordered × unit_cost (client-computed, server-validated)
  notes             String?

  purchase_order PurchaseOrder @relation(fields: [purchase_order_id], references: [id], onDelete: Cascade)
  product        Product       @relation(fields: [product_id], references: [id], onDelete: Restrict)

  @@index([purchase_order_id])
  @@index([product_id])
}
```

> **SERVICE items are rejected** at the route layer (like `InventoryService` rejects SERVICE for adjust/count) — you can't order stock for something with no inventory.

### 3.3 `GoodsReceipt` (a single receiving event against a PO — supports partial receipts)
```prisma
model GoodsReceipt {
  id                String   @id @default(uuid())
  store_id          String
  branch_id         String
  purchase_order_id String
  received_date     DateTime @db.Date
  reference         String?  // supplier delivery note / waybill no.
  receipt_hash      String?  @unique // optional idempotency key (see §11)
  notes             String?
  received_by_user_id String?
  created_at        DateTime @default(now())

  purchase_order PurchaseOrder      @relation(fields: [purchase_order_id], references: [id], onDelete: Cascade)
  branch         Branch             @relation(fields: [branch_id], references: [id])
  received_by    User?              @relation("GoodsReceivedBy", fields: [received_by_user_id], references: [id], onDelete: SetNull)
  items          GoodsReceiptItem[]

  @@index([store_id])
  @@index([branch_id])
  @@index([purchase_order_id])
  @@index([received_date])
}
```

### 3.4 `GoodsReceiptItem` (what was received, per line)
```prisma
model GoodsReceiptItem {
  id                   String  @id @default(uuid())
  goods_receipt_id     String
  purchase_order_item_id String
  product_id           String
  quantity_received    Decimal @db.Decimal(15, 4)
  unit_cost            Decimal @db.Decimal(15, 2) // captured for cost history; defaults from the PO line
  batch_number         String? // when the product is batch-tracked
  expiry_date          DateTime? @db.Date

  goods_receipt      GoodsReceipt      @relation(fields: [goods_receipt_id], references: [id], onDelete: Cascade)
  purchase_order_item PurchaseOrderItem @relation(fields: [purchase_order_item_id], references: [id], onDelete: Restrict)
  product            Product           @relation(fields: [product_id], references: [id], onDelete: Restrict)

  @@index([goods_receipt_id])
  @@index([purchase_order_item_id])
  @@index([product_id])
}
```

### 3.5 Additive back-relations on existing models (relation-only, no physical column change)
- `Supplier` → `purchase_orders PurchaseOrder[]`
- `Branch` → `purchase_orders PurchaseOrder[]`, `goods_receipts GoodsReceipt[]`
- `Product` → `purchase_order_items PurchaseOrderItem[]`, `goods_receipt_items GoodsReceiptItem[]`
- `User` → `created_purchase_orders PurchaseOrder[] @relation("POCreatedBy")`, `goods_receipts GoodsReceipt[] @relation("GoodsReceivedBy")`

These are the *only* edits to existing models — pure relation arrays, no data change.

---

## 4. Lifecycle / state machine

```
        create              submit                 receive (partial)         receive (rest)
draft ──────────► draft ──────────► ordered ──────────────────► partially_received ──────► received
  │  (edit lines freely)               │                                │                      │
  │                                    │  receive (full in one go)       │                      │
  │                                    └────────────────────────────────┴──────────────────────► received
  │
  └── cancel ─► cancelled     (allowed from draft or ordered; NOT after any receipt)
```

- **draft** — lines fully editable; no stock impact. Deletable.
- **ordered** — committed to the supplier (`order_date` stamped). Lines locked for quantity edits (or allow edits only to *not-yet-received* quantities — decision §12). Still cancellable.
- **partially_received** — at least one `GoodsReceipt` exists but `Σ quantity_received < Σ quantity_ordered` on some line.
- **received** — every line's `quantity_received ≥ quantity_ordered`. Terminal (a "reopen" is out of scope).
- **cancelled** — terminal; only reachable before any receipt.

**Status is derived, not free-typed.** The server recomputes header status after each receipt from the line roll-ups (mirrors how `POST /suppliers/:id/payments` recomputes invoice status). Over-receipt (receiving more than ordered) is **allowed but flagged** by default (real deliveries overship); a strict mode can reject it — decision §12.

---

## 5. Receiving → stock-in (the core transaction)

`POST /purchase-orders/:id/receipts` does all of the following **inside one `prisma.$transaction`** (all-or-nothing, mirroring `TransactionService.createTransaction`'s atomic stock decrement):

1. Validate the PO belongs to the caller's store + authorized branch and is in `ordered` / `partially_received`.
2. Create the `GoodsReceipt` (+ optional `receipt_hash` idempotency check → return existing on hit).
3. For each received line:
   a. Create a `GoodsReceiptItem`.
   b. `Inventory.update` → `quantity_on_hand += quantity_received` (create the `Inventory` row if somehow missing — shouldn't happen for a PRODUCT).
   c. **Write the ledger row:** `InventoryMovement.create({ store_id, branch_id, product_id, movement_type: 'purchase', quantity: +quantity_received, reference_id: goodsReceipt.id, user_id })`.
   d. Bump `PurchaseOrderItem.quantity_received += quantity_received`.
   e. If `batch_number`/`expiry_date` supplied and the product is batch-tracked, upsert `BatchTracking` (respect its `@@unique([product_id, batch_number])`).
4. Recompute + persist the header `status` from the line roll-ups.
5. **Optionally** create a `PurchaseInvoice` for this receipt (`amount = Σ received × unit_cost`, `status: 'unpaid'`, linked back via a new nullable `purchase_order_id` on `PurchaseInvoice` — **that column would be an additional additive change**, see §12) so the AP ledger reflects the liability. Default: **off**, behind a `create_invoice: boolean` flag in the request, so 4B doesn't silently double-count for shops that record AP invoices by hand.

> **Cost price update (optional, decision §12):** receiving is the natural place to refresh `Product.cost_price` to the latest `unit_cost` (or a moving average). Proposed default for 4B: **leave `cost_price` untouched** (least surprise); expose it as a later enhancement.

---

## 6. API surface (proposed, all under `/v1`, standard `{status:'success', data}` envelope)

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/purchase-orders` | any authed | List POs for authorized branches; filters: `status`, `supplier_id`, `branch_id`, `search` (po_number), pagination. |
| `POST` | `/purchase-orders` | admin/manager | Create a **draft** PO with lines. Server computes/validates totals. |
| `GET` | `/purchase-orders/:id` | any authed | PO header + items + receipts (+ derived received/outstanding per line). |
| `PATCH` | `/purchase-orders/:id` | admin/manager | Edit draft (lines, notes, expected_date) **or** transition status (`draft`→`ordered`, `→cancelled`). |
| `DELETE` | `/purchase-orders/:id` | admin/manager | Delete a **draft** only (never after `ordered`/receipts). |
| `POST` | `/purchase-orders/:id/receipts` | admin/manager | **Receive** goods → the §5 transaction. Body: `{ received_date, reference?, receipt_hash?, create_invoice?, items:[{ purchase_order_item_id, quantity_received, unit_cost?, batch_number?, expiry_date? }] }`. |
| `GET` | `/purchase-orders/:id/receipts` | any authed | Receipt history for a PO. |

**Create body shape:**
```jsonc
POST /v1/purchase-orders
{
  "branch_id": "…",            // required; validated against getAuthorizedBranchId
  "supplier_id": "…",
  "po_number": "PO-20260824-1234",   // client-suggested; server enforces @@unique per store, or generates if absent
  "expected_date": "2026-09-01",
  "notes": "…",
  "items": [
    { "product_id": "…", "quantity_ordered": 24, "unit_cost": 850.00, "notes": "…" }
  ]
}
```
Server recomputes `line_total`, `subtotal`, `tax_amount` (per-product `tax_rate`, matching sales), `total_amount` — **it does not trust client totals for POs** (unlike sales, where the server trusts client math; here there's no offline-idempotency reason to, so validate server-side).

---

## 7. RBAC & multi-tenancy

- **Writes** (`POST`/`PATCH`/`DELETE`, receiving): inline `if (!['admin','manager'].includes(user.role)) throw new AppError(403, …)` — identical to `suppliers.routes.ts`.
- **Reads**: any authenticated user in the store.
- **Branch scope**: writes use `getAuthorizedBranchId(req)`; reads use `getAuthorizedBranchIds(req)` → admin all branches, manager home+assigned, cashier home only. A manager can only receive into a branch they're assigned to.
- **Tenant**: every row carries `store_id = user.storeId`; every query is `store_id`-filtered. (Learn from the Phase-3 caveat where `GET /inventory/expiring` leaked across stores — **do not repeat that**; scope every procurement query.)

---

## 8. Desktop UI plan (Phase 4B front-end, built after the backend lands)

New section under Suppliers (or a sibling "Purchasing" nav entry, admin+manager-gated like Inventory):

- **`/purchasing`** — PO list: status chips (Draft/Ordered/Partially received/Received/Cancelled), supplier + branch filter, search by PO number, "New PO".
- **`/purchasing/new`** & **`/purchasing/[id]`** — PO builder/detail: supplier picker (reuses `useSuppliers`), branch selector (admin, reuses `useBranches`), product line editor (reuses product search from POS/inventory), live totals via the shared cart-style math, status actions (Submit / Cancel), and a **Receive** action.
- **Receive modal** — per-line "ordered / already received / receiving now" with a batch/expiry sub-form for batch-tracked products; posts to `/receipts`.
- **Receipt history** on the PO detail; each received line links to the product's movement ledger (the `purchase` movement now shows up there — closing the Phase-3 loop).
- Hooks mirror 4A: `usePurchaseOrders`, `usePurchaseOrder(id)`, `usePurchaseOrderMutations`, `useReceiveGoods(poId)` — **online-only** (procurement is an admin desk activity), React-Query `online`-keyed, no Dexie.

Reuses existing primitives (`Modal`, `ConfirmDialog`, `Button`, `Input`, table patterns, `naira`) — **no new UI deps**.

---

## 9. Migration plan

1. Edit `backend/prisma/schema.prisma`: add the 4 models (§3.1–3.4) + the back-relation arrays (§3.5) [+ optional nullable `purchase_order_id` on `PurchaseInvoice` if §5.5 invoice-linking is approved].
2. `npx prisma migrate dev --name add_purchase_orders` (dev) → generates a **purely additive** SQL migration (new tables + FK constraints; no `ALTER … DROP`/`TYPE`).
3. `npx prisma generate` to refresh the client.
4. Deploy: `npx prisma migrate deploy` over SSH on Opalstack (per `DEPLOY.md`). **No data backfill** — all new tables start empty; existing rows untouched.
5. **SQLite portability** (the optional backend local-mode, `CLAUDE.md` caveats): these models use no `Json` and only `@db.Decimal`/`@db.Date` attributes, so they carry the **same** SQLite-porting cost as the rest of the schema (strip `@db.*`, separate SQLite baseline) — they add **no new** blocker. Note it; don't solve it here.

**Rollback**: drop the 4 new tables + remove the relation arrays; no existing data is at risk because nothing writes to old tables differently.

---

## 10. Testing plan (when implemented)

- **Backend unit (hermetic, `mockPrisma`)**: PO total computation; status derivation (draft→ordered→partial→received); over-receipt handling; SERVICE-item rejection; **receiving writes exactly one `purchase` movement per line and increments `quantity_on_hand` by the received qty** (the load-bearing assertion); idempotent receipt on `receipt_hash` collision; RBAC 403s; cross-store isolation.
- **Shared vitest**: only if quantity/total math is extracted to `@jaypos/shared` (keep it byte-tested like `cart.ts`). If nothing is extracted, no shared test changes — and **mobile stays 20/20 untouched**.
- **Desktop**: typecheck + build must stay green; hooks typed against the new wire shapes.
- **Live scenarios** (need a running backend): raise PO → submit → partial receive → verify stock + ledger movement → receive remainder → status `received` → (optional) AP invoice created → pay it via the 4A ledger.

---

## 11. Idempotency detail (optional, recommended)

Receiving mutates stock, so a retried/double-clicked submit must not double-increment. Two layers:
1. **UI**: disable the Receive button while the mutation is in flight (as 4A does for every mutation).
2. **Server (optional `receipt_hash`)**: client sends `receipt_hash = SHA256(\`${poId}-${clientReceiptUuid}-${received_date}\`)`; the endpoint does a `findUnique` on the `@unique` column first and returns the existing `GoodsReceipt` on hit (same pattern as `TransactionService` returning the existing row for a duplicate `offline_session_hash`). This makes receiving safe under flaky connections without building full offline queueing (which is **out of scope**).

---

## 12. Open decisions (resolve at 4B approval)

1. **Supplier delete vs. `onDelete`**: `Restrict` (block deleting a supplier with POs — changes 4A hard-delete behavior) vs. `SetNull` (orphan POs). **Recommend `Restrict`** + update the 4A delete copy.
2. **AP invoice on receipt**: auto-create a linked `PurchaseInvoice` (needs an additive nullable `purchase_order_id` column on `PurchaseInvoice`) behind a `create_invoice` flag, default **off**? **Recommend yes-but-off-by-default.**
3. **Over-receipt**: allow-and-flag (default) vs. hard-reject.
4. **Edit after `ordered`**: lock all lines vs. allow editing not-yet-received quantities. **Recommend lock quantities, allow notes/expected_date.**
5. **`cost_price` refresh on receive**: leave untouched (default) vs. update-to-latest vs. moving-average.
6. **`po_number`**: client-supplied (with server `@@unique` enforcement) vs. server-generated sequence.
7. **Extraction to `shared/`**: keep PO math server-only vs. extract for a future mobile procurement screen. **Recommend server-only for 4B** (mobile has no procurement UI; extract when it does).

---

## 13. Explicitly out of scope for Phase 4B
Approval workflows / authorization limits · multi-currency & FX · landed-cost / freight allocation · supplier price lists & catalogs · automatic reorder / min-max planning · returns-to-supplier (debit notes) · inter-branch transfers (separate `TODO.md` item) · full offline queueing of receipts · any change to sales, existing AP semantics, or the idempotency hash for sales.

---

## 14. Definition of done (Phase 4B, for later)
Additive migration applied cleanly · a PO can be raised, ordered, and received (partial + full) · **each receipt writes a `purchase` `InventoryMovement` and increases `quantity_on_hand` atomically** · movements appear in the product ledger · RBAC + store/branch scoping enforced on every route · backend unit tests green · desktop typecheck+build green · **shared 33/33 and mobile 20/20 unchanged** · this doc updated to match what was actually built.
