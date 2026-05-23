# Handoff: Transactions + Receipt (View Transaction)

## Overview

Modern, fintech-inspired redesign of two related screens in the existing JayPOS app:

1. **Transactions** — a list of sales and refunds with status + period filters and a hero summary card
2. **Receipt** (View Transaction) — a bottom sheet showing full transaction details, with Share and Process Refund actions

The redesign treats transactions like a banking-app activity feed: scannable rows, clear sign on amounts (`+` for sales / `−` for refunds), and a focused detail sheet that surfaces everything a cashier needs without leaving the list.

## About the Design Files

The files in this bundle are **design references created in HTML/React (DOM)** — interactive prototypes showing intended look, layout, motion, and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs inside the existing React Native + Expo codebase**, using the navigation, theming, and component conventions already established there.

To explore the prototype:
1. Open `Mobile POS.html` in a browser
2. Tap "Sign in" on the JayPOS login screen
3. From the dashboard, tap any of these to open Transactions: **Refund**, **Receipts**, or **See all** (in the Recent activity section)
4. On the Transactions screen, tap any row to open the **Receipt** bottom sheet

> Other screens in the prototype (Dashboard, Inventory, Analytics, Settings, New Sale, New Product, Login) are present for context but **are not in scope** for this handoff.

## Fidelity

**High-fidelity.** Exact colors, type scale, spacing, radii, and interactions are specified below. Match them as closely as React Native primitives allow.

---

## Target Stack — React Native + Expo

| Need | Library |
|---|---|
| Screen routing | `@react-navigation/native` — Transactions as a modal screen, Receipt as a bottom sheet |
| Bottom sheet (Receipt) | `@gorhom/bottom-sheet` (recommended) **or** `<Modal animationType="slide">` with a 24px top-radius container |
| SVG icons | `react-native-svg` (paths in `icons.jsx`), or swap to `lucide-react-native` |
| Custom fonts | `expo-font` + `@expo-google-fonts/plus-jakarta-sans` + `@expo-google-fonts/jetbrains-mono` |
| Gradients | `expo-linear-gradient` |
| Animation | `react-native-reanimated` v3 |
| Haptics | `expo-haptics` (`impactAsync('light')` on row tap, refund tap) |
| Share | `expo-sharing` for the Share button |
| Safe area | `react-native-safe-area-context` |

---

## Design Tokens

### Color — Light theme

```js
const LIGHT = {
  bg:     '#F4F1EA', // warm off-white app canvas
  card:   '#FFFFFF',
  ink:    '#0E0E10', // primary text
  muted:  '#71717A', // secondary text
  border: 'rgba(14,14,16,0.07)',
};
```

### Accent (Indigo, default)

```
accent[0]: #6E56F7
accent[1]: #3D2EC4
accent-fg: #FFFFFF
```

Used for: hero summary card gradient, Share button tint, active chip fill.

### Semantic colors

```
success:  #10B981   — sale rows (arrow-up-right tile), COMPLETED status pill
success-dark: #0F8A5B  — status pill text
danger:   #FB7185 / #E11D6B   — refund rows, refund button gradient, REFUNDED pill
neutral grays: rgba(0,0,0,0.06) for chips/dividers
```

### Spacing & radii

- Horizontal screen padding: **20**
- Card padding: **14–18**
- Row vertical padding: **14**
- Radii: pills `999`, icon tiles `14`, buttons `16`, cards `16–20`, sheet top corners `24`

### Typography

```
UI:       "Plus Jakarta Sans" (400/500/600/700/800)
Numeric:  "JetBrains Mono"    (400/500/600/700/800) — tabular figures
```

Always set `fontVariant: ['tabular-nums']` on monospace numerics in RN.

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Screen title ("Transactions") | Plus Jakarta Sans | 22 | 800 | -0.02em |
| Sheet title ("Receipt") | Plus Jakarta Sans | 22 | 800 | -0.02em |
| Hero amount | JetBrains Mono | 36 (sheet) / 26 (list) | 700 | -0.03em |
| Row name | Plus Jakarta Sans | 14 | 700 | 0 |
| Row amount | JetBrains Mono | 14 | 800 | 0 |
| Section eyebrow | Plus Jakarta Sans | 10–11 | 700 | UPPERCASE +0.10–0.12em |
| Meta label | Plus Jakarta Sans | 12 | 600 | 0 |
| Meta value | Plus Jakarta Sans | 13 | 700 | 0 |
| Status pill | Plus Jakarta Sans | 9 | 800 | +0.06–0.08em UPPERCASE |
| Row sub | Plus Jakarta Sans | 11 | 500 | 0 |
| Mono ID (#9C781228) | JetBrains Mono | 12 | 600 | 0 |

Currency: `₦` prefix at **55% opacity**, number bold in JetBrains Mono. Negative (refund) uses Unicode minus `−` (`\u2212`), not hyphen.

---

## SCREEN 1 — Transactions List

**Purpose:** Browse and filter all sales and refunds.

### Header (padding `14/20/14`, card bg, no bottom border)

- **Back button** (40×40 icon button, card bg, 1px border, 14px radius) → left arrow icon
- **Title block** (`flex: 1`):
  - "Transactions" — 22 / 800 / -0.02em / lineHeight 1.1
  - "11 records" — 12 / muted, mono count digit
- **Search icon button** (40×40, same style as back)

### Hero summary card (padding `8/20/14`, card bg)

A purple gradient card inside the card-bg region. Important: this card is **inside** the header zone (card-bg parent), not in the body.

```
borderRadius: 18
background: linear-gradient(135deg, var(--accent), var(--accent-2))
color: var(--accent-fg)
padding: 16/18
position: relative, overflow: hidden
```

Decorative: a `130×130` circle, `rgba(255,255,255,0.08)`, positioned `top: -30, right: -30` (peeks in from top-right corner).

Content (relative z-index above the orb):
- **Left column:**
  - Eyebrow "NET TODAY" or "NET THIS WEEK" — 10/700/+0.10em/uppercase/`opacity: 0.8`
  - Big amount — JetBrains Mono 26/700/-0.02em. `₦` prefix at `opacity: 0.7`, number in regular weight. For refunds the sign is implicit; the period is always net (sum of sales − refunds).
- **Right column** (text-align: right):
  - "Avg sale" — 11/0.8 opacity
  - Average amount — JetBrains Mono 15/700, `₦` at 0.7 opacity

The hero numbers always reflect the **currently filtered** list (filters update both the row count and the hero summary).

### Filter chips row (padding `4/20/14`, card bg, 1px bottom border)

Horizontal scroll, no scrollbar, 8px gap. Two logical groups separated by a thin **vertical divider** (1px, `var(--border)`, 4px vertical margin on the divider for visual breathing room).

**Group 1 — Status:**
- All
- Completed
- Refunded

**Group 2 — Period:**
- Today
- Week

Chip anatomy:
- Pill: 999 radius, padding `8/14`, 13/600 label
- Active: accent fill + accent-fg text
- Inactive: card bg + 1px muted border + ink text

Two groups are **independent** — All + Today, Refunded + Week, etc. Active state from each group is tracked separately.

### List (flex 1, bg color, no horizontal padding on rows)

Each row is a full-width button (`padding: 14/20`, 1px bottom border except for the last row).

Anatomy (display: flex, gap 14, align center):
- **Left: status tile** — 44×44, 14px radius, flex-shrink 0
  - Sale: bg `rgba(16,185,129,0.12)`, color `#0F8A5B`, arrow-up-right icon (20px, strokeWidth 2)
  - Refund: bg `rgba(251,113,133,0.12)`, color `#E11D6B`, refund icon (20px)
- **Middle: text column** (flex 1, min-width 0)
  - Cashier name (e.g. "Admin", "Fidelis") — 14/700/ink
  - Meta line — 11/500/muted, 2px top margin: `Method · N items · time-ago`
    - Example: `Card · 2 items · 20h ago`
- **Right: amount column** (text-align: right)
  - Amount — JetBrains Mono 14/800. `+` for sales (ink color), `−` for refunds (#E11D6B). `₦` at 0.55 opacity.
  - Status pill (4px top margin, inline-block):
    - 9/800/+0.06em UPPERCASE
    - padding `2/7`, 999 radius
    - COMPLETED: text `#0F8A5B`, bg `rgba(16,185,129,0.12)`
    - REFUNDED:  text `#E11D6B`, bg `rgba(225,29,107,0.10)`

### Empty state (when no rows match)

Center-aligned, `padding: 60/40`:
- 56×56 muted icon tile (radius 18, `rgba(0,0,0,0.04)` bg), receipt icon at 26px
- "No transactions yet" — 14/700/ink
- "Try a different filter." — 12/muted, 4px top margin

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Back button | Tap | Pop to previous screen (Dashboard). |
| Search button | Tap | Open search overlay (out of scope; placeholder route). |
| Chip tap (status group) | Tap | Set status filter. Re-filter list + recalc hero. |
| Chip tap (period group) | Tap | Set period filter. Re-filter list + recalc hero. |
| Row tap | Tap | Open Receipt bottom sheet for that transaction. Light haptic. |
| Pull-to-refresh | (RN convention) | Reload transactions from API. |

---

## SCREEN 2 — Receipt (View Transaction)

Bottom sheet, half-to-full height. Slides up from the bottom with `cubic-bezier(0.16, 1, 0.3, 1)` over **300ms**. Backdrop is `rgba(14,14,16,0.55)` with optional blur (2px); tapping it dismisses.

### Container

```
position: bottom-anchored
left/right: 0
background: var(--bg)         // NOT card — body uses bg color for nested cards to show through
borderRadius: 24px 24px 0 0
padding: 14/20/22
maxHeight: 85%
overflowY: auto
boxShadow: 0 -20px 60px -10px rgba(0,0,0,0.25)
```

### 1) Grabber handle (centered, 14px bottom margin)

36×4 pill, `var(--border)` color, 2px radius.

### 2) Header row (18px bottom margin)

Display: flex, justify space-between, align flex-start, gap 12.

- **Left:**
  - "Receipt" — 22/800/-0.02em
  - `#9C781228` — 12/600/muted, **JetBrains Mono**, 2px top margin
- **Right close button** (32×32 circle):
  - bg `rgba(0,0,0,0.06)`, no border, ink color
  - X icon at 16px, strokeWidth 2.2

### 3) Hero amount card

Same gradient pattern as the Transactions list summary (and similar to the Dashboard hero):

```
padding: 20/18
borderRadius: 20
background: linear-gradient(135deg, var(--accent), var(--accent-2))
color: var(--accent-fg)
position: relative, overflow: hidden
```

Decorative `130×130` orb at `top: -30, right: -30`, `rgba(255,255,255,0.08)`.

Content:
- Eyebrow: "TOTAL PAID" (or "REFUNDED" if status === 'refunded') — 10/700/+0.10em/uppercase, opacity 0.8
- Amount — JetBrains Mono 36/700/-0.03em. Refund renders with `−` prefix. `₦` at 0.7 opacity.
- Status pill (8px top margin, inline-flex, gap 6):
  - bg `rgba(255,255,255,0.18)`, 1px border `rgba(255,255,255,0.22)`
  - padding `4/10`, 999 radius
  - 10/800/+0.08em UPPERCASE
  - Leading 6×6 white dot
  - Label: "COMPLETED" / "REFUNDED"

### 4) Meta card (14px top margin)

A white card with internal rows separated by 1px borders. NOT a flat list — a single contained card.

```
background: var(--card)
border: 1px solid var(--border)
borderRadius: 16
padding: 4/14   (vertical padding is provided by inner rows)
```

Inside, four rows. Each row:
- Display: flex, align center, gap 12, padding `11/0` (no horizontal — inherited from card)
- Border-bottom 1px (except last row)
- Left: **label** — 12/600/muted, min-width 72
- Right: **value** — 13/700/ink, text-align right, optionally a leading mini-element (avatar/icon)

Rows in order:
1. **Date** — `15 May 2026 · 16:44`
2. **Cashier** — small 20×20 avatar (letter on `#6E56F7 + 20`) + name (e.g. "Admin")
3. **Method** — 16px icon (banknote for Cash, card for Card, transfer for Transfer) + label
4. **ID** — `#9C781228` (rendered in JetBrains Mono)

### 5) Items section

Eyebrow above (14px top margin):
```
"Items · 2"   // count in JetBrains Mono / 700
10/700/+0.12em/uppercase/muted
```

Then another contained card (8px top margin, same styling as the Meta card). Inside, one row per item. Each row:
- Display: flex, align center, gap 12, padding `12/0`, 1px bottom border except last
- **Left (text column, flex 1):**
  - Item name — 14/700/ink (e.g. "Goldberg", "Smartphone Pro")
  - Sub — JetBrains Mono 11/500/muted, 2px top margin: `×3 @ ₦1,000`
- **Right (line total):**
  - JetBrains Mono 14/800/ink, `₦` at 0.55 opacity

### 6) Totals stack (14px top margin)

Three rows, gap 6, padding `0/4`:

1. Subtotal — label 12/600/muted, value mono 13/700/ink (`₦` at 0.55)
2. VAT (7.5%) — same anatomy
3. **Divider** — 1px `var(--border)`, 4/0 vertical margin
4. TOTAL — label 14/800/ink/+0.02em UPPERCASE, value **JetBrains Mono 22/800/ink** (`₦` at 0.55)

### 7) Action row (20px top margin)

Display: flex, gap 10.

- **Share button** (flex 1, full-width within column)
  - bg `rgba(110,86,247,0.10)`, 1px border `rgba(110,86,247,0.22)`, accent text
  - padding 14, 16px radius, 14/700
  - Icon-left: arrow-up-right (16px, strokeWidth 2.2) + label "Share"
- **Process Refund button** (flex 1.2 — slightly wider)
  - **Active (status = completed):** `linear-gradient(135deg, #FB7185, #E11D6B)`, white text
    - 14/700, padding 14, 16px radius
    - Icon-left: refund icon (16px, strokeWidth 2) + label "Process Refund"
    - boxShadow `0 12px 24px -8px rgba(251,113,133,0.6)`
  - **Disabled (status = refunded):** bg `var(--border)`, text muted, label "Refunded", cursor default, no shadow

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Backdrop | Tap | Dismiss sheet. |
| Close button | Tap | Dismiss sheet. |
| Swipe down on handle | Drag past threshold | Dismiss sheet. (RN: `@gorhom/bottom-sheet` handles this natively.) |
| Share button | Tap | Open native share sheet with the formatted receipt text (`expo-sharing`). |
| Process Refund button | Tap (when completed) | Open refund confirmation alert → on confirm, post refund + update status + show success haptic. Button transitions to disabled "Refunded" state. |

---

## Data Shape

```ts
type Transaction = {
  id: string;          // "9C781228" — hex, ~8 chars, used as `#${id}`
  cashier: string;     // "Admin"
  method: 'Cash' | 'Card' | 'Transfer';
  items: { name: string; qty: number; price: number }[];
  total: number;       // 146175
  vat: number;         // 10175 — derived; included on the model for receipt display
  date: string;        // "15 May 2026 · 16:44" — pre-formatted for display
  ago: string;         // "20h ago" / "1d ago" — pre-formatted relative
  status: 'completed' | 'refunded';
};

// Derived in receipt sheet:
const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
// (total === subtotal + vat, by convention)
```

Format the `date` and `ago` strings server-side (or with a `formatRelative()` helper) — keep the components string-display-only.

---

## Wiring (Existing Screens)

The Transactions screen is reachable from **three** places on the Dashboard:

1. **Refund** quick action (in the hero card's quick-action row) → opens Transactions modal
2. **Receipts** quick action (same row) → opens Transactions modal
3. **See all** action button next to the "Recent activity" section header → opens Transactions modal

All three open the **same** Transactions screen — there's no separate Refund landing screen. From there the user finds the relevant transaction and acts on it via the Receipt sheet.

Each Recent-activity row on the Dashboard *may* also deep-link directly to its Receipt sheet — this is an optional enhancement, not required for v1.

---

## Component Inventory

Build these in `components/transactions/`:

- **`<TransactionsHeader>`** — back button + title + record count + search button
- **`<TransactionsHero>`** — gradient summary card with net total + avg
- **`<FilterChipGroup>`** — segmented horizontal scroll with two chip groups separated by a divider
- **`<Chip active onPress>`** — pill chip used in the filter row (reuse from existing app if available)
- **`<TransactionRow>`** — status tile + name/meta + amount/status-pill
- **`<EmptyState>`** — icon tile + title + sub
- **`<ReceiptSheet>`** — the bottom sheet itself
- **`<ReceiptHeroCard>`** — gradient amount card with status pill
- **`<MetaCard>`** — wrapper card with `<MetaRow>` children
- **`<MetaRow>`** — label · value (with optional leading element)
- **`<ItemsCard>`** — wrapper card with `<LineItemRow>` children
- **`<TotalsStack>`** — three rows + divider, optionally a `big` row
- **`<Money n />`** — wraps a number with `₦` muted prefix (reuse from existing app if available)

---

## Animations

| Element | Spec |
|---|---|
| Transactions modal slide-up | 300ms `cubic-bezier(0.16, 1, 0.3, 1)`, `translateY(100% → 0)`, opacity 0.85 → 1 |
| Receipt sheet slide-up | Same as modal |
| Backdrop fade-in | 250ms ease |
| Chip selection | 150ms color crossfade on bg + fg + border |
| Refund button press | 100ms scale to 0.96 + medium haptic |
| Status pill on refund completion | Crossfade COMPLETED → REFUNDED over 200ms |

---

## State

### Transactions screen
```ts
status: 'all' | 'completed' | 'refunded'   // default 'all'
period: 'today' | 'week'                    // default 'week'
query:  string                              // search input
openId: string | null                       // current open receipt
```

Filter logic (`useMemo`):
```ts
filtered = TRANSACTIONS.filter(t => {
  if (status !== 'all' && t.status !== status) return false;
  if (period === 'today' && !t.ago.endsWith('h ago')) return false;
  if (query && !matchesAnyField(t, query)) return false;
  return true;
});
```

### Receipt sheet
```ts
// Owned by the Transactions screen — sheet itself is stateless and pure.
// Pass { txn, onClose, onRefund, onShare } as props.
```

---

## Files in this bundle

| File | What |
|---|---|
| `Mobile POS.html` | Open in a browser to interact with the full prototype. |
| `transactions.jsx` | **Primary source.** `TransactionsScreen` + `TxnRow` + `ReceiptSheet` + `MetaRow` + `TotalsStack` + fixture data. |
| `screens.jsx` | Shared atoms used by these screens: `Money`, `Pill`, `Chip`, `Avatar`, `SectionHeader`, `iconBtn` style. |
| `icons.jsx` | Lucide-style icons — copy `d=` strings into `react-native-svg`. The icons used here: `arrowUpRight`, `refund`, `receipt`, `banknote`, `card`, `transfer`, `close`, `search`. |
| `app.jsx` | Shell with theme tokens + how Transactions is mounted as a modal — reference for nav routing. |
| `screens2.jsx`, `forms.jsx`, `logo.jsx`, `login.jsx`, `tweaks-panel.jsx` | Out of scope — included only because `Mobile POS.html` references them. |
| `README.md` | This file. |

---

## Suggested Implementation Order

1. **Atoms** — `<Chip>`, `<Money>`, `<Avatar>` (likely already exist in the app)
2. **TransactionRow** + the **Transactions list page** with a fixture array — wire the back arrow and chip filters before doing the data fetch
3. **TransactionsHero** — the gradient summary card (use `expo-linear-gradient`)
4. **ReceiptSheet** + its building blocks (`<MetaCard>`, `<ItemsCard>`, `<TotalsStack>`) — wire it open from a row tap with hardcoded data first
5. **Refund flow** — the rose-gradient button + the disabled/refunded state. Hook to your existing refund API.
6. **Share flow** — `expo-sharing` with a formatted receipt string. Spec for the share text:
   ```
   JayPOS Receipt — #9C781228
   15 May 2026 · 16:44
   Cashier: Admin · Method: Card

   ×3  Goldberg          ₦3,000
   ×3  Smartphone Pro    ₦135,000

   Subtotal: ₦135,000
   VAT (7.5%):  ₦10,175
   TOTAL:       ₦146,175
   ```

Light haptics on every primary action; respect safe-area insets at top + bottom on both platforms.
