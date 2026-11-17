# Permissions Matrix

> Bar / Lounge Mode planning · document 5 of 8
> **No existing role or permission has been changed.** This is the proposed target.

---

## 1. Model

```
effective capability = f( store.business_mode, user.role, user.operational_profile, StoreSetting toggles )
```

- `role` stays one of `admin | manager | cashier`. Bar users are `cashier`.
- `operational_profile` (new, bar stores only): `bar_controller` (Cashier One) or `bar_attendant` (Cashier Two). A `cashier` with no profile in a bar store gets **no bar capabilities** and no retail checkout. They effectively have view-only access until a profile is assigned.
- Capabilities are resolved in **one place** (a `capabilities.ts` map on the backend, mirrored in `desktop/lib/roles.ts`). Routes ask `requireCapability('bar.remittance.record')` instead of re-implementing role logic inline.
- Every scope rule is enforced **server-side**. The UI only hides things.
- Profile changes are re-read from the DB on every financial write, so a stale 24 h JWT cannot keep posting after a demotion.

Legend: ✅ allowed · 👤 own records only · 🏢 own branch(es) only (existing branch-helper scoping) · ⚙️ only if a store setting enables it · ❌ denied

---

## 2. Bar-mode capabilities

| Capability | Attendant (C2) | Controller (C1) | Manager | Admin / Owner |
|---|:-:|:-:|:-:|:-:|
| **Orders** | | | | |
| Create / submit order | ✅ | ⚙️ (D10: controller selling directly) | ✅ (attributes to self) | ✅ |
| Cancel own order while `submitted` | 👤 | ✅ (any) | ✅ | ✅ |
| View order queue (all attendants) | ❌ | ✅ 🏢 | ✅ 🏢 | ✅ |
| View order status / details | 👤 | ✅ 🏢 | ✅ 🏢 | ✅ |
| Accept / claim order | ❌ | ✅ | ✅ | ✅ |
| Fulfil & post order (incl. reduce qty) | ❌ | ✅ | ✅ | ✅ |
| Fulfil an order **they initiated themselves** | ❌ | ❌ (segregation of duties) | ⚙️ (D10) | ✅ (logged) |
| Reject order (reason required) | ❌ | ✅ | ✅ | ✅ |
| Declare customer payment method | 👤 until day close | ✅ until day close | ✅ | ✅ |
| Request reversal of fulfilled order | 👤 | ✅ | ✅ | ✅ |
| **Approve** reversal of fulfilled order | ❌ | ❌ | ✅ | ✅ |
| **Remittances** | | | | |
| Record remittance | ❌ | ✅ | ✅ | ✅ |
| Record remittance for a past business date | ❌ | ⚙️ `bar_allow_backdated_remittance`, max N days | ✅ | ✅ |
| Reverse a remittance (same day, before close) | ❌ | ✅ (own entries) | ✅ | ✅ |
| Reverse a remittance after day close | ❌ | ❌ | ✅ | ✅ |
| View own remittance history | 👤 | ✅ | ✅ | ✅ |
| View all attendants' remittances | ❌ | ✅ 🏢 | ✅ 🏢 | ✅ |
| **Balances & ledger** | | | | |
| View own outstanding / ledger | 👤 | — | — | — |
| View every attendant's balance & reconciliation | ❌ | ✅ 🏢 | ✅ 🏢 | ✅ |
| Write-off a balance (shortage, departed staff) | ❌ | ❌ | ✅ | ✅ |
| Manual ledger adjustment (reason required) | ❌ | ❌ | ❌ (D13) | ✅ |
| **Damages** | | | | |
| Record damaged / flat stock | ❌ | ✅ | ✅ | ✅ |
| View damages naming self (information only — house loss, D24) | 👤 | ✅ | ✅ | ✅ |
| Reverse a damage record | ❌ | ✅ (same day, own) | ✅ | ✅ |
| Damage report & analytics | ❌ | ✅ 🏢 (today only, D14) | ✅ 🏢 | ✅ |
| **Day close** | | | | |
| Prepare & submit day close | ❌ | ✅ | ✅ | ✅ |
| Acknowledge handover from controller | ❌ | ❌ | ✅ | ✅ |
| Reopen a submitted close | ❌ | ❌ | ✅ | ✅ |
| **Commission** | | | | |
| View own commission (calculated / paid) | 👤 | 👤 (if controllers are commissioned, D15) | ✅ | ✅ |
| Configure commission | ❌ | ❌ | ✅ | ✅ |
| Create / approve / post commission run | ❌ | ❌ | ✅ | ✅ |
| Mark commission paid | ❌ | ❌ | ✅ | ✅ |
| **Settings & setup** | | | | |
| Choose business mode (before first sale) | ❌ | ❌ | ❌ | ✅ |
| Change business mode after sales exist | ❌ | ❌ | ❌ | super-admin only |
| Configure bar settings | ❌ | ❌ | ✅ | ✅ |
| Assign operational profiles to users | ❌ | ❌ | ❌ (D16) | ✅ |
| **Reports (§6 of workflow-design)** | | | | |
| Own dashboard | 👤 | ✅ controller dashboard | ✅ | ✅ |
| Reports 1–10 | ❌ | Daily ops subset (1, 2, 4, 5, 6, 9 for today/recent) 🏢 | ✅ 🏢 | ✅ |

---

## 3. Existing retail capabilities **inside a bar store**

These are the guards that need **additive** checks on existing routes. The retail behaviour of those routes in retail stores is unchanged.

| Existing capability / route | Attendant | Controller | Manager | Admin | Why |
|---|:-:|:-:|:-:|:-:|---|
| Retail checkout `POST /v1/transactions`, `/batch` | ❌ **(new guard)** | ⚙️ D10 | ✅ | ✅ | An attendant direct sale would bypass the controller's release control. |
| `GET /v1/transactions` (list) | ❌ **(new guard)** → use `/bar/my-orders` | ✅ 🏢 | ✅ | ✅ | The existing list is not user-scoped (risk R1). |
| `GET /v1/transactions/:id` | 👤 **(new guard)** | ✅ | ✅ | ✅ | Risk R2. |
| `POST /v1/transactions/:id/void` | ❌ **(new guard)** | ❌ (use reversal request) | ✅ | ✅ | Risk R3. In bar stores, voids of bar sales must go through the reversal flow so the ledger is updated too. |
| `POST /v1/transactions/:id/refund` | ❌ | ❌ | ✅ (routed via reversal for bar sales) | ✅ | Same. |
| Inventory catalog / adjust | ❌ | ❌ (damage only via `/bar/damages`) | ✅ | ✅ | Unchanged. Cashiers are already gated in the UI; the backend gap R5 is noted. |
| Purchasing, suppliers | ❌ | ❌ | ✅ | ✅ | Unchanged. |
| Expenses | ❌ | ❌ | ✅ | ✅ | Unchanged in intent. The backend gap R4 is noted. |
| Customers | ⚙️ existing toggles | ⚙️ | ✅ | ✅ | Unchanged. |
| Cash shifts | ⚙️ optional (D17) | ⚙️ | ✅ | ✅ | Bar money is reconciled via the ledger, not shifts. |
| Dashboard analytics (`/analytics/dashboard`) | 👤 (already scoped via `role==='cashier'`) | 👤 by default → bar controller dashboard replaces it | ✅ | ✅ | Unchanged logic. Bar UIs use bar endpoints. |
| User management | ❌ | ❌ | ❌ (existing: admin only) | ✅ | Unchanged. |

---

## 4. Data-visibility rules (hard requirements)

1. **Attendant isolation:** every `/v1/bar/*` read for an attendant is filtered `initiated_by_user_id = jwt.userId` / `cashier_user_id = jwt.userId` **in the service layer**. No endpoint accepts a `cashierId` parameter from an attendant; if one is sent, it is ignored.
2. **Branch scoping:** controllers and managers see only their authorized branches via the existing `getAuthorizedBranchIds`.
3. **Tenant scoping:** every bar query includes `store_id = jwt.storeId`. Lookups by ID re-check `store_id` (do not repeat the R2 pattern).
4. **No self-dealing:** the server rejects the following when actor = subject (unless admin, and then it is logged as `SELF_APPROVAL`):
   - fulfilling your own order
   - recording a remittance for yourself
   - recording damage against yourself
   - approving your own reversal or write-off
