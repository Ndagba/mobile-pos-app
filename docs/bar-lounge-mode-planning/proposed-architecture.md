# Proposed Architecture — Business Modes in one JayPOS

> Bar / Lounge Mode planning · document 2 of 8

---

## 1. Recommendation in one paragraph

Build Bar / Lounge as a **store-level business mode inside the existing application**: the same backend, database, auth and clients. It is implemented as an **additive "bar module"**: new tables, new routes under `/v1/bar/*`, and new screens. The module is switched on by a `business_mode` value on the store. The module **reuses the existing sales engine to create the final completed sale**, so inventory, the movement ledger, P&L and every existing report keep working unchanged. Users keep their existing `role` (`cashier`). Bar duties come from a new, separate **operational profile** on the user (`bar_controller` = Cashier One, `bar_attendant` = Cashier Two). Retail stores have `business_mode = 'retail'` and never execute a single line of bar code.

---

## 2. Options considered

| Option | Description | Verdict |
|---|---|---|
| **A. Separate application / fork** | Copy JayPOS into a "JayBar" product. | ❌ Rejected. It doubles maintenance of auth, inventory, reports, sync and billing. It breaks the "reuse, don't duplicate" rule. Bug fixes would drift between the two. |
| **B. Separate bar microservice** | A new service that owns orders and remittance and calls the POS API. | ❌ Rejected. CLAUDE.md forbids microservices. Order → sale → stock must be one atomic DB transaction, which you cannot get across services. |
| **C. Generic configurable workflow engine** | Model every business mode as data-driven workflow definitions. | ❌ Rejected for now. It is over-engineering for two modes, and hard to audit financially. Revisit only if a third or fourth mode (restaurant, pharmacy) arrives. |
| **D. Put pending orders into `Transaction` with new statuses** | `status='pending'` → `'completed'` on fulfilment. | ❌ Rejected. Every existing query that forgets `status='completed'` would silently count unfulfilled orders as revenue (`exportTransactions`, list totals, customer stats). It also breaks the "sale is born completed" invariant the mobile and desktop offline sync rely on. |
| **E. Store mode + additive bar module + reuse sales engine for the final sale** | Described below. | ✅ **Recommended.** |

---

## 3. The recommended design

```mermaid
flowchart LR
  subgraph Clients
    D[Desktop PWA<br/>retail screens + bar screens]
    M[Mobile app<br/>retail screens · bar screens later]
  end
  subgraph Backend /v1
    R[Existing routes<br/>transactions, inventory, reports...]
    B[New /v1/bar/* routes<br/>orders, remittances, damages,<br/>ledger, day-close, commission]
    MG{{requireBusinessMode('bar')<br/>+ requireBarProfile(...)}}
    TS[TransactionService<br/>core posting function]
    BS[BarService / LedgerService]
  end
  DB[(PostgreSQL<br/>existing tables + new bar tables)]

  D --> R & B
  M --> R
  B --> MG --> BS --> TS --> DB
  R --> TS
  BS --> DB
```

### 3.1 Business mode (store level)

- New column `Store.business_mode` (`'retail'` default, `'bar'`). Every existing store becomes `retail` by default, with no backfill needed.
- It is exposed through the existing `GET /v1/settings` response, and the login/`/auth/me` payload adds `business_mode`, so both clients can branch their UI without an extra call.
- **Mode lock:** the mode can be changed by an admin only while the store has **zero** `Transaction` rows and **zero** bar orders. After that, only a super-admin can change it, and every change writes an `AuditLog` row (`CHANGE_BUSINESS_MODE`). See `edge-cases-and-business-rules.md` §1.
- **Why store level and not branch level:** reports, commission and settings are store-wide today. A per-branch mode doubles the test matrix. A column on `Branch` can be added later, additively, if an owner runs a supermarket and a lounge under one subscription. This is an open decision (D2).

### 3.2 Operational profile (user level) — not a new role

- New nullable column `User.operational_profile` with values `null` (normal), `'bar_controller'` (Cashier One) or `'bar_attendant'` (Cashier Two).
- `role` stays `'cashier'` for both. This is the key safety property:
  - Every existing route that checks "admin/manager or not" still treats them as cashiers. They cannot reach inventory, purchasing, user management or reports they couldn't reach before.
  - Every existing route that checks `role === 'cashier'` (dashboard analytics scoping) **still scopes them to their own data**. A brand-new role string would silently escape that scoping.
  - `branchHelper` keeps restricting them to their home branch.
  - `AuthService`'s role validator and the user-management UI keep working; the profile is an extra dropdown shown only in bar stores.
- The profile is added to the JWT claims, so routes can check it without a DB hit. The server **re-reads it from the DB on sensitive writes** (fulfil, remit, damage), so a demoted user's 24 h token cannot keep posting.
- Managers and admins do not need a profile. They inherit Cashier One's capabilities in bar stores (they can supervise, fulfil and record remittances).

### 3.3 The bar module (backend)

New code is isolated in:
- `backend/src/services/bar/` (`BarOrderService`, `CashierLedgerService`, `RemittanceService`, `DamageService`, `DayCloseService`, `CommissionService`)
- `backend/src/api/routes/bar.routes.ts`, mounted at `/v1/bar`

Every bar route is wrapped in:
1. `authMiddleware` (existing)
2. `requireActiveSubscription` (existing)
3. **`requireBusinessMode('bar')`** (new): 404/403 for retail stores, so retail tenants cannot even reach the endpoints
4. **`requireCapability(...)`** (new): a small capability map (see `permissions-matrix.md`), not scattered inline checks

### 3.4 How a bar order becomes a sale (reuse, not duplication)

The posting logic inside `TransactionService.createTransaction` is extracted, **without changing its behaviour for retail**, into an internal function that accepts a Prisma transaction client and an explicit, server-resolved `user_id`:

```
postSale(tx, { store_id, branch_id, user_id /* attributed seller */, items, totals, payment, ... })
```

- **Retail** (`POST /transactions`, `/transactions/batch`) calls it exactly as today. The JWT user is the seller and client totals are kept as-is (unchanged behaviour, protected by the existing tests plus new regression tests).
- **Bar fulfilment** calls it *inside the same DB transaction* that marks the order fulfilled and appends the cashier-ledger debit:
  - `user_id` = the order's `initiated_by_user_id` (Cashier Two), read from the **order row**, never from the request body
  - totals = **server-computed** from current product prices captured at order time
  - plus new `Transaction.fulfilled_by_user_id` (Cashier One) and `Transaction.sales_order_id`

Result: one fulfilment produces **exactly one** `Transaction`, one set of `sale` movements and one ledger entry, or nothing at all. There is no double deduction, and no revenue without stock movement or the other way round.

### 3.5 Money model: a cashier ledger, not a running balance column

Each Cashier Two has an append-only **`CashierLedgerEntry`** stream:

| Entry type | Sign | Created by |
|---|---|---|
| `SALE` | + (owes) | order fulfilment |
| `SALE_REVERSAL` | − | authorized reversal of a posted bar sale |
| `REMITTANCE` | − (paid) | Cashier One records money received |
| `REMITTANCE_REVERSAL` | + | correction of a mis-keyed remittance |
| `WRITE_OFF` | − | manager forgives a shortage or a departed cashier's balance |
| `ADJUSTMENT` | ± | manager-only correction with a mandatory reason |

**Outstanding balance = Σ entries.** It is never stored, so it is never reset and **carries forward automatically**. "Opening balance for a day" = Σ entries before the business-day start. There is no end-of-day job to run or to fail. Corrections are always new entries; nothing is updated or deleted.

The same pattern applies **one level up**: Cashier One's collected-but-not-handed-over money is the sum of remittances received minus **management handovers** acknowledged by a manager or admin. That gives the owner a control over Cashier One too, which the brief does not mention but which a real bar needs.

### 3.6 Clients

> **Superseded by decision D7 (2026‑11‑17): mobile app first, then desktop.** The Expo app gets the Attendant and Bar Controller screens in Phases 1–5. The desktop screens described below follow in Phase 6. See `implementation-roadmap.md`.

- **Desktop PWA** (original proposal). The Cashier One station is a counter or till: a laptop or tablet in a browser. Cashier Two can run the same PWA on a phone browser (it installs as an app). Bar screens: `/bar/orders/new`, `/bar/my-orders`, `/bar/me` (attendant dashboard), `/bar/queue`, `/bar/cashiers/[id]`, `/bar/remittances`, `/bar/damages`, `/bar/day-close`, `/bar/reports/*`.
- The nav (`components/layout/nav.ts`) gains a `mode`-aware visibility predicate. In a bar store, `bar_attendant` users see **only** bar screens. The retail `/sales` checkout is hidden for them, because a direct retail sale would bypass Cashier One.
- **Mobile** consumes the same `/v1/bar/*` API. Per D7 it is now built **first**.
- **Online-only** for bar order flow. Polling every ~5 s on the Cashier One queue and ~10 s on attendant order status (React Query `refetchInterval`). No WebSockets, per the guardrails.

---

## 4. Advantages

1. **Zero behavioural change for retail.** All new tables are additive. All new columns are nullable or defaulted. Retail code paths are untouched except one internal extraction, which is covered by regression tests.
2. **Free reuse of the reporting stack.** Bar sales are ordinary completed `Transaction`s attributed to Cashier Two, so EOD, employee performance, product sales, P&L, turnover and the movement ledger all work on day one.
3. **Financial integrity by construction.** Atomic fulfilment, append-only ledgers, derived balances, idempotency keys and in-transaction audit rows.
4. **Security by default.** The profile-not-role approach means a bar user can never get *more* access through an existing route than a normal cashier has.
5. **One product to sell.** Mode is a setting, the subscription stays the same, and a plan-level feature flag is possible (`SubscriptionPlan.features.bar_mode`).

## 5. Disadvantages and costs

1. **Retail code paths must carry a mode check where they could conflict.** For example, in a bar store a `bar_attendant` must be blocked from `POST /transactions` (direct sale) and from `POST /transactions/:id/void`. That means touching existing routes, though only with additive guards.
2. **The `TransactionService` extraction touches the most critical code in the system.** Mitigation: a pure refactor with no behaviour change, landed in its own phase with retail regression tests before any bar code uses it.
3. **No real-time.** Polling adds 5–10 s latency to "new order" visibility. This is acceptable for a bar counter. Revisit (SSE, not WebSockets) only if users complain.
4. **Online dependency.** If the internet drops, attendants cannot submit orders to the controller. Mitigation: a documented manual fallback (`edge-cases` §14). The retail offline path still works for managers.
5. **Two levels of ledger** (attendant → controller → management) is more concept than the brief asked for. It is justified because otherwise the cash simply disappears into Cashier One's pocket with no control.

## 6. Long-term implications

- **It sets the pattern for future modes** (restaurant with tables/kitchen tickets, pharmacy with prescriptions). Each is `business_mode` + profile(s) + module + reuse of `postSale`. If a third mode arrives, extract the shared pieces (mode middleware, capability map, ledger service) into a small "modes" framework. Don't build it before then.
- **The cashier ledger is reusable.** Retail stores with "runners" or credit-holding staff could adopt it later.
- **`postSale` with server-computed totals** is the path toward closing risk R8 for retail too. Retail can migrate to it gradually.
- **Profile-based capabilities** could later replace the scattered inline role checks across the whole backend (a long-standing tech-debt item), one route at a time.
- **Schema growth:** ~7 new tables and ~10 new nullable columns. That is well within what Prisma and Postgres handle comfortably, and there are no destructive migrations.
