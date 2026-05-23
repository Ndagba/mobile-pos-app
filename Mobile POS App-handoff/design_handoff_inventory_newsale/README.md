# Handoff: Inventory + New Sale + New Product

## Overview

A modern, fintech-inspired redesign of three screens in the existing Mobile POS app:

1. **Inventory** — catalog browser with Products / Categories / Low-stock tabs
2. **New Sale** — product picker with cart drawer and payment selection (opened from the Inventory FAB or the global "New Sale" action)
3. **New Product** — full-screen creation form

The redesign prioritizes **information density**, **clarity**, and **a calm visual rhythm** over decorative chrome. Every screen leads with content, not navigation.

## About the Design Files

The files in this bundle are **design references created in HTML/React (DOM)** — interactive prototypes showing intended look, layout, motion, and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs inside the existing React Native + Expo codebase**, using the navigation, theming, and component conventions already established there.

Open `Mobile POS.html` in a browser, **tap the JayPOS sign-in button**, then explore. To inspect each screen:

- **Inventory**: tap the box icon in the bottom nav
- **New Sale**: tap the center FAB (cart icon) in the bottom nav — or the "New Sale" quick action on the Dashboard
- **New Product**: from the Inventory tab, tap the floating dark "New product" pill (bottom-right)

> Other screens (Dashboard, Analytics, Settings, Login, New Category bottom sheet) are present in the prototype for context but **are not in scope** for this handoff. Implement only the three above.

## Fidelity

**High-fidelity.** Exact colors, type scale, spacing, radii, and interactions are specified below. Match them as closely as React Native primitives allow.

---

## Target Stack — React Native + Expo

| Need | Library |
|---|---|
| Sheet (New Product, New Sale) | `@gorhom/bottom-sheet` **or** `<Modal presentationStyle="pageSheet" animationType="slide" />` |
| SVG icons | `react-native-svg` (paths in `icons.jsx`), or swap to `lucide-react-native` |
| Custom fonts | `expo-font` + `@expo-google-fonts/plus-jakarta-sans` + `@expo-google-fonts/jetbrains-mono` |
| Animation | `react-native-reanimated` v3, plus `LayoutAnimation` for simple expand/collapse |
| Haptics | `expo-haptics` (`impactAsync('light')` on add-to-cart, FAB press) |
| Safe area | `react-native-safe-area-context` |

State management — whatever the app uses already.

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

### Color — Dark theme (optional, support if app already has dark mode)

```js
const DARK = {
  bg:     '#0B0B0E',
  card:   '#16161B',
  ink:    '#F5F5F7',
  muted:  '#9090A0',
  border: 'rgba(255,255,255,0.07)',
};
```

### Accent (Indigo — default)

```
accent[0]: #6E56F7  (start)
accent[1]: #3D2EC4  (end)
accent-fg: #FFFFFF
```

Used for: primary buttons, active states, selected/highlighted borders, focus rings on inputs.

### Category tones (per product `tone` field)

```
Electronics:        #6E56F7  (indigo)
Alcoholic Drinks:   #F59E0B  (amber)
Soft Drinks:        #FB7185  (rose)  / #10B981 (green) — whichever the existing data uses
Snacks:             #10B981  (emerald)
```

Each category tile uses the tone at **20% alpha** (`tone + '20'`) for icon backgrounds and 10% alpha (`tone + '1A'`) for KPI tile backgrounds.

### Semantic colors

```
success:  #10B981 — positive deltas, "in stock", margin preview
warning:  #F59E0B — low stock (≤10 units)
danger:   #FB7185 / #E11D6B — critically low stock (≤5), refunds, required-field asterisk
```

### Spacing & radii

- Horizontal screen padding: **20**
- Card padding: **12–18** (default 14)
- Card-to-card gap: **8–10**
- Form field gap: **10**
- Section header eyebrow → content gap: **10**
- Radii: pills `999`, icon tiles `10–12`, buttons `14`, inputs `14`, cards `14–18`, sheets `24` top-corner, FAB `999`, segmented `14` outer + `10` inner.

### Typography

```
UI:       "Plus Jakarta Sans" (400/500/600/700/800)
Numeric:  "JetBrains Mono"    (400/500/600/700/800) — tabular figures
```

Always set `fontVariant: ['tabular-nums']` on numeric monospace in RN.

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Screen title | Plus Jakarta Sans | 26 | 800 | -0.02em |
| Sheet title | Plus Jakarta Sans | 17–18 | 800 | -0.01em |
| Product name | Plus Jakarta Sans | 13–14 | 700 | -0.01em |
| Price | JetBrains Mono | 14 | 800 | 0 |
| Stock value (hero) | JetBrains Mono | 22–24 | 800 | -0.01em |
| Eyebrow / section label | Plus Jakarta Sans | 10–11 | 700 | UPPERCASE +0.10em |
| Category tag on card | Plus Jakarta Sans | 9 | 700 | UPPERCASE +0.06em |
| Meta / muted | Plus Jakarta Sans | 11–12 | 500 | 0 |
| LOW badge | Plus Jakarta Sans | 9 | 700 | 0 |

Currency: `₦` prefix at 55% opacity, number bold in JetBrains Mono.

---

## SCREEN 1 — Inventory

**Purpose:** Browse and manage products, categories, and low-stock items. Spin off New Product / New Category creation.

### Layout (top → bottom)

1. **Header** (`paddingHorizontal: 20`, `paddingTop: 8`)
   - Left column:
     - "Inventory" eyebrow — 13px / muted
     - "Catalog" — 26px / 800 / -0.02em tracking
   - Right: 40×40 search icon button (card bg, 1px border, 14px radius)

2. **Segmented tabs** — single card row, full width, 14px outer radius, 4px inner padding, 2px gap between segments
   - **Products** (count) · **Categories** (count) · **Low stock** (count)
   - Active segment = accent fill (`#6E56F7`) + white text + count chip in `rgba(255,255,255,0.22)`
   - Inactive = transparent + ink text + count chip in `rgba(0,0,0,0.06)`
   - Each segment is `flex: 1`, padding `8px 4px`, inner radius 10
   - Count chip: 10px/700 JetBrains Mono, padded `1px 6px`, 999 radius

3. **Branch filter chips** — horizontal scroll, no scrollbar, 8px gap, padding `14/20/4`
   - Pill chip: 999 radius, padding `8px 14px`, font 13/600
   - Active = accent fill + white text
   - Inactive = white card bg + 1px muted border + ink text
   - Each chip has an optional 14px leading icon (store / branch)

4. **Stock value bar** — white card, 18px radius, padding `14/16`, 1px border
   - Left: eyebrow "STOCK VALUE" + big mono `₦2,148,500` (24/800)
   - Right: mini bar sparkline, height 36px, accent color (bars get progressively brighter, ~35% → 100% opacity)

5. **Content** — switches by active tab:

#### Products tab
- Eyebrow row: "6 PRODUCTS" + right-aligned "Sort" link button
- Vertical list, 8px gap, each row:
  - 44×44 circular avatar (letter on `tone + '20'` background, `tone` text, 700/18px)
  - Middle column:
    - Row 1: name (14/700) + "Low" pill if stock ≤10
    - Row 2: "Electronics · SKU ELC-002" (12/muted)
  - Right column:
    - Price (mono 14/700, ₦ prefix at 55% opacity)
    - "48 in stock" (11/muted/mono)
- Each row: card bg, 16px radius, 1px border, padding 12

#### Categories tab
- Eyebrow: "4 CATEGORIES"
- 2-column grid, 10px gap, each card:
  - 44×44 letter tile (radius 14, `tone + '20'` bg, `tone` text, 800/18)
  - Name (14/700) + "14 products" (12/muted, count in mono/700)
- Card: 18px radius, 14px padding, 1px border

#### Low stock tab
- Eyebrow: "NEEDS REORDER"
- Vertical list, 8px gap, each row:
  - 44px letter avatar (same as Products)
  - Middle column: name (14/700) + category (12/muted) + 5px tall progress bar (999 radius, `rgba(0,0,0,0.06)` track, fill colored: rose if ≤5, amber if ≤10)
  - Right column: stock count (mono 18/800, in tone color) + "left" (10/muted)

6. **Floating FAB** — anchored `bottom: 102` (above bottom nav), `right: 20`
   - Pill shape, 999 radius, padding `14/18`
   - Ink (`#0E0E10`) background, bg-color text
   - Soft shadow: `0 12px 30px rgba(0,0,0,0.2)`
   - Label changes by tab: **"+ New product"** (Products / Low stock) or **"+ New category"** (Categories)
   - Tap → opens the relevant sheet

### Behavior

- Tapping a tab swaps content with a quick cross-fade (no slide).
- Branch filter scrolls horizontally with momentum.
- Tap any product row → open product detail (out of scope; placeholder route).
- FAB always present; label tracks the active tab.

---

## SCREEN 2 — New Sale (Modal)

**Purpose:** Build a cart and charge a customer. Opens from the bottom-nav center FAB or the dashboard "New Sale" quick action.

Slides up from the bottom with `cubic-bezier(0.16, 1, 0.3, 1)` over **300ms**.

### Layout (top → bottom)

1. **Header bar** (card bg, 1px bottom border, padding `14/20/14`)
   - 40×40 close button (X icon, card bg, 1px border, 14px radius)
   - Center column:
     - **"New Sale"** title (17/800, -0.01em tracking, lineHeight 1.1)
     - Subtitle row (11/muted, 3px top margin, gap 6):
       - "0 items"
       - "·" separator
       - **Branch selector pill** — `rgba(110,86,247,0.08)` bg, accent text, 11/700, padding `3/8`, 999 radius. Trailing chevron-down (12px). Tap → opens popover dropdown with the three branches; selected one has accent text + check icon.
   - 40×40 QR scan button (card bg, 1px border, 14px radius)

   > **CRITICAL: do not use the giant chip row** that previously occupied a whole row. The branch selector lives inline in the subtitle.

2. **Search input** (padding `12/20/8`)
   - Card row: 14px radius, padding `10/14`, 1px border, search icon left
   - Placeholder: "Search by name or SKU"

3. **Products grid header** — padding `8/4/10`
   - Left: "6 PRODUCTS" eyebrow (10/700/+0.10em/uppercase/muted)
   - Right: "All" filter button (11/600/muted, filter icon left)

4. **Products grid** — 2 columns, 10px gap, scrollable, `paddingBottom: itemCount > 0 ? 180 : 120`

   > **CRITICAL: no letter initials.** The previous design had a 56×56 letter avatar inside a 90px image header. Both are removed. Cards are now ~half the height.

   Each card:
   - Background: card color, 14px radius, 1px border (`tone + '55'` when item is in cart, otherwise muted border), 12px padding, overflow hidden, relative position
   - **3px-wide left edge strip** — full-height absolute, colored with the product's `tone` at 85% opacity. This is the only color cue for category — no letter avatar.
   - Inside (offset by `marginLeft: 6` to clear the strip):
     - **Top row** (14px min height): category eyebrow (9/700/+0.06em/uppercase, in `tone` color, ellipsized) + optional "LOW" badge (9/700, rose color on `rgba(251,113,133,0.10)`, padding `1/5`, radius 4)
     - **Name** (13/700, lineHeight 1.25, fixed 32px height, 2-line clamp): 4px top margin
     - **Bottom row** (8px top margin, space-between):
       - Price (mono 14/800, ₦ prefix at 55% opacity)
       - Add control:
         - **0 in cart:** 28×28 accent-filled `+` button (9px radius, white plus icon, strokeWidth 2.4, 15px size)
         - **≥1 in cart:** stepper — `−` (26×26, accent at 10% bg, accent stroke) · qty (mono 13/800, min 14px width, centered) · `+`

5. **Cart drawer** — bottom-anchored, card bg, top corners 24px radius, top border, padding `14/20/22`, soft top shadow `0 -10px 40px rgba(0,0,0,0.06)`
   - 36×4 grabber handle (centered, 10px bottom margin)
   - **Cart row** (cursor pointer when items > 0; toggles expanded):
     - Left: 36×36 indigo-tint cart icon tile · "X items" (13/700) + "VAT ₦X" or "Tap a product to add" (11/muted)
     - Right: total `₦XX,XXX` (mono 22/800) + chevron-down (rotates 180° when expanded)
   - **Expanded** state (when `expanded && items.length`): scrollable list (max 200px), each row: 32px letter avatar (only here, for cart line items — small and contextual is fine) · name + "Qty × unit price" · line total
   - **Payment row** — 3-col grid, 6px gap, 12px bottom margin
     - Each: pill button, 12px radius, padding `10/8`, font 13/600, icon left
     - Cash · Card · Transfer
     - Active = 1px accent border + `rgba(110,86,247,0.08)` bg + accent text
     - Inactive = 1px muted border, ink text
   - **Charge button** — full width, 15px padding, 16px radius
     - Accent fill, white text, 15/700
     - `✓ Charge ₦XX,XXX` (total amount in mono)
     - Disabled state when cart empty: muted bg + muted text

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Header branch pill | Tap | Opens floating popover (160–180px wide, 1px border, 14px radius, 18px shadow). Tap a branch → swap selection + close. Tap outside → close. |
| Product card `+` | Tap | Add 1 to cart. Light haptic. Card border becomes `tone + '55'`. |
| Product card stepper `−` at qty 1 | Tap | Remove product entirely. Border reverts to muted. |
| Cart row | Tap (when items > 0) | Toggle expanded state. Chevron rotates 180°. Animate height (250ms ease-out). |
| Payment pill | Tap | Switch active method (no data side-effect until charge). |
| Charge button | Tap | Submit transaction, success haptic + dismiss modal after 1.2s. |

---

## SCREEN 3 — New Product (Modal)

**Purpose:** Create a new product. Opens as a full-screen sheet from the Inventory FAB (when on Products or Low-stock tab).

Same slide-up animation as New Sale.

### Layout

1. **Header bar** (card bg, 1px bottom border, padding `14/20/14`)
   - Close button · title block ("New Product" 17/800 + "Add to catalog" 11/muted) · "Save draft" outline pill button (right-aligned, 12/700, 8/14 padding, 12 radius, transparent bg, 1px muted border)

2. **Body** — `paddingHorizontal: 20`, `paddingTop: 16`, `paddingBottom: 140` (so footer doesn't overlap)

   1. **Branch context chip** (16px bottom margin) — inline-flex pill, accent-tint bg `rgba(110,86,247,0.08)`, 1px accent-tint border `rgba(110,86,247,0.16)`, accent text, padding `8/12`, 12 radius, 12/600. Icon (branch) + text "Creating for **Tudunfulani Branch**" (branch name bold).

   2. **Identity** section (eyebrow "IDENTITY", 10/700/+0.12em uppercase muted, `20px` top margin, `10px` bottom margin)
      - Field: **Product name** — required
      - Field: **SKU** — required, placeholder "e.g. ELC-002"

   3. **Pricing** section
      - 2-column grid, 10px gap
      - Field: **Selling price** — required, prefix `₦` (mono 14/600 muted), number input
      - Field: **Cost price** — prefix `₦`
      - Field: **Discount price** — prefix `₦`
      - Field: **VAT** — suffix `%`, default value `7.5`
      - **Margin preview** (10px top margin) — only renders when both Selling and Cost are filled. Inline card, `rgba(16,185,129,0.08)` bg, 1px `rgba(16,185,129,0.18)` border, 12px radius, padding `10/12`. Left: eyebrow "GROSS MARGIN" (11/700/+0.06em/uppercase, green `#0F8A5B`). Right: `42% · ₦X,XXX` (14/800 mono, green).

   4. **Stock** section
      - 2-column grid, 10px gap
      - Field: **Initial qty** — suffix "units"
      - Field: **Low-stock alert** — suffix "units", default `10`
      - Hint row below (8px top margin, 11/muted): bell icon + "You'll be notified when stock drops below the alert threshold. Defaults to your store-wide rule."

   5. **Categorize** section
      - Field: **Category** — required, dropdown with colored dots:
        - Electronics (`#6E56F7`)
        - Alcoholic Drinks (`#F59E0B`)
        - Soft Drinks (`#10B981`)
        - Snacks (`#FB7185`)
        - Each option in the dropdown: 8×8 colored dot + label + check icon if selected
      - Field: **Description** — multiline (3 rows)

3. **Footer** — sticky bottom, card bg, 1px top border, padding `14/20/22`, gap 10
   - **Cancel** (flex 1) — transparent bg, 1px muted border, ink text, 14/700, 14px radius, 14px vertical padding
   - **Save product** (flex 2) — accent fill, white text, check icon left
   - Disabled until name + SKU + selling price are filled. Disabled = muted bg, muted text, no shadow.

### Field anatomy (universal — used everywhere)

- White card, 1.5px border (muted by default, accent when focused)
- 14px radius, padding `14/14`
- **Floating label** — sits centered when empty + unfocused, animates to upper-left when focused or filled. Empty + unfocused: 14/500/muted. Floated: 10/700/+0.06em/uppercase/accent (when focused) or muted.
- Required asterisk: rose `#E11D6B`, 2px left margin from label
- Prefix (₦): absolute left 14, mono 14/600/muted
- Suffix (%, units): absolute right 14, mono 12/700/+0.04em muted
- **Placeholder only shows when focused** (avoids fighting the centered label state).

### Dropdown anatomy

- Closed = same as a field, but with chevron-down (16px muted) on the right and value (with optional dot) where the input would be
- Open: 14px radius card under the field, 6px gap, max-height 220, scrollable. Backdrop is a transparent fixed-position click-catcher.
- Each option: 10/12 padding, 10 radius, hover/active row gets `rgba(110,86,247,0.08)` bg and accent text + check icon.

### Behavior

- "Save draft" persists the in-progress form to local storage.
- Save product → success haptic, toast "Product added to Tudunfulani Branch", dismiss.
- Cancel → if any field is dirty, show a confirmation alert; else dismiss immediately.
- Inputs auto-format: numeric fields strip non-digits; price fields format with thousands separators on blur.

---

## Reusable Components to Build

Build these in `components/` before tackling the screens:

- **`<IconButton>`** — 40×40 card-bg button, 14px radius, 1px border
- **`<Field>`** — text input with floating label + optional prefix/suffix/multiline
- **`<SelectField>`** — dropdown with floating label, options support `{value, label, dot?}`
- **`<Chip active onPress icon>`** — pill chip used in branch filter
- **`<Pill color bg>{text}</Pill>`** — small status badge (Low, role tags, etc.)
- **`<Money n size weight />`** — wraps a number with `₦` muted prefix
- **`<SectionLabel>`** — uppercase eyebrow (10/700/+0.12em/muted, vertical margin 20/10)
- **`<ContextChip icon label>`** — accent-tint pill ("Creating for X Branch")
- **`<Avatar letter color size />`** — colored letter circle (used only in Inventory list rows + the small in-cart line items, NOT on New Sale product cards)
- **`<Sparkbars data color height />`** — bar trend chart

---

## Animations

| Element | Spec |
|---|---|
| Modal slide-up | 300ms `cubic-bezier(0.16, 1, 0.3, 1)`, from `translateY(100%)` to `0`, opacity 0.85 → 1 |
| Drawer expand (cart) | 250ms ease-out |
| Tab segment switch | 150ms color crossfade |
| Field focus | 150ms border + label color transition |
| Toggle/select dropdown | 150ms fade + chevron rotation 180° |
| Add-to-cart `+` press | 100ms scale-down to 0.95 + light haptic |

---

## State

### Inventory
```ts
tab:      'products' | 'categories' | 'low'
branch:   'all' | 'bosso' | 'tudunfulani'
sheet:    'product' | 'category' | null
```

### New Sale
```ts
branch:       'all' | 'bosso' | 'tudunfulani'
branchOpen:   boolean
query:        string
cart:         Record<productId, qty>
pay:          'cash' | 'card' | 'transfer'
expanded:     boolean   // cart drawer
```

### New Product
```ts
name, sku, sell, cost, disc, stock, alert, cat, desc: string
vat: string  // default '7.5'
// Derived: valid = name && sku && sell
// Derived: marginPct = round((sell - cost) / sell * 100)
```

---

## Files in this bundle

| File | What |
|---|---|
| `Mobile POS.html` | The full interactive prototype — open in a browser. |
| `screens.jsx` | Shared atoms (`Money`, `Pill`, `Chip`, `Avatar`, `Card`, `SectionHeader`, `Sparkbars`, `Sparkline`) + data fixtures + Dashboard (for context). |
| `screens2.jsx` | Contains the **Inventory** + **New Sale** (CheckoutScreen) screens. |
| `forms.jsx` | Contains the **New Product** sheet (`NewProductSheet`) + shared field components (`Field`, `SelectField`, `ContextChip`). |
| `icons.jsx` | Lucide-style icon set — copy `d=` strings directly into `react-native-svg`. |
| `app.jsx` | Shell with phone frame, bottom nav, FAB, modal routing — reference for nav architecture. |
| `logo.jsx`, `login.jsx`, `tweaks-panel.jsx` | Out of scope — included only because they're referenced by `app.jsx`. |
| `README.md` | This file. |

---

## Suggested Implementation Order

1. **Tokens + fonts** — `theme.ts`, load fonts via `expo-font`.
2. **Shared atoms** — `<Field>`, `<SelectField>`, `<Chip>`, `<Pill>`, `<Money>`, `<IconButton>`, `<SectionLabel>`, `<ContextChip>`, `<Sparkbars>`.
3. **Inventory screen** — easiest, validates the design system.
4. **New Sale modal** — focus on the compact branch popover and the new no-initial product cards.
5. **New Product sheet** — focus on floating-label form fields and the live margin preview.

Light haptics on every primary action; respect safe-area insets top + bottom on both platforms.
