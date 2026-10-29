# DESKTOP_SUPPLIERS.md — Phase 4A: Suppliers & Accounts Payable (SHIPPED)

Documents the **desktop Suppliers + Accounts-Payable UI** delivered in Phase 4A. This is a **UI-only** phase built on the **existing** `/v1/suppliers*` backend — **zero** backend / `shared/` / mobile / Prisma changes. The operational procurement half (purchase orders, receiving, stock-in) is specified separately in [`DESKTOP_PROCUREMENT_DESIGN.md`](DESKTOP_PROCUREMENT_DESIGN.md) (Phase 4B, **design only, not built**).

Verified against the working tree on **2026‑08‑24**. Companion: [`CLAUDE.md`](CLAUDE.md), [`TODO.md`](TODO.md).

---

## 1. Scope

Mirrors mobile's `SuppliersScreen` + `SupplierLedgerScreen` for the desktop PWA:

- **Supplier directory** — list/search/filter, create, edit, delete, per-supplier outstanding balance.
- **AP ledger per supplier** — invoiced / paid / outstanding stats; purchase invoices (create, inline status change, delete); payments (create against an open invoice, delete).
- **Access** — admin + manager only; cashiers are redirected. The sidebar entry is now gated (was "soon").

Everything is **online-only** (an admin desk activity): no Dexie cache, React-Query `online`-keyed so views error while offline and refetch on reconnect — the same model as Phase-3 stock counts.

---

## 2. Files added / changed

**Changed (2):**
- `desktop/lib/roles.ts` — added `canManageSuppliers()` (admin | manager | super-admin).
- `desktop/components/layout/Sidebar.tsx` — Suppliers nav item now `visible: canManageSuppliers` (was `disabled`); comment updated. Reports remains the only `disabled` entry.

**New hooks (5), `desktop/hooks/`:**
- `useSuppliers.ts` — `useSuppliers()` (`GET /suppliers?limit=200`, loaded once, filtered client-side), `useSupplierSummary()` (`GET /suppliers/summary`, totals → numbers, `outstanding = max(0, invoiced − paid)`). Declares the local `Supplier` + `SupplierSummaryRow` types (not in `@jaypos/shared`).
- `useSupplier.ts` — `useSupplier(id)`, `useSupplierInvoices(id)`, `useSupplierPayments(id)`; declares `PurchaseInvoice` + `SupplierPayment`; normalizes Decimal **strings** → numbers (`amount`/`quantity`/`unit_price`).
- `useSupplierMutations.ts` — create / update / remove supplier.
- `useInvoiceMutations.ts` — create / updateStatus / remove invoice (scoped to a supplier).
- `usePaymentMutations.ts` — create / remove payment (scoped to a supplier).

**New components (4), `desktop/components/suppliers/`:**
- `SupplierTable.tsx` — presentational (name+category, contact, tag badge, outstanding, injected row actions).
- `SupplierFormModal.tsx` — create/edit; free-text category with `<datalist>` suggestions; tag select.
- `InvoiceFormModal.tsx` — record invoice; auto-fills amount from qty × unit price (editable).
- `PaymentFormModal.tsx` — record payment against an open invoice; prefills the invoice balance.

**New pages (3), `desktop/app/(app)/suppliers/`:**
- `layout.tsx` — role guard (`canManageSuppliers`, redirect `/sales`).
- `page.tsx` — directory.
- `[id]/page.tsx` — AP ledger (Invoices | Payments tabs).

---

## 3. Backend contract consumed (read-only; verified in `suppliers.routes.ts`)

Standard envelope `{status:'success', data, [pagination]}`; `apiClient` unwraps one `.data`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/suppliers?limit=200` | Active suppliers, store-scoped, `name ASC`. |
| `GET` | `/suppliers/summary` | `[{supplier_id, total_invoiced, total_paid}]` — **already numbers** (`Number()` server-side). |
| `GET` | `/suppliers/:id` | Single supplier. |
| `POST` | `/suppliers` | `{name*, phone, email, address, category, notes, tag}`. admin/manager. |
| `PATCH` | `/suppliers/:id` | Same fields + `is_active`. admin/manager. |
| `DELETE` | `/suppliers/:id` | **Hard delete.** admin/manager. |
| `GET` | `/suppliers/:id/invoices` | Decimal fields are **strings** → normalized. |
| `POST` | `/suppliers/:id/invoices` | `{invoice_date*, amount*, invoice_number, due_date, quantity, unit_price, notes}`; server forces `status:'unpaid'`. |
| `PATCH` | `/suppliers/:id/invoices/:invoiceId` | We send `{status}`; endpoint also accepts other fields. |
| `DELETE` | `/suppliers/:id/invoices/:invoiceId` | admin/manager. |
| `GET` | `/suppliers/:id/payments` | Decimal `amount` is a **string** → normalized. |
| `POST` | `/suppliers/:id/payments` | `{amount*, date*, notes, invoice_id}`; **auto-updates the linked invoice's status**; over-balance check is **store-wide**. |
| `DELETE` | `/suppliers/:id/payments/:paymentId` | admin/manager. **Does *not* reverse the linked invoice's status** (see §4). |

---

## 4. Behaviour notes & parity decisions

- **Outstanding balance** = `max(0, total_invoiced − total_paid)` per supplier from `/summary` — matches mobile. Directory shows a store-wide total-outstanding stat.
- **Tags** — only `Preferred` (green) / `Blocked` (red) are styled; the field is free-form server-side. Filter chips All / Preferred / Blocked with live counts.
- **Invoice amount** auto-fills from `quantity × unit_price` but stays editable (mobile lets you enter a lump sum) — requires a date and a positive amount.
- **Payment validation (client)** — the picker lists only invoices with a positive **per-invoice** balance and prefills the amount to that balance; a payment may not exceed it (`> balance + 0.001`, absorbing float noise), exactly like mobile.
  - ⚠️ **Backend guards on store-wide outstanding, not per-invoice.** Our per-invoice client guard is *stricter*, so it's the primary UX gate; the server is the backstop. With **unlinked payments** (`invoice_id` null) present, the two can diverge and the server may reject a per-invoice-valid payment — that 400 is surfaced via `apiErrorMessage`. The 4A UI always links payments to an invoice, so this only arises from data created elsewhere (e.g. mobile/manual).
- **Invoice status** is editable inline via a select (unpaid/partial/paid). **Recording** a payment rolls the linked invoice's status *forward* server-side (`POST /payments` auto-updates it), so the ledger queries invalidate together and the new status shows immediately. ⚠️ **Deleting a payment does *not* reverse that status.** Verified live 2026‑08‑25: after deleting the only payment on a `partial` invoice, the invoice **stayed `partial`** even though its paid total correctly returned to ₦0. The server recomputes status on payment *create* but not on *delete*, so after a delete the status field is stale — correct it manually via the inline status select. (The cache still invalidates on delete, so the ₦0 paid total is reflected; only the status is stale.)
- **Cache invalidation** — supplier writes invalidate both `['suppliers']` and `['suppliers-summary']` (distinct keys — the first does **not** prefix-match the second). Invoice/payment writes invalidate `['supplier-invoices'|'supplier-payments', id]`, `['supplier', id]`, and `['suppliers-summary']`.

### Deliberate deviations from a literal mobile port
1. **Client-side search/filter** over one `GET /suppliers?limit=200` load (rather than server `?search=`) — matches the inventory catalog and lets search + tag chips compose without refetching.
2. **Category is free-text + `<datalist>`** (suggestions from distinct existing *supplier* categories) rather than a `<select>` of *product* category names — a supplier's category is its own vocabulary; avoids conflating the two and an extra `/categories` fetch.

---

## 5. Known caveats (inherited from the backend; not fixed in 4A)

- **`DELETE /suppliers/:id` is a hard delete.** The confirm dialog warns it also removes invoices/payments. **Updated in Phase 4B (2026‑09‑07):** `PurchaseOrder.supplier` is now `onDelete: Restrict`, so a supplier referenced by any purchase order **cannot** be hard-deleted. The delete route catches the Prisma FK violation (`P2003`) and returns a clear **409** ("This supplier has purchase orders and can't be deleted. Cancel or remove them first.") instead of a generic 500; the desktop delete-confirm copy warns about this up-front and surfaces the backend message via `apiErrorMessage`. (Cascade of invoices/payments still applies to suppliers with no POs.)
- **Deleting a payment does not roll back the invoice status** (verified live 2026‑08‑25). `POST /payments` recomputes and advances the linked invoice's status; `DELETE /payments/:id` does **not** — the invoice keeps its advanced status (e.g. stays `partial`) while its paid total drops back. The desktop UI cannot fix this server-side, so the inline status select is the manual correction. See §4.
- **No procurement / stock-in yet** — AP invoices here have no product FK and never touch inventory (by design; that's Phase 4B).

---

## 6. Gates (all green, 2026‑08‑24)

| Gate | Result |
|---|---|
| desktop `npm run typecheck` | ✅ clean |
| desktop `npm run build` | ✅ **14 routes**, Next 14.2.35 (new: `/suppliers` static, `/suppliers/[id]` dynamic) |
| `npm run test:shared` (root) | ✅ **33/33** (unchanged — no shared edit) |
| mobile `npm test` | ✅ **20/20** (unchanged — no mobile edit) |

**Not yet run:** live end-to-end against a running backend with an active-subscription store (none reachable in the build environment) — create/edit/delete supplier, record invoice, record/partial-pay, status roll-up, delete, RBAC redirect for a cashier.
