# Edge Cases & Business Rules

> Bar / Lounge Mode planning · document 6 of 8
> Each item gives the **problem**, the **recommended rule**, and **why**. Items marked **[Decision]** are repeated in `outstanding-decisions.md` for your approval.

---

## A. A critique of the proposed workflow first

Before the edge cases, five structural issues in the brief that the design corrects:

1. **"Total Remitted" vs. "Payment Breakdown" are two different things, and the brief half-merges them.** How a *customer* paid the attendant (customer payment mix) is a claim made by the attendant. What the *controller actually received* (remittance mix) is a fact. The design keeps both and shows them side by side. The difference between them is exactly where disputes come from.
2. **Liability must arise at release, not at payment.** The attendant owes the house from the moment the drinks leave the controller's counter, whether or not the customer has paid. If the liability arose only when the attendant *declared* a customer payment, attendants could simply never declare.
3. **Cashier One is uncontrolled in the brief.** Cashier One receives all the money but nothing reconciles *them*. The design adds a second ledger level: the controller's day close and a handover that a manager acknowledges.
4. **"Daily" is ambiguous for bars.** A lounge trading from 6 pm to 3 am spans two calendar days. Everything uses a **business date** with a configurable cut-off hour (default 06:00, Africa/Lagos).
5. **Segregation of duties is implied but not stated.** One person must not both initiate and release, or both owe and record payment. The design enforces this (see `permissions-matrix.md` §4).

---

## B. Order-stage edge cases

| # | Situation | Rule | Why |
|---|---|---|---|
| 1 | **Customer changes their mind before fulfilment** | The attendant (or controller) **cancels** the `submitted` order with a reason. It has no stock, revenue or ledger effect. If the order is already `accepted`, the controller rejects it instead. | Nothing happened physically, so nothing should happen financially. The audit row still shows the attempt. |
| 2 | **Customer changes their mind after drinks are released** | Unopened bottles: the attendant returns them to the controller, who files a **reversal request** (full, or partial via reversal + new order). A **manager approves**, stock is restored and the ledger is credited. Opened bottles are not reversible; the attendant keeps the liability. | Physical stock must physically return before the books say it did. Manager approval prevents controller/attendant collusion. |
| 3 | **Partial fulfilment** (only 1 Goldberg left) | The controller reduces line quantities (down only, reason required). The sale, stock and ledger use the **fulfilled** quantities. The remainder is dropped and the attendant is notified on their order view. | It keeps one order = one sale, with no back-order complexity. |
| 4 | **Two controllers try to fulfil the same order** | The accept/claim step plus a conditional status update (`WHERE status IN ('submitted','accepted') AND (accepted_by IS NULL OR accepted_by = me)`), plus `Transaction.sales_order_id @unique`. The second click gets "already fulfilled". | DB-level guarantee against double posting. |
| 5 | **Double-tap on Submit / flaky network retry** | `client_ref` (UUID generated on the device) is unique. A retry returns the existing order. | The same idempotency philosophy as retail `offline_session_hash`. |
| 6 | **Stock runs out between submit and fulfil** | The guarded decrement inside the posting transaction fails cleanly. The controller sees the shortage and can reduce or reject. | Never negative stock. Never a half-posted sale. |
| 7 | **Price changes while an order is pending** | The price is snapshotted at submission (**[Decision D8]**: alternatively re-price at fulfilment). | Attendant and customer agreed a price at order time. |
| 8 | **Order left pending at day end** | The day close **blocks** until every `submitted`/`accepted` order is fulfilled, rejected or explicitly "carried to next day" (which keeps it `submitted`; its business date is set only at fulfilment). | No orphan orders, and no silent revenue in the wrong day. |
| 9 | **Attendant submits huge or abusive orders** | An optional max-lines / max-value per order setting; the controller can reject. | Cheap protection; it is the controller's job anyway. |
| 10 | **Controller sells directly to a walk-up customer** | **[Decision D10]**. Recommended: allowed only via the retail checkout, recorded as the **controller's own** sale (normal retail transaction, no ledger), and shown separately in the day close. | Some bars do this. It must not be confused with attendant sales. |

---

## C. Payment-stage edge cases

| # | Situation | Rule | Why |
|---|---|---|---|
| 11 | **Customer transfers directly to the store's account** | The attendant declares `transfer` + narration on the order. The controller confirms the bank alert and records a **remittance** (method `transfer`, reference mandatory) against that attendant. Until it is confirmed, it stays outstanding. | The money never touched the attendant, but only a verified receipt should clear their liability. That stops fake "I was transferred" claims. |
| 12 | **Customer transfers to the attendant's personal account** | Treat it as cash the attendant holds. The attendant must remit it (in cash or by transfer to the store). The order's declared method records `transfer`, so reports show it. **[Decision D18]**: forbid this outright by policy. | This is the most common real-world leak. It must be visible, not hidden. |
| 13 | **Customer pays less than the order total** | The shortfall is the **attendant's** liability. Their balance carries it. A manager may later **write off** it with a reason (bad customer). No customer debt record is created unless the store also uses the customer credit feature. **[Decision D19]** covers recording customer IOUs ("tabs") explicitly. | Liability arose at release. The house doesn't absorb losses silently. |
| 14 | **Customer pays more / tips** | Tips are outside the system by default. If a store wants tips tracked, they are a separate remittance line type that does not reduce sales liability (**[Decision D20]**). | Tips must not inflate revenue or mask shortages. |
| 15 | **Attendant remits more than their outstanding balance** | Allowed after an explicit confirmation. The balance goes **negative (credit)** and is consumed automatically by future sales. It is flagged in reports. Alternative: reject and ask the controller to split. **[Decision D21]** | Real case: the attendant pre-pays or remits for a sale not yet fulfilled. Rejecting it forces workarounds. Customer credit currently rejects overpayment, so this is a deliberate difference. |
| 16 | **Remittance keyed wrongly (₦50,000 instead of ₦5,000)** | Never edit. A `REMITTANCE_REVERSAL` + correct entry. The controller can reverse their own entries the same day before close; after close, only a manager can. | It preserves the audit trail and prevents quiet "fixes" after cash has been counted. |
| 17 | **The same bank transfer recorded twice** | Unique `client_ref` stops double-taps. A soft duplicate check on `(method, reference)` within the store warns before saving. | A transfer reference is a natural key. |
| 18 | **Remittance for previous days** | A remittance always has a `business_date`. By default it is *today's*. The ledger is cumulative, so it clears the oldest balance first in the aged report (FIFO presentation only). Back-dating is manager-only, unless `bar_allow_backdated_remittance` permits controllers up to N days. Back-dating into a **closed** day is never allowed; a manager reopens the close instead. | Back-dating changes historical day totals that may already have been handed over. |
| 19 | **POS terminal settlement differs from declared POS sales** | The day close shows declared card/POS sales vs. remittances recorded as `card`. The difference is a variance with a reason. Settlement-report import is a future enhancement. | Keep v1 manual but visible. |

---

## D. Balance, shift and staff edge cases

| # | Situation | Rule | Why |
|---|---|---|---|
| 20 | **Outstanding at end of day** | Nothing happens. The ledger is cumulative. Tomorrow's dashboard shows it as **Brought forward**, separate from today's sales. | Carry-forward by construction, with no job that can fail or double-run. |
| 21 | **Attendant's shift ends with a balance** | Balance is attached to the **person**, not the shift. A shift close (if used) shows the balance, but does not require zero. An optional "max outstanding before new orders are blocked" setting (**[Decision D22]**). | Control without forcing fake remittances. |
| 22 | **Cash shortage on controller count** (counted < expected) | Recorded as a variance on **that controller's own** day close (one close per Bar Controller, D11), with a mandatory reason. A manager decides: charge the controller (a ledger entry on the controller's own ledger, **[Decision D23]**) or write it off as an expense (category "Cash shortage"). | Shortages must land somewhere visible. |
| 23 | **Cash overage** | Recorded as a variance. A manager investigates; it is typically matched to an unrecorded remittance and then fixed by recording that remittance. Unexplained overage → "Other income" (**[Decision D23]**). | Overage often means someone's balance is wrong. |
| 24 | **Attendant leaves the business** | Deactivation is allowed with a non-zero balance (it must not block HR). The balance stays, and the user appears on the "inactive with balance" report. Settlement is by final remittance or a manager **write-off** with a reason (e.g. "deducted from final salary"). Records are never deleted. The `Transaction.user_id` relation is already `onDelete: Restrict`. | History must stay intact. A write-off is a conscious, audited decision. |
| 25 | **Attendant moved to another branch** | Balance stays with the user, and ledger entries keep their original `branch_id`. Reports by branch use the entry's branch. | Correct attribution to where the sale happened. |
| 26 | **User's profile changed from attendant to controller** | Allowed only when their balance is zero, or with an admin override that is logged. | Otherwise someone could record remittances against their own old debt. |

---

## E. Damage / flat-beer rules

| # | Rule |
|---|---|
| 27 | Damage is **never** a sale: no `Transaction`, no revenue, no commission basis. It is an `InventoryMovement` of type `damage` plus a `DamageRecord`. |
| 28 | Stock decreases immediately when the damage is recorded (guarded: it cannot go negative). |
| 29 | **Who pays? The house. (D24 approved.)** Damage is a business loss. It is **never** charged to the attendant and never changes their outstanding balance. The record snapshots cost price (loss value) and selling price (lost-sales value) for reporting. |
| 30 | Damage can name the attendant involved, or **"House"** (no attendant), e.g. a crate dropped in the store. Naming an attendant is for analytics only. |
| 31 | Damage records naming an attendant appear on their dashboard as information. A manager can reverse a wrong record. |
| 32 | **Commission impact: none.** Damage is not a sale, so it never enters the commission basis. |
| 33 | Reporting shows three separate inventory concepts: **sold** (sale movements), **damaged** (damage movements), **available** (`quantity_on_hand − quantity_reserved`). |
| 34 | Who decides whether a bottle is genuinely flat? The controller. Fraud vector: controller and attendant collude to mark sold beer as "flat". Mitigations: damage rate per attendant and per controller in the report, an optional threshold alert, and an optional manager approval above N bottles/day (**[Decision D26]**). |

---

## F. Commission rules

| # | Rule |
|---|---|
| 35 | **Basis: the attendant's total sales (D27 approved)** = Σ `total_amount` of the attendant's fulfilled bar sales, by **business date** in the period, minus approved reversals. `total_amount` is what the customer was charged: after any discount, **including VAT**. Example: 5% × ₦200,000 = ₦10,000. Note: where products carry VAT, commission is also paid on the VAT portion. If you later want it excluded, only the basis setting changes. |
| 36 | Commission is calculated on **fulfilled** sales, not on remitted cash. **[Decision D28]** covers an alternative of "only on sales that are fully remitted / balance ≤ 0 at period end", which encourages timely remittance but is harder to explain. |
| 37 | Calculated ≠ posted ≠ paid. A commission line moves `draft → posted (Expense created) → paid`. The expense is created at posting (accrual), not at payment. **[Decision D29]**: post the expense only when paid (cash basis). |
| 38 | A reversal approved *after* commission was posted does **not** edit the posted run. The next run includes a negative adjustment line. |
| 39 | Commission and salary can co-exist per attendant. Salary stays outside JayPOS (an expense as today). An attendant-level "commission eligible" flag lets owners mix staff types. |
| 40 | Rate changes take effect for future runs only. Each run snapshots its rate and basis. |

---

## G. Reversal & integrity rules (system-wide)

| # | Rule |
|---|---|
| 41 | **No financial row is ever updated in place or deleted.** Orders only move through their state machine. Ledger, remittance and damage rows are append-only, and corrections are reversing entries pointing at the original (`reverses_entry_id @unique`, so the same entry cannot be reversed twice). |
| 42 | **Atomicity:** fulfilment, remittance, damage, reversal and commission posting each run in a **single DB transaction** that includes their `AuditLog` row. (Today's `AuditService.log` is best-effort and outside the transaction. Bar code writes audit through the transaction client.) |
| 43 | **No double inventory deduction:** stock is deducted only by `postSale` (fulfilment) and damage. Submission never deducts (unless reservation, D5, is chosen; even then it moves only `quantity_reserved`). |
| 44 | **No duplicate revenue:** one order ↔ at most one `Transaction` (unique FK). Bar-mode sales cannot also be created through retail checkout by attendants (guard). |
| 45 | **Server-computed money:** order totals, ledger amounts, damage values and commission are computed server-side from DB prices. The client sends product IDs and quantities only. |
| 46 | **Closed periods:** after a day close is acknowledged, no entry with that business date can be created or reversed until a manager reopens the close (audited). |
| 47 | **Timezone:** business date = `floor(local_time − cutoff_hour)` in `bar_timezone`. It is computed on the server, never trusted from the client. |

---

## H. Operational / technical edge cases

| # | Situation | Rule |
|---|---|---|
| 48 | **Internet outage** | The bar order flow is online-only. Fallback: the controller switches to the **manual book** (paper) and later enters orders on the attendant's behalf as a manager-level "late entry" (manager attributes to the attendant, flagged `late_entry`, reason required). Retail offline checkout remains available to managers for direct sales. Phase 2+ could add offline queueing on the controller device, but don't build it in v1. |
| 49 | **Controller device dies mid-fulfil** | It is atomic: either posted or not. On reload, the order shows its true status. |
| 50 | **Polling load** | ~5 s polling × a handful of devices per bar is negligible. Use `If-None-Match`/`updated_since` to keep responses tiny. |
| 51 | **Old mobile app in a bar store** | The server guard blocks attendants from retail checkout, with a clear error ("Use JayPOS Bar screens / update the app"). |
| 52 | **Store switches mode after going live** | Blocked for admins once any transaction exists. A super-admin change is logged. Historic bar tables remain readable. Switching bar → retail hides bar screens but leaves open balances. **[Decision D3]**: require all balances to be zero first. |
| 53 | **Subscription lapses** | Existing `requireActiveSubscription` applies to bar writes too. Reads stay available so the owner can still collect outstanding balances. |
