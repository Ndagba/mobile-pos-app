# Outstanding Decisions — for your approval

> Bar / Lounge Mode planning · document 8 of 8
> Each decision has a **recommended default**. If you approve a group as-is, implementation can proceed on the defaults. IDs (D1…D29) are referenced throughout the other documents.

## ✅ Approved by the owner — 2026‑11‑17

| ID | Decision | Effect on the plan |
|---|---|---|
| **A0** | **Approved:** store-level mode + additive bar module in the same app, reusing the sales engine. | As in `proposed-architecture.md`. |
| **D1** | **All stores.** Close R1 (list-all transactions), R2 (cross-store read by ID) and R3 (ungated void) everywhere. | Phase 0. Retail cashiers will see only their own sales history and can no longer void (admin/manager only). Release notes must announce this. |
| **D2** | **Per store.** | `Store.business_mode`. |
| **D7** | **Mobile app first, then desktop.** | Roadmap reordered: bar screens ship in the Expo app in Phases 1–5. Desktop parity becomes Phase 6. |
| **N1** | **"Bar Controller (Cashier One)"** and **"Attendant (Cashier Two)"**. | UI labels. Code values stay `bar_controller` / `bar_attendant`. |
| **D11** | **One day close per Bar Controller** per business day. | `BarDayClose` unique key = `(branch_id, business_date, closed_by_user_id)`. Each controller reconciles only the remittances they received and the orders they fulfilled. |
| **D24** | **Flat / damaged beer is a house loss.** It is never charged to the attendant. | Damage has no effect on the attendant ledger. The `DAMAGE_CHARGE` entry type and the charge-policy setting are dropped. The damage report still names the responsible attendant (for analytics only). |
| **D27** | **Commission = rate × the attendant's total sales.** | Basis = Σ `total_amount` of the attendant's fulfilled bar sales in the period (what the customer was charged, after any discount, **including VAT**), minus approved reversals. D25 is moot: damage never affects commission. |
| **BD** | **Business day ends 06:00, Africa/Lagos** (configurable per store). | As designed. |

**Still open:** D3 (may a live store switch modes?). Until you decide, the plan uses the recommended default: super-admin only, with zero balances and no pending orders. All other 🟠/🟢 items run on their recommended defaults unless you say otherwise before the phase that needs them.

---

**Priority:** 🔴 needed before Phase 0/1 · 🟠 needed before Phase 2–4 · 🟢 can wait until Phase 5+

---

## 🔴 Architecture & scope

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **A0** | Approve the overall approach | (a) store-level mode + additive bar module in the same app, reusing the sales engine; (b) separate product | **(a)**. See `proposed-architecture.md`. |
| **D1** | Fix the pre-existing cashier-visibility and void gaps (R1 list-all-transactions, R2 cross-store read by ID, R3 ungated void) **for all stores**, or only for bar-mode stores? | all stores / bar only | **All stores.** They are genuine security gaps. Note this **changes retail behaviour**: retail cashiers would see only their own history and could no longer void. Confirm that this is acceptable for current customers. |
| **D2** | Is the business mode per **store** or per **branch**? | store / branch | **Store** for v1. A per-branch mode can be added later, additively. |
| **D3** | May a live store switch modes? | never / super-admin only / super-admin only and only with zero open balances | **Super-admin only, with all attendant balances at zero and no pending orders.** |
| **D7** | Which client(s) for bar mode in v1? | desktop PWA only (works in phone browsers) / desktop + native mobile | **Desktop PWA first.** Native mobile parity in Phase 6 if pilots ask for it. |
| **N1** | Names shown in the UI for the two profiles | "Cashier One / Cashier Two" / "Bar Controller / Attendant" / "Counter / Waiter" / your own | **"Bar Controller" and "Attendant"** (clearer to staff than numbers). Your call. |

## 🟠 Orders & fulfilment

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D5** | Reserve stock when an order is submitted? | no reservation / reserve via `quantity_reserved` | **No reservation** in v1. Stock is checked at fulfilment, and the attendant sees available stock when ordering. |
| **D8** | Price used: at submission or at fulfilment? | submit snapshot / fulfil-time price | **Submission snapshot.** |
| **D9** | Can attendants give discounts in bar mode? | no / yes within `max_discount_percent` | **No** (off by default; a setting can enable it). |
| **D10** | Can the controller (or a manager) sell directly, and fulfil an order they initiated? | no / controller via retail checkout as own sale / yes | **Controller: direct sales via retail checkout as their own sale, shown separately. Never fulfil their own bar order. Admin may, logged.** |
| **D17** | Use cash shifts in bar mode? | not used / optional | **Optional, informational.** Bar money is reconciled by the ledger. |

## 🟠 Money, balances & reconciliation

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **BD** | Business-day cut-off hour and timezone | e.g. 06:00 Africa/Lagos | **06:00, Africa/Lagos**, configurable per store. |
| **D11** | Day close per branch or per controller? | one per branch per day / one per controller per day | **Per branch** if a bar has one controller per shift. **Per controller** if several work in parallel. *Tell us how your pilot bar operates.* |
| **D12** | Can the controller pay out from the till (commission, petty expenses)? | no / yes, recorded | **No** in v1. All payouts go through a manager or owner. |
| **D13** | Who can make manual ledger adjustments? | admin only / admin + manager | **Admin only.** Managers get write-offs (reason required). |
| **D18** | Customer transfers to an attendant's **personal** account | allowed but tracked / forbidden by policy | **Tracked** (declared as transfer, remitted by the attendant). Most owners will also forbid it by policy. |
| **D19** | Record customer IOUs / tabs explicitly? | no (the attendant carries the shortfall) / yes, via a customer credit link | **No** in v1. The attendant carries it, and a manager may write off. |
| **D20** | Track tips? | no / separate remittance type | **No.** |
| **D21** | Attendant remits more than they owe | allow → credit balance / reject | **Allow with confirmation.** It becomes a credit, flagged in reports. |
| **D22** | Block new orders when an attendant's outstanding balance exceeds a limit? | no / yes, configurable limit | **Yes, optional setting, off by default.** |
| **D23** | How are controller cash shortages and overages settled? | charge controller ledger / expense ("cash shortage") / other income | **Manager chooses per variance**: charge the controller, or post to expense / other income, with a reason. |
| **BR** | Back-dated remittances by controllers | never / up to N days if enabled | **Off by default.** Never into a closed day. |

## 🟠 Damages / flat beer

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D24** | Who bears the cost of flat or damaged beer? | house (none) / attendant at cost / attendant at selling price | **Configurable. Default "house".** Many parlours charge the attendant at cost. *What does your target customer do?* |
| **D14** | Can controllers see the damage report? | today only / full history | **Today only** (managers see everything). |
| **D26** | Require manager approval above a damage threshold? | no / yes above N units per day | **Optional alert** in v1. Approval workflow only if pilots show abuse. |

## 🟢 Commission

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D27** | Commission basis | gross sales (incl. VAT) / **net sales excl. VAT after discounts** / gross margin | **Net sales excluding VAT, after discounts, minus approved reversals.** |
| **D28** | Is commission earned on fulfilled sales, or only on sales fully remitted? | fulfilled / remitted | **Fulfilled** (simpler). Use D22 to control unremitted balances. |
| **D25** | Deduct damages from commission? | no / yes | **No** (avoids double penalty when damage is already charged to the balance). |
| **D29** | When does commission hit the books as an expense? | when posted (accrual) / when paid (cash) | **When posted (accrual)**, with paid status tracked separately. |
| **D15** | Can controllers earn commission too? | no / yes, on what basis | **No** in v1. |
| **D16** | Who assigns operational profiles? | admin only / admin + manager | **Admin only**, matching user management today. |

## 🟢 Commercial

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D4** | Backfill `business_date` for retail sales later? | no / yes | **No.** Bar only. |
| **D6** | Is bar mode included in all plans or a paid feature? | all plans / Pro only / add-on | **Your commercial call.** The technical gate is ready either way. |
| **PL** | Pilot site | — | **Please nominate one real bar** for the Phase 4 pilot. Its operating model answers D11, D24 and BD. |

---

### Minimum set needed to start

To start **Phase 0 and Phase 1**, we only needed **A0, D1, D2, D3, D7, N1**. All of them are now approved except D3, which runs on its default.
Everything else can be confirmed before the phase that uses it.
