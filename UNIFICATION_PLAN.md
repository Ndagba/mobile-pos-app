# Desktop ↔ Mobile unification plan

Drafted 2026-11-12. Goal: every feature a role can use on one app is available on the other,
with the same rules, on the **existing** backend. Follows `CLAUDE.md` guardrails
(inspect → plan → implement → test → verify; stop for approval between phases; no commits unless asked).

## Ground rules for every phase

- **Backend is already there.** Every gap below has a live `/v1` route (checked against
  `backend/src/api/routes` and `index.ts`). No Prisma or route changes are planned, with one
  optional exception flagged in Phase 1.
- **Reuse, don't duplicate.** Mobile uses its `ApiClient`, theme and screen patterns; desktop uses
  `apiClient`, React Query hooks and the existing UI kit. Pure logic that both need goes into
  `@jaypos/shared` with a vitest test, additively.
- **Same role and branch rules on both apps.** Take the gate from the backend route, then mirror
  it in the UI (hide the entry, re-check on the screen).
- **Online-only is fine** for admin/reporting surfaces, with a clear offline message.
- **Gates after each phase:** backend build + unit tests, shared vitest, mobile `npm test` +
  `tsc --noEmit`, desktop typecheck + build. Then a live pass against a **local** backend
  (`mobile/.env` points at production by default).

## Gap list (source of truth for scope)

| # | Feature | Desktop | Mobile | Backend route |
|---|---|---|---|---|
| 1 | Store settings: business profile, receipt logo, cashier refund/discount permission, max discount % | yes | only 4 cashier menu toggles | `GET/PATCH /settings` |
| 2 | Cashier discount rules at checkout | enforced (`DiscountField`) | not enforced | client-side only (server enforces refund, not discount) |
| 3 | Profit & Loss report | yes | profit card only | `GET /financials/pl` |
| 4 | Inventory turnover | yes | no | `GET /inventory/turnover` |
| 5 | Expiring/expired batches view + add batch | yes | no (correction: mobile had no batches view at all) | `GET /inventory/expiring`, `POST /inventory/batches` |
| 6 | Purchasing extras: suggested reorders, print/share PO | yes | no | `GET /inventory/low-stock` (+ client) |
| 7 | Profile: edit own details, change own password | yes | no | `PATCH /auth/users/:id` |
| 8 | Reports: per-employee drill-down, export on every report | yes | partial | `GET /analytics/*`, `GET /transactions` |
| 9 | Customer type (wholesale), customer summary | yes | no | `/customers`, `/customers/summary` |
| 10 | Notifications for out-of-stock / expiring / pending sync | bell | local push for low stock only | existing inventory routes |
| 11 | Cash shifts | no | yes | `/shifts`, `/shifts/current`, `/shifts/:id/close` |
| 12 | End-of-day report, voids report | no | yes | `/reports/eod`, `/reports/voids` |
| 13 | Audit logs | no | yes | `/audit` |
| 14 | Branch management (create/edit, assign staff) | no | yes | `/branches`, `/branches/:id/staff` |
| 15 | Subscription / billing, super-admin store tools | no | yes | `/subscriptions`, `/admin/subscriptions`, `/stores` |
| 16 | Biometric login | no (by design) | yes | n/a |

## Phase 1 — Settings and cashier rules (mobile)  ·  gaps 1, 2

> **Status 2026-11-12: implemented, hermetic gates green, NOT yet run live.** Shared vitest 40/40
> (new `utils/discount.ts`), mobile jest 32/32 + `tsc` clean, desktop typecheck + build clean.
> Uncommitted. As built: the discount cap is still client-side only (no backend change); both apps
> now also re-clamp an existing discount when the cart shrinks or a held sale is resumed (desktop
> previously only clamped while typing); mobile's device-local business name / footer became the
> store-wide `/settings` values (legacy local text is kept as a fallback). The `tax_rate` setting is
> editable on mobile but, as on desktop, it does not change per-product tax in cart maths.

The only gap where the two apps currently **behave differently** for the same store, so it goes first.

- Extend the mobile `StoreSettings` type and `prefetchSettings` (`App.tsx`, `settingsSlice.ts`) to
  carry `business_name`, `rc_number`, `store_address`, `tax_rate`, `receipt_footer`,
  `receipt_show_logo`, `allow_cashier_refund`, `allow_cashier_discount`, `max_discount_percent`.
- `SettingsScreen`: add Business profile, Receipt and Cashier permissions sections (admin only),
  matching desktop `/settings`.
- `CheckoutScreen`: apply the desktop `DiscountField` rule — cashiers blocked when discounts are
  off, capped at `max_discount_percent` of subtotal; admins/managers unlimited.
- `TransactionsScreen`: hide Refund for cashiers unless `allow_cashier_refund` (server already rejects it).
- Receipt text: print business name / RC number / address / footer from settings.
- Lift the discount-cap calculation into `@jaypos/shared` (pure function + test) and use it from
  both apps so the rule cannot drift.
- **Decision needed:** the discount cap is client-enforced only. Optionally add a server check in
  `TransactionService.createTransaction` — a backend change touching the sales engine, so it is
  not included unless approved.

Done when: a cashier on mobile gets the same discount/refund limits as on desktop, and an admin can
edit every desktop setting from mobile.

## Phase 2 — Financial and stock reports (mobile)  ·  gaps 3, 4, 5

> **Status 2026-11-12: implemented, hermetic gates green, NOT yet run live.** Shared vitest 48/48
> (new `utils/pl.ts`), mobile jest 32/32 + `tsc` clean, desktop typecheck + build clean. Uncommitted.
> As built: new mobile screens `ProfitLoss`, `InventoryTurnover`, `Batches` (admin + manager),
> opened from the Admin tab. P&L maths moved from `desktop/lib/plMetrics.ts` into `@jaypos/shared`
> (the desktop file now re-exports it). **Desktop bug fixed on the way:** the P&L page sent a bare
> `endDate=YYYY-MM-DD`, which the backend reads as midnight at the start of that day, so sales on
> the last day of the range were excluded and "Today" was always empty; both apps now send whole
> local-day bounds (`dayBoundsIso`). The desktop turnover page still has the same end-day issue
> (not changed). Mobile P&L omits desktop's waterfall, cost-per-₦100 and product-profit panels.
> **Backend caveats found, not fixed:** `/financials/pl`, `/financials/stats` and `/expenses/summary`
> take any `branchId` with no role, branch or store check; `POST /inventory/batches` has no role
> check and adds stock without writing an `InventoryMovement`.

- **Profit & Loss** screen, opened from Analytics (admin + whoever desktop's `canViewReports`
  allows): period and branch filter, revenue / direct costs / operating expenses / net profit.
  Move the pure metric maths from `desktop/lib/plMetrics.ts` into `@jaypos/shared` with tests
  rather than copying it.
- **Turnover**: new view under Inventory, same columns as desktop `TurnoverTable`.
- **Add batch**: form on the existing expiring-batches view (`POST /inventory/batches`).

Done when: P&L figures on mobile equal desktop for the same store, branch and period.

## Phase 3 — Purchasing, profile, reports polish (mobile)  ·  gaps 6, 7, 8, 9

> **Status 2026-11-13: implemented, hermetic gates green, NOT yet run live.** Mobile jest 36/36 +
> `tsc` clean; no `shared/`, desktop or backend change this phase. Uncommitted. As built:
> suggested reorders card on the Purchasing list (prefills the new order with product + quantity —
> desktop's link only opens a blank order), "Share order" as text on the PO detail, new `Profile`
> screen (Settings → Profile & password), new `EmployeeSales` screen (tap a row on Analytics →
> Staff), customer tags aligned with desktop (`regular` / `vip` / `wholesale`, compared ignoring
> case) and the Customers hero now reads `GET /customers/summary`.
> **Corrections to the gap list:** desktop does NOT let users edit their own name/phone/email (the
> card is "Coming soon", there is no backend endpoint), so mobile Profile is read-only for details
> too; and "customer type" is just the free-text `tag` field. Report export stays text/CSV only
> (no `expo-print`).

- Suggested reorders card on the Purchasing list → opens a prefilled new PO.
- Share a PO as text via RN `Share` (same mechanism the receipt uses).
- Profile screen from Settings: edit own name/phone/email, change own password (same role rule as desktop).
- Analytics → Staff: tap an employee for their transactions (desktop `reports/employees/[id]`).
- Customer form: customer type; Customers hero from `/customers/summary`.
- **Decision needed:** PDF/print export on mobile needs a new dependency (`expo-print`). Default
  in this plan: CSV/text share only, no new dependency.

## Phase 4 — Operations features (desktop)  ·  gaps 11, 12, 13

> **Status 2026-11-13: implemented, hermetic gates green, NOT yet run live.** Desktop typecheck
> clean, desktop build OK (36 pages; new `/shifts`, `/reports/eod`, `/reports/voids`,
> `/admin/audit`). No backend, `shared/` or mobile change. Uncommitted. A live check was attempted:
> the local API was up but its PostgreSQL (`localhost:5432`) was not, so login failed and nothing
> was exercised. As built: "Cash shifts" is in the Sell nav for EVERY role (a cashier opens and
> closes their own till, as on mobile); EOD and Voids are tabs under Reports (admin + manager) with
> the shared export bar; "Audit log" is in the Admin nav for admin + manager (matches mobile's
> Admin tab; the backend has no role check on `/audit`). The audit search box filters loaded rows
> only — the endpoint has no search.

New pages under the existing nav, online-only, hooks with locally declared types:

- `/shifts` — open, current, close with counted cash, history. Add "Cash shifts" to the Sell group.
- `/reports/eod` and `/reports/voids` — added to the Reports hub with the shared `ReportActions` export bar.
- `/admin/audit` — filterable audit log (admin).

Role gates copied from the mobile `AdminScreen` entries and confirmed against each backend route.

## Phase 5 — Branch management (desktop)  ·  gap 14

> **Status 2026-11-13: implemented, hermetic gates green, NOT yet run live** (local PostgreSQL
> still down). Desktop typecheck clean, build OK (37 pages; new `/branches`). No backend, `shared/`
> or mobile change. Uncommitted. As built: admin-only "Branches" in the Admin nav — list, create
> (subject to the plan's branch limit), edit name/address/phone, deactivate, and a Staff dialog to
> assign/remove users. Notes: the backend has NO reactivate route, so deactivation is one-way from
> both apps; assigning a cashier moves them out of their current branch (managers can hold
> several); admins are listed in every branch and cannot be removed.

- `/branches` (admin): list, create, edit, activate/deactivate, assign managers/staff
  (`/branches`, `/branches/:id/staff`). Link from Users & roles.

## Phase 6 — Notifications parity  ·  gap 10

> **Status 2026-11-13: implemented, hermetic gates green, NOT yet run live.** Mobile jest 40/40 +
> `tsc` clean. Mobile only. Uncommitted. As built: the Dashboard bell (previously a dead icon) now
> shows a count badge and opens a new `Alerts` screen — pending-sync sales for every role, plus
> out-of-stock, low-stock and batches expiring within 30 days for admin + manager (same rules and
> order as the desktop bell; logic in `utils/alerts.ts`, tested). Tapping a stock alert opens
> Purchasing, an expiry alert opens Batches & expiry, pending sync opens sales history. Existing
> local push notifications are unchanged.

**All six phases are now implemented. None has been exercised on a device or against a live
backend** — that, the three open decisions below, and the backend authorization follow-up
(`/financials/*`, `/expenses/summary`, `POST /inventory/batches`) are what remain.

- Mobile: an in-app alerts list (low stock, out of stock, expiring batches, pending syncs)
  reachable from the Dashboard, mirroring the desktop bell. Existing local push stays as is.

## Left out on purpose — confirm

- **Subscription / billing and super-admin store tools on desktop (gap 15).** Payments run through
  Paystack on mobile and subscription is currently managed manually by the super admin. Proposed:
  desktop shows a read-only subscription status only. Needs a product decision.
- **Biometric login on desktop (gap 16).** `CLAUDE.md` fixes desktop auth as username + password.
- **Keyboard shortcuts / command menu on mobile.** Not applicable.

## Order and size

| Phase | App | Rough size | Depends on |
|---|---|---|---|
| 1 Settings + cashier rules | mobile (+ small shared) | medium | — |
| 2 P&L, turnover, add batch | mobile (+ shared) | large (P&L) | — |
| 3 Purchasing/profile/report polish | mobile | medium | mobile Purchasing (built, untested on device) |
| 4 Shifts, EOD, voids, audit | desktop | medium | — |
| 5 Branch management | desktop | small–medium | — |
| 6 Alerts list | mobile | small | — |

Phases 1–3 (mobile) and 4–5 (desktop) touch different apps and can run in parallel; only the
`@jaypos/shared` additions in Phases 1 and 2 must land before the desktop is switched to use them.

## Before starting

1. Device-test the mobile Purchasing feature already built (uncommitted) against a local backend.
2. Answer the three decisions: server-side discount cap, PDF export dependency, desktop subscription scope.
3. This gap list came from a route/endpoint/keyword sweep, not a line-by-line audit — each phase
   starts by re-inspecting the two implementations it is unifying and correcting the list.
