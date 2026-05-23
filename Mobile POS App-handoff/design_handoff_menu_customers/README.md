# Handoff: Bottom Navigation + Customers

## Overview

Two related changes in the JayPOS app:

1. **Bottom navigation redesign** — adding a 5th tab ("Customers") to a bar that previously held 4. Uses an **active-label-only** pattern so we don't run out of horizontal room.
2. **Customers screen** — a new screen reachable from the new tab, plus a customer detail bottom sheet.

The motivation: the previous "Customers" tab was wrapping to two lines ("Custom-ers") because every tab tried to show its label at once. The new pattern shows the label **only on the active tab** (which expands to fit), keeps inactive tabs **icon-only** (compact), and preserves the center FAB.

## About the Design Files

The files in this bundle are **design references created in HTML/React (DOM)** — interactive prototypes showing intended look, layout, motion, and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs inside the existing React Native + Expo codebase**, using the navigation, theming, and component conventions already established there.

To explore the prototype:
1. Open `Mobile POS.html` in a browser.
2. Tap "Sign in".
3. Cycle through every bottom-nav tab — observe the active label expanding and the inactive tabs collapsing to icon-only.
4. Tap **Customers** → review the new Directory screen.
5. Tap any customer row → review the detail bottom sheet.

> All other screens (Dashboard, Inventory, Analytics, Settings, New Sale, Transactions, Receipt, New Product, Login) are present in the prototype for context but **are not in scope** for this handoff.

## Fidelity

**High-fidelity.** Exact colors, type scale, spacing, radii, and interactions are specified below. Match them as closely as React Native primitives allow.

---

## Target Stack — React Native + Expo

| Need | Library |
|---|---|
| Tab navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` with a **custom `tabBar` component** (we override the default to render this pill + FAB layout) |
| Bottom sheet (customer detail) | `@gorhom/bottom-sheet` **or** `<Modal animationType="slide">` with a 24px top-radius container |
| SVG icons | `react-native-svg` (paths in `icons.jsx`), or swap to `lucide-react-native` |
| Gradients | `expo-linear-gradient` |
| Custom fonts | `expo-font` + `@expo-google-fonts/plus-jakarta-sans` + `@expo-google-fonts/jetbrains-mono` |
| Animation | `react-native-reanimated` v3 — `Layout.springify()` on the active button is the easiest way to get the smooth expand effect |
| Haptics | `expo-haptics` (`impactAsync('light')` on tab change and FAB press) |
| Blur (optional) | `expo-blur` for the nav-bar background |
| Safe area | `react-native-safe-area-context` |

---

## Design Tokens

### Color — Light theme

```js
const LIGHT = {
  bg:     '#F4F1EA',
  card:   '#FFFFFF',
  ink:    '#0E0E10',
  muted:  '#71717A',
  border: 'rgba(14,14,16,0.07)',
  chrome: '#FFFFFF',  // bottom-nav surface (slightly elevated over bg)
};
```

### Accent (Indigo, default)

```
accent[0]: #6E56F7   (start)
accent[1]: #3D2EC4   (end)
accent-fg: #FFFFFF
```

### Customer tone colors (varied for visual rhythm in the contact list)

```
#6E56F7  indigo
#10B981  emerald
#FB7185  rose
#F59E0B  amber
#1A1A22  ink
```

Each contact's tone seeds their avatar (letter on `tone + '20'` bg, `tone` text) and the gradient hero color in their detail sheet.

### Semantic tags

```
VIP   text #B45309 on rgba(245,158,11,0.16)
NEW   text #0F8A5B on rgba(16,185,129,0.14)
```

### Spacing & radii

- Bottom-nav: anchored `bottom: 18`, `left/right: 12`, padding `6/6` outer, gap `2` between tabs, radius `28` outer, radius `18` inner-pill (active state)
- Center FAB: 54×54, radius 20
- Customer rows: padding `10/10`, 1px bottom border within card
- Hero card: padding `18/18`, radius 20

### Typography

```
UI:       "Plus Jakarta Sans" (400/500/600/700/800)
Numeric:  "JetBrains Mono"    (400/500/600/700/800)  — tabular figures
```

`fontVariant: ['tabular-nums']` on every monospace numeric.

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Active tab label | Plus Jakarta Sans | 12 | 700 | -0.01em |
| FAB "NEW SALE" caption | Plus Jakarta Sans | 9 | 800 | +0.06em UPPERCASE |
| Screen title ("Directory") | Plus Jakarta Sans | 26 | 800 | -0.02em |
| Eyebrow ("Customers") | Plus Jakarta Sans | 13 | 500 | 0 muted |
| Hero contact count | JetBrains Mono | 32 | 700 | -0.02em |
| Hero sub-stat number | JetBrains Mono | 16 | 800 | 0 |
| Group letter heading | Plus Jakarta Sans | 10 | 800 | +0.12em |
| Customer name | Plus Jakarta Sans | 14 | 700 | 0 |
| Phone | JetBrains Mono | 11 | 500 | 0 muted |
| Spend | JetBrains Mono | 13 | 800 | 0 |
| Meta (txns · last) | Plus Jakarta Sans | 10 | 500 | 0 muted |
| Detail sheet name | Plus Jakarta Sans | 18 | 800 | -0.01em |
| VIP / NEW pill | Plus Jakarta Sans | 9 | 800 | +0.06em UPPERCASE |

Currency: `₦` prefix at 55% opacity, number bold in JetBrains Mono.

---

## PART 1 — Bottom Navigation

### Layout structure

```
+──────────────────────────────────────────────────────────+
│ [ICON] [ICON]    [FAB ▼ NEW SALE]    [● Customers] [ICON] [ICON] │
+──────────────────────────────────────────────────────────+
   Home   Inventory                       Customers     Analytics  Settings
                                           (active)
```

- 5 tabs total: **Home · Inventory · Customers · Analytics · Settings**
- Center **FAB** sits between Inventory and Customers (between index 1 and index 2)
- Tabs are split **2 / FAB / 3**

### Outer container

```
position: absolute
bottom: 18
left: 12
right: 12
zIndex: 30
```

The bar itself:

```
background: var(--chrome)
borderRadius: 28
padding: 6/6
boxShadow: 0 20px 50px -10px rgba(14,14,16,0.18),
           inset 0 1px 0 rgba(255,255,255,0.4)
border: 1px solid var(--border)
display: flex
align-items: center
gap: 2
backdropFilter: blur(12px)
```

### Center FAB slot (between left-2 and right-3)

Reserve a **64px-wide fixed column** in the flex row for the FAB so it doesn't squeeze the tabs:

```
width: 64
flex-shrink: 0
display: flex
justify-content: center
```

Inside, the FAB itself:

- 54×54, radius 20
- `linear-gradient(135deg, accent[0], accent[1])`
- White cart icon (22px, strokeWidth 2.2)
- `transform: translateY(-14px)` — lifts above the bar
- Shadow: `0 10px 30px -5px color-mix(in oklab, var(--accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)` — in RN, approximate with `shadowColor: accent[0]`, `shadowOpacity: 0.6`, `shadowRadius: 30`, `shadowOffset: { width: 0, height: 10 }`, `elevation: 14`.
- Below the FAB, absolute-positioned caption "NEW SALE" (`bottom: -20`, 9/800/+0.06em, ink color)

### NavBtn (each of the 5 tabs)

The critical piece. Anatomy of a single tab button:

```jsx
<button style={{
  // Active expands to fit its label; inactive stays icon-sized.
  flex: active ? 2.6 : 1,
  minWidth: 0,
  padding: active ? '9/12' : '10/4',
  borderRadius: 18,
  background: active ? 'rgba(110,86,247,0.10)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--muted)',
  display: 'flex',
  align-items: center,
  justify-content: center,
  gap: 6,

  // IMPORTANT: only animate `color`. Do NOT animate `flex`, `flex-grow`,
  // or `background-color` — flex animation gets stuck mid-interpolation
  // in some browsers/engines and the layout never settles.
  transition: 'color 0.18s ease',
}}>
  <Icon size={active ? 20 : 22} strokeWidth={active ? 2.2 : 1.8} />
  {active && <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
    {label}
  </span>}
</button>
```

**Key behaviors:**

- **Active tab label uses `flex: 2.6`**, inactive uses `flex: 1`. With 5 tabs that math works out to ~36% of the available row width for the active tab — enough to fit any of "Home", "Inventory", "Customers", "Analytics", "Settings" without truncation.
- **Inactive tabs render NO label element at all** (not just `display:none` — actually omit the span). Saves layout space.
- **Indigo pill background** only on the active tab — `rgba(110,86,247,0.10)`, 18px radius. This pill grows with the button width.
- **Icon shrinks slightly when active** (22 → 20) so the icon + label combo doesn't feel chunky.

### React Native implementation notes

- The browser version uses `transition: color 0.18s ease`. In React Native, use Reanimated's `Layout.springify().damping(20)` on each NavBtn to get the smooth width expansion when active changes. Animate color via `useDerivedValue` + `interpolateColor`.
- **Do not animate `flex` directly in RN either.** Reanimated's layout transitions snap final layout values and animate the interpolation — that's what you want.
- The active-pill background can use `react-native-reanimated`'s `withTiming` on `backgroundColor`.
- Drop `backdropFilter` — RN doesn't support it. Either skip the blur, or wrap the bar in `<BlurView intensity={30} tint="light">` from `expo-blur`.

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Tab tap | Tap | Switch active tab. Light haptic. Active pill animates to the new tab; previous active collapses to icon-only. |
| FAB tap | Tap | Open the New Sale modal (existing behavior — out of scope here). Medium haptic. |
| Long-press tab | (optional) | Show contextual sheet (e.g. "Quick scan" from the FAB long-press). Not required for v1. |
| Safe-area bottom | — | The bar's `bottom: 18` should become `bottom: 18 + insets.bottom` so it sits above the home indicator / gesture nav. |

### Animations

| Element | Spec |
|---|---|
| Tab active change | Width: spring damping ~20, stiffness ~180. Color: 180ms ease. |
| FAB press | 100ms scale to 0.94, snap back. |

---

## PART 2 — Customers Screen

### Layout (top → bottom)

1. **Header** (`paddingHorizontal: 20`, `paddingTop: 8`)
   - Left:
     - Eyebrow "Customers" — 13/muted/500
     - Title "Directory" — 26/800/-0.02em
   - Right: 40×40 icon button with search icon (card bg, 1px border, 14px radius)

2. **Hero summary card** (padding `0/20`)
   - 20px radius, `linear-gradient(135deg, accent[0], accent[1])`, accent-fg text, 18px padding, decorative 140×140 white-alpha circle at `top: -30, right: -30`
   - Content (`position: relative`):
     - Eyebrow "ALL CUSTOMERS" — 10/700/+0.10em/uppercase, opacity 0.8
     - **Big count** — JetBrains Mono 32/700, then "contacts" (12/0.85 opacity) on the baseline
     - Stats row (14px top margin, gap 18, with **thin white-alpha vertical dividers** between):
       - **VIP**: small label (10/0.75 opacity) + mono 16/800 count
       - **Active 30d**: same anatomy
       - **Lifetime**: same anatomy, value shown as `₦{total/1000}K`
     - Vertical dividers: 1px wide, white at 18% alpha, `alignSelf: stretch`

3. **Search input** (padding `14/20/8`)
   - Card bg, 14px radius, 1px border, padding `10/14`
   - Search icon left + input "Search by name or phone"

4. **Filter chips** (padding `4/20/10`, horizontal scroll, gap 8)
   - **All** + count
   - **⭐ VIP** + count
   - **New** + count
   - Each chip: 999 radius, padding `8/14`, 13/600. Active = accent fill + accent-fg. Inactive = card bg + 1px muted border + ink. Counts render in JetBrains Mono at 60% opacity inline after the label.

5. **Alphabetical groups** (padding `0/20`)
   - For each letter present (A, B, C, …):
     - **Letter heading** — 10/800/+0.12em muted, padding `0/6/8`
     - **Card** wrapper — card bg, 1px border, 16px radius, padding 4
     - Inside the card: one row per customer

   **Row anatomy** (button, `padding: 10/10`, 1px bottom border within group except the last):
   - 40×40 **letter avatar** (`tone + '20'` bg, `tone` text, 700)
   - Middle column (flex 1, min-width 0):
     - Row 1: name (14/700) + optional VIP or NEW pill
     - Row 2: phone (JetBrains Mono 11/500/muted, 2px top margin)
   - Right column (text-align: right):
     - Lifetime spend (JetBrains Mono 13/800, `₦` at 0.55 opacity)
     - Meta (10/500/muted, 2px top margin): `{txns} txns · {last}`

6. **FAB** (`position: absolute`, `bottom: 102`, `right: 20`)
   - Ink-filled pill, padding `14/18`, 999 radius
   - bg-color text, 13/700
   - Icon-left: plus icon (18px), label "New customer"
   - Shadow `0 12px 30px rgba(0,0,0,0.2)`

7. **Empty state** (when no rows match the filter or search)
   - Centered, padding `40/20`
   - 14/700/ink "No matches"
   - 12/muted "Try a different search or filter."

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Search input | Type | Filter list in real time — match `name` (case-insensitive) or `phone` (raw substring match). |
| Filter chip | Tap | Single-select between All / VIP / New. Updates counts and list. |
| Row tap | Tap | Open the **Customer detail bottom sheet** (Part 3). Light haptic. |
| FAB | Tap | Open a New Customer form sheet (out of scope here; follow the same pattern as New Product). |

---

## PART 3 — Customer Detail Bottom Sheet

Slides up from the bottom over a darkened backdrop.

### Container

```
position: bottom-anchored
left/right: 0
background: var(--bg)
borderRadius: 24/24/0/0
padding: 14/20/24
maxHeight: 80%
overflowY: auto
boxShadow: 0 -20px 60px -10px rgba(0,0,0,0.25)
```

Backdrop: `rgba(14,14,16,0.55)`, 25% fade-in.

### Content

1. **Grabber handle** — 36×4, `var(--border)`, 2px radius, centered, 14px bottom margin.

2. **Customer hero card** (radius 20, padding 18)
   - Background: `linear-gradient(135deg, customerTone, customerTone + '88')` — gradient generated from this specific customer's tone color, **not** the app accent. This makes each customer feel distinct.
   - Content (white text):
     - Row 1: large letter avatar (56×56, radius 20, `rgba(255,255,255,0.22)` bg, white text, 2px white-alpha border) + name (18/800/-0.01em) + phone (12/0.9 opacity, mono)
     - Row 2 (16px top margin, space-between):
       - **LIFETIME**: 10/0.8 opacity/+0.08em + mono `₦{spend}` (22/800)
       - **VISITS**: 10/0.8 opacity/+0.08em + mono count (22/800), right-aligned

3. **Quick actions** (14px top margin, 3-column grid, gap 8)
   - Each tile: card bg, 1px border, radius 14, padding `12/8`
   - Stacked: accent-color icon (18px) + label (12/700/ink)
   - Labels: **New sale**, **History**, **Edit**

4. **Close button** (16px top margin, full width)
   - Transparent bg, 1px muted border, radius 14, 12px vertical padding
   - 13/700/ink, "Close"

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Backdrop tap | Tap | Dismiss. |
| Close button | Tap | Dismiss. |
| New sale | Tap | Open the existing New Sale modal pre-populated with this customer. |
| History | Tap | Open Transactions filtered by this customer (if data available). |
| Edit | Tap | Open the Edit Customer form. |

### Animations

- Slide-up: 300ms `cubic-bezier(0.16, 1, 0.3, 1)` (use Gorhom's default snap animations in RN).
- Backdrop: 250ms fade.

---

## Data Shape

```ts
type Customer = {
  id: string;
  name: string;          // Display name "Aisha Bello"
  phone: string;         // Pre-formatted "+234 803 211 0042"
  spend: number;         // Lifetime ₦, integer (display only)
  txns: number;          // Transaction count
  last: string;          // Pre-formatted "Today", "2d ago", "—"
  tag: 'VIP' | 'New' | null;
  tone: string;          // Hex — one of the 5 tone colors above. Pick by id hash or randomly on create.
};
```

Server-side or in a helper, pre-format `phone` (don't try to format inline) and `last` (relative date string). The component treats these as opaque strings.

---

## Wiring

This new tab is the 3rd of 5 in the existing bottom nav. Update the route table:

```ts
const TABS = [
  { key: 'dashboard', label: 'Home',      icon: 'dashboard' },
  { key: 'inventory', label: 'Inventory', icon: 'box'       },
  { key: 'customers', label: 'Customers', icon: 'users'     },   // NEW
  { key: 'analytics', label: 'Analytics', icon: 'chart'     },
  { key: 'settings',  label: 'Settings',  icon: 'settings'  },
];
```

The FAB sits **between index 1 (Inventory) and index 2 (Customers)** in the rendered row — i.e., it's not a tab, it's a fixed-width slot between the left-2 and right-3 tabs.

---

## Component Inventory

Build these in `components/nav/` and `screens/customers/`:

- **`<BottomNavBar>`** — the entire bar including the FAB slot. Replaces the default tab bar from `@react-navigation/bottom-tabs` via the `tabBar` prop on `Tab.Navigator`.
- **`<NavBtn active label icon onPress>`** — single tab button with the expand-on-active behavior.
- **`<NavFab onPress>`** — floating gradient cart button with "NEW SALE" caption.
- **`<CustomersScreen>`** — list screen.
- **`<CustomersHero>`** — gradient summary card with stats.
- **`<FilterChipGroup>`** — 3-chip filter row (or reuse the existing `<Chip>` atom).
- **`<CustomerRow customer onPress>`** — row component for the alphabetical list.
- **`<CustomerSheet customer onClose>`** — bottom sheet.
- **`<TagPill kind>`** — small VIP/NEW pill.
- **`<Avatar letter color size />`** — colored letter circle. **Reuse the existing one** from the app — same anatomy is used elsewhere.

---

## State

### Bottom nav
```ts
active: 'dashboard' | 'inventory' | 'customers' | 'analytics' | 'settings'
// Owned by the navigator. Drives both the screen render and the active styling.
```

### Customers screen
```ts
filter: 'all' | 'vip' | 'new'   // single-select chip
query:  string                  // search input
openId: string | null           // open detail-sheet customer id
```

Filter logic (`useMemo`):
```ts
filtered = CUSTOMERS.filter(c => {
  if (filter === 'vip' && c.tag !== 'VIP') return false;
  if (filter === 'new' && c.tag !== 'New') return false;
  if (query && !nameOrPhoneIncludes(c, query)) return false;
  return true;
});

// Group by first letter, sort A–Z:
groups = group(filtered, c => c.name[0].toUpperCase());
```

### Customer detail sheet

Stateless. Pass `{ customer, onClose, onNewSale, onHistory, onEdit }` as props.

---

## Files in this bundle

| File | What |
|---|---|
| `Mobile POS.html` | Open in a browser to interact with the prototype. |
| `customers.jsx` | **Primary source.** `CustomersScreen` + `CustomerRow` + `CustomerSheet` + `Stat` + fixture data. |
| `app.jsx` | **Primary source.** Contains the redesigned `<BottomNav>` + `<NavBtn>` components. The 5-tab `TABS` array is at the top of the nav section. |
| `icons.jsx` | Lucide-style icons. The ones used here: `dashboard`, `box`, `users`, `chart`, `settings`, `cart`, `plus`, `search`, `receipt`, `edit`. |
| `screens.jsx`, `screens2.jsx`, `forms.jsx`, `transactions.jsx`, `logo.jsx`, `login.jsx`, `tweaks-panel.jsx` | Out of scope — included only because `Mobile POS.html` references them. |
| `README.md` | This file. |

---

## Suggested Implementation Order

1. **Update the route table** to insert Customers as the 3rd tab.
2. **Replace the default tab bar** with a custom `tabBar` component. Get the **active-label-expand behavior** working with a placeholder Customers screen (just render the string "Customers"). Verify with all 5 tabs that no label clips.
3. **Build the Customers list** — start with the hero, search, chips, then the alphabetical groups.
4. **Build the Customer detail sheet** — the gradient hero, the 3 quick-action tiles, the close button.
5. **Wire haptics** — light on tab change, light on row tap, medium on FAB.
6. **Connect to the customer data source** — replace the fixture with whatever store/query you have.

### Common pitfall to avoid

> **Do not animate `flex`, `flex-grow`, or `width` on the NavBtn via CSS transitions.** Browsers (and many style engines) get stuck mid-interpolation and the layout never settles on the new value — even after several seconds. Animate only `color` via transition; let layout properties snap. In React Native, Reanimated's `Layout.springify()` is the correct primitive for the smooth expand effect — it doesn't have this problem because it interpolates and commits properly.

This was the bug that delayed shipping this design in the prototype. Reanimated's layout transitions on RN don't share the issue, but if you implement the active-pill background animation, animate it with `withTiming` on `backgroundColor` (a discrete value), not via `flex`-coupled transitions.
