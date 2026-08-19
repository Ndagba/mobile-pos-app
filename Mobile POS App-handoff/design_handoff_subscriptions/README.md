# Handoff: Manage Subscriptions + Create Subscription

## Overview

A modern JayPOS-style redesign of two related admin screens:

1. **Manage Subscriptions** — list of all paid stores with status filters, MRR summary, and per-store actions (Renew / Deactivate / Reactivate / Collect payment / Remind)
2. **Create Subscription** — bottom sheet form for manually provisioning a paid plan for a store (used by ops/admin for offline payments, special deals)

These replace the existing blue-header screens. The new design follows the same visual vocabulary as the rest of the JayPOS app — warm off-white canvas, indigo accent gradient, JetBrains Mono for IDs & money, status pills with leading dots, and grouped cards with internal dividers.

## About the Design Files

The files in this bundle are **design references created in HTML/React (DOM)** — interactive prototypes showing intended look, layout, motion, and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs inside the existing React Native + Expo codebase**, using the navigation, theming, and component conventions already established there.

To explore the prototype:
1. Open `Mobile POS.html` in a browser.
2. Tap "Sign in" on the JayPOS login screen.
3. Tap the **Settings** tab in the bottom nav.
4. Scroll to find the **ADMIN** section → tap **Manage subscriptions**.
5. From the Subscriptions screen, tap the **+ Create** button in the top-right.

> Other screens in the prototype (Dashboard, Inventory, Analytics, Settings, Customers, New Sale, Transactions, Receipt, New Product, Login) are present for context but **are not in scope** for this handoff.

## Fidelity

**High-fidelity.** Exact colors, type scale, spacing, radii, and interactions are specified below. Match them as closely as React Native primitives allow.

---

## Target Stack — React Native + Expo

| Need | Library |
|---|---|
| Screen routing | `@react-navigation/native` — Subscriptions as a modal/stack screen reachable from Settings |
| Bottom sheet (Create Subscription) | `@gorhom/bottom-sheet` (recommended) **or** `<Modal animationType="slide" transparent>` |
| SVG icons | `react-native-svg` (paths in `icons.jsx`), or swap to `lucide-react-native` |
| Gradients | `expo-linear-gradient` |
| Custom fonts | `expo-font` + `@expo-google-fonts/plus-jakarta-sans` + `@expo-google-fonts/jetbrains-mono` |
| Animation | `react-native-reanimated` v3 |
| Haptics | `expo-haptics` (`impactAsync('light')` on row tap, filter change, create) |
| Safe area | `react-native-safe-area-context` |

---

## Design Tokens (matches the rest of JayPOS)

### Color — Light theme

```js
const LIGHT = {
  bg:     '#F4F1EA', // warm off-white app canvas
  card:   '#FFFFFF',
  ink:    '#0E0E10',
  muted:  '#71717A',
  border: 'rgba(14,14,16,0.07)',
};
```

### Accent (Indigo)

```
accent[0]: #6E56F7   (gradient start)
accent[1]: #3D2EC4   (gradient end)
accent-fg: #FFFFFF
```

### Plan tones

```
Business → Indigo  #6E56F7
Pro      → Amber   #F59E0B
```

These tones drive the plan pill color, the plan-option card border/glow when selected, and the gradient on the summary card.

### Status colors

```
ACTIVE    text #0F8A5B  bg rgba(16,185,129,0.14)   dot #10B981
EXPIRED   text #71717A  bg rgba(0,0,0,0.06)        dot #9090A0
PAST DUE  text #E11D6B  bg rgba(225,29,107,0.12)   dot #FB7185
```

### Spacing & radii

- Horizontal screen padding: **20**
- Card padding: **14–18**
- Card-to-card vertical gap: **10**
- Radii: pills `999`, plan-card `16`, status pill `999`, action buttons `12`, card `18`, sheet top corners `24`

### Typography

```
UI:       "Plus Jakarta Sans" (400/500/600/700/800)
Numeric:  "JetBrains Mono"    (400/500/600/700/800) — tabular figures
```

Always set `fontVariant: ['tabular-nums']` on monospace.

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Screen title ("Subscriptions") | Plus Jakarta Sans | 22 | 800 | -0.02em |
| Sheet title ("Create Subscription") | Plus Jakarta Sans | 20 | 800 | -0.02em |
| Hero amount (MRR) | JetBrains Mono | 30 | 700 | -0.02em |
| Summary card total | JetBrains Mono | 26 | 800 | -0.02em |
| Plan price (in plan card) | JetBrains Mono | 16 | 800 | 0 |
| Store name | Plus Jakarta Sans | 15 | 800 | -0.01em |
| Store ID | JetBrains Mono | 11 | 600 | 0 |
| Plan badge / Status pill | Plus Jakarta Sans | 9-10 | 800 | +0.06em UPPERCASE |
| Plan amount (₦/mo) | JetBrains Mono | 12 | 700 | 0 muted |
| Meta label (Plan / Expires) | Plus Jakarta Sans | 12 | 600 | 0 muted |
| Meta value | Plus Jakarta Sans | 13 | 700 | 0 |
| Action button label | Plus Jakarta Sans | 13 | 700 | 0 |
| Section eyebrow | Plus Jakarta Sans | 10 | 700 | +0.10–0.12em UPPERCASE muted |

Currency: `₦` prefix at **55% opacity**, number bold in JetBrains Mono.

---

## SCREEN 1 — Manage Subscriptions

**Purpose:** Browse, filter, and act on all subscriptions across all stores.

Entry point: **Settings → ADMIN section → "Manage subscriptions"** row (purple receipt icon + label + sub + chevron-right).

Presented as a full-screen modal/stack screen that slides up over Settings.

### Layout (top → bottom)

1. **Header bar** (`padding: 14/20/14`, card bg)
   - **Back button** (40×40 icon button, card bg, 1px border, 14px radius) — left arrow icon, dismisses the modal
   - **Title block** (`flex: 1`):
     - "Subscriptions" — 22 / 800 / -0.02em / lineHeight 1.1
     - "7 records" — 12 / muted, the count digit in JetBrains Mono / 700
   - **+ Create button** — gradient pill, `padding 10/14`, 14px radius
     - bg: `linear-gradient(135deg, accent[0], accent[1])`
     - color: white, font 13/700
     - leading plus icon (16px, strokeWidth 2.4) + label "Create"
     - shadow: `0 10px 22px -8px accent[0]` at 70% alpha

2. **MRR hero card** (padding `8/20/14`, parent card bg)
   - Inside: 18px radius, `linear-gradient(135deg, accent[0], accent[1])`, accent-fg text, 16/18 padding, relative + overflow hidden
   - Decorative 140×140 white-alpha circle at `top: -30, right: -30` (`rgba(255,255,255,0.08)`)
   - Content (relative z-index above the orb):
     - Eyebrow "MONTHLY RECURRING REVENUE" — 10/700/+0.10em/uppercase, opacity 0.85
     - Big mono amount — `₦125,000` (₦ at 0.7 opacity), 30/700/-0.02em
     - Stats row (12px top margin, gap 16): **Active**, **Past due**, **Expired** — each: label (10/0.8 opacity/600/+0.02em) + mono 18/800 count

   The MRR equals the sum of `amt` across all **active** subscriptions. The 3 stats show counts (not money) of subscriptions in each status bucket.

3. **Search input** (padding `6/20/8`, card bg)
   - Soft-tinted container: `rgba(0,0,0,0.04)` bg, 1px border, 14px radius, padding `10/14`
   - Search icon left (18px muted) + input "Search by store name or ID…"
   - Filter logic: case-insensitive substring match on `store` or `storeId`

4. **Filter chips row** (padding `4/20/12`, card bg, 1px bottom border)
   - Horizontal scroll, no scrollbar, 8px gap
   - Chips: **All**, **Active**, **Expired**, **Past due** — each with a mono count appended (`Active 4` where "4" is in JetBrains Mono at 60% opacity)
   - Chip anatomy (reuse existing `<Chip>` atom): 999 radius, padding `8/14`, 13/600
   - Active = accent fill + white text. Inactive = white card bg + 1px muted border + ink text.
   - Single-select. Default = "All".

5. **List** (flex 1, scrollable, padding `14/20/40`, gap 10 between cards)

   **Subscription card anatomy** (background card, 18px radius, 1px border, overflow hidden):

   - **Top section** (padding `14/16/12`) — flex row, gap 12:
     - **Plan icon tile** — 44×44, 14px radius, flex-shrink 0
       - Business: `linear-gradient(135deg, rgba(110,86,247,0.12), rgba(110,86,247,0.04))`, indigo store icon
       - Pro: `linear-gradient(135deg, rgba(245,158,11,0.13), rgba(245,158,11,0.04))`, amber store icon
     - **Middle text column** (flex 1):
       - Store name (15/800/-0.01em, lineHeight 1.2) — e.g. "Elephant House Store"
       - Store ID (JetBrains Mono, 11/600/muted, 3px top margin) — e.g. "store_002"
     - **Status pill** (top-right):
       - inline-flex with leading 5×5 dot, label, padding `4/9`, 999 radius
       - 10/800/+0.06em/uppercase, status colors above

   - **Meta panel** (background `rgba(0,0,0,0.025)`, 1px top + bottom border, padding `0/16`)
     - Two rows separated by 1px border, each `padding 11/0`, flex space-between, align center:
       - **Plan** | `<BUSINESS or PRO pill>` + `₦25,000/mo` (mono 12/700/muted)
         - Plan pill: 9/800, padding `2/7`, 999 radius, color `#B45309` on `rgba(245,158,11,0.12)` for Pro, accent on `rgba(110,86,247,0.10)` for Business
       - **Expires** | `22 Jun 2026` (mono 13/700) + status-aware badge:
         - Active + ≤14 days remaining: `31 days` in amber pill (`#B45309` on `rgba(245,158,11,0.12)`)
         - Active + >14 days: `31 days` in subdued pill (muted on `rgba(0,0,0,0.04)`)
         - Past due: `10 days overdue` in rose pill (`#E11D6B` on `rgba(225,29,107,0.12)`)
         - Expired: no badge (or hide entirely)

   - **Actions row** (padding `12/16`, gap 10, flex row)
     - Buttons are flex-1, 12px radius, 11/12 padding, 13/700, optional leading icon (14px)
     - **Active subscription:**
       - Ghost: `Renew` (refund icon) — transparent + muted border + ink
       - Danger: `Deactivate` — transparent + rose-30% border + rose text
     - **Past due:**
       - Primary: `Collect payment` — accent fill + white
       - Ghost: `Remind` (bell icon)
     - **Expired:**
       - Primary: `Reactivate` (refund icon)
       - Ghost: `View history`

6. **Empty state** (shown when filtered list is empty)
   - Centered block, padding `60/40`, muted color
   - 56×56 icon tile (radius 18, `rgba(0,0,0,0.04)`), receipt icon at 26px
   - "No subscriptions" — 14/700/ink
   - "Try a different filter or search." — 12/muted, 4px top margin

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Back button | Tap | Pop modal. |
| + Create button | Tap | Open Create Subscription bottom sheet. Light haptic. |
| Search input | Type | Filter list in real time. Match `store` (case-insensitive) or `storeId`. |
| Filter chip | Tap | Single-select status filter. Re-filter list. Light haptic. |
| Renew | Tap | Open renewal confirmation → on confirm, extend expiry. |
| Deactivate | Tap | Open destructive confirmation alert → on confirm, set status = expired, recalc MRR. |
| Collect payment | Tap | Navigate to collection flow (out of scope; placeholder route). |
| Remind | Tap | Send a reminder (SMS/email) — toast "Reminder sent to {store}". |
| Reactivate | Tap | Open Create Subscription pre-populated with the store ID and plan. |
| Card body (between top section and actions) | Tap (optional) | Open store detail page (out of scope). |

---

## SCREEN 2 — Create Subscription (Bottom Sheet)

**Purpose:** Manually provision a paid plan for a store (used by ops for offline payments, special deals).

Bottom sheet, **up to 92% of screen height**, slides up over the Subscriptions list with backdrop dimming the parent.

### Container

```
position: bottom-anchored
left/right: 0
background: var(--bg)
borderRadius: 24/24/0/0
padding: 14/0/0   (horizontal padding handled by inner sections)
maxHeight: 92%
display: flex, flex-direction: column
boxShadow: 0 -20px 60px -10px rgba(0,0,0,0.25)
```

Backdrop: `rgba(14,14,16,0.55)`, 25% fade-in. Tap to dismiss.

### Layout (top → bottom)

1. **Grabber handle** (centered, 12px bottom margin)
   - 36×4, 2px radius, `var(--border)` color

2. **Header** (padding `0/20/16`, 1px bottom border)
   - Title block (flex 1):
     - "Create Subscription" — 20/800/-0.02em
     - "Manually provision a paid plan for a store" — 12/muted, 3px top margin
   - Close button (32×32 circle):
     - `rgba(0,0,0,0.06)` bg, no border, ink color
     - X icon at 16px, strokeWidth 2.2

3. **Body** (flex 1, scrollable, padding `18/20/20`)

   1. **Store ID field** (floating-label input)
      - Required (`*` in rose `#E11D6B` after label)
      - Placeholder appears only when focused: `e.g. store_014`

   2. **Plan section** (18px top margin)
      - Eyebrow "PLAN" — 10/700/+0.12em/uppercase/muted, 10px bottom margin
      - 2-column grid (gap 10), each option is a **Plan card**:
        - Container: 16px radius, padding `14/14`, 1.5px border, card bg
        - **Inactive:** 1.5px `var(--border)` border, card bg
        - **Active:** 1.5px border in plan tone color, `linear-gradient(135deg, tone+'14', tone+'06')` background
        - **Check badge** (top-right, only when active): 18×18 circle, filled with plan tone, white check icon (11px, strokeWidth 3) — absolute `top: 10, right: 10`
        - Content:
          - Name (14/800) — "Business" / "Pro"
          - Price — JetBrains Mono 16/800, in plan tone color: "₦25,000" / "₦75,000"
          - Sub "per month" — 10/muted, 1px top margin
          - 1px dashed border-top, 8px top padding & margin
          - Features list (8px top margin, gap 4) — each: 11/muted, leading 11px tone-colored check icon (strokeWidth 2.4)
            - Business: "3 branches", "Standard support"
            - Pro: "Unlimited branches", "Priority support"

   3. **Duration section** (18px top margin)
      - Eyebrow "DURATION" — same style
      - 4-button row (gap 8), each pill: flex 1, padding `12/4`, 12px radius
        - Stacked content: big number (JetBrains Mono 15/800) + small word ("month" / "months", 10/0.75 opacity)
        - Options: **1**, **3**, **6**, **12**
        - Active = accent fill + white. Inactive = card bg + 1px muted border + ink.

   4. **Reason field** (14px top margin)
      - Multiline floating-label textarea, 3 rows
      - Label: "Reason (optional)"
      - Placeholder (focus only): "e.g. offline payment, special deal"

   5. **Summary card** (18px top margin)
      - 14px radius, 1px border in plan tone at 30% alpha
      - Background: `linear-gradient(135deg, tone+'10', tone+'04')`
      - Padding 14
      - Eyebrow "TOTAL TO PROVISION" — 10/700/+0.10em/uppercase, in plan tone color
      - Row below (4px top margin), space-between baseline:
        - Big total: JetBrains Mono 26/800/-0.02em, `₦` at 0.55 opacity (e.g. `₦75,000`)
        - Right caption: mono 11/muted: "Business × 1 mo" / "Pro × 12 mos"
      - Total = `plan.price × duration` (computed live)

4. **Footer** (sticky bottom, card bg, 1px top border, padding `14/20/22`, gap 10)
   - **Cancel** (flex 1) — transparent bg, 1px muted border, ink text, 14/700, 14px radius, 14px vertical padding
   - **Create subscription** (flex 1.8) — gradient `accent[0] → accent[1]`, white text, leading check icon (16px)
     - Disabled until Store ID is filled. Disabled = muted bg, muted text, no shadow.
     - Shadow when enabled: `0 12px 24px -8px accent[0]` at 70% alpha

### Behavior

| Where | Interaction | Detail |
|---|---|---|
| Plan card | Tap | Set `plan`. Recompute summary total. Re-tint summary card. |
| Duration pill | Tap | Set `duration`. Recompute summary total. |
| Cancel | Tap | If form is dirty, confirm. Else dismiss. |
| Create subscription | Tap | Submit. Show success toast "Provisioned {Plan} for {storeId}". Close sheet. Subscriptions list refreshes with the new card prepended. |
| Backdrop tap / Close button | Tap | Dismiss with confirmation if dirty. |
| Swipe down on handle | Drag past threshold | Dismiss (Gorhom handles this natively). |

---

## Data Shape

```ts
type Subscription = {
  id: string;
  store: string;          // "Elephant House Store"
  storeId: string;        // "store_002"
  plan: 'Business' | 'Pro';
  status: 'active' | 'expired' | 'past_due';
  expires: string;        // pre-formatted: "22 Jun 2026"
  daysLeft: number;       // positive = days remaining; negative = days overdue
  amt: number;            // 25000 or 75000 — used for MRR calculation
};

// Helpers
const PLANS = {
  Business: { tone: '#6E56F7', price: 25000, features: ['3 branches', 'Standard support']     },
  Pro:      { tone: '#F59E0B', price: 75000, features: ['Unlimited branches', 'Priority support'] },
};

// Derived (Subscriptions screen):
const counts = {
  all:      subs.length,
  active:   subs.filter(s => s.status === 'active').length,
  expired:  subs.filter(s => s.status === 'expired').length,
  past_due: subs.filter(s => s.status === 'past_due').length,
};
const mrr = subs.filter(s => s.status === 'active').reduce((a, s) => a + s.amt, 0);
```

Format `expires` server-side (e.g. via `date-fns format(date, 'd MMM yyyy')`). Compute `daysLeft` on the client: `differenceInCalendarDays(expires, today)`.

---

## Wiring (Settings entry point)

Add a new section card to the Settings screen, **between Preferences and the Log out button**:

```jsx
<SectionHeader label="Admin" />
<Card pad={4}>
  <SettingsRow
    icon={<Icons.receipt />}
    iconTone={accent}            // indigo
    label="Manage subscriptions"
    sub="Plans, billing & expirations across all stores"
    onPress={navigateToSubscriptions}
  />
</Card>
```

The row uses the same pattern as other Settings list rows: 36×36 tinted icon tile + label + sub + right chevron.

---

## Component Inventory

Build (or reuse from existing app) the following:

- **`<SubscriptionsScreen>`** — list page
- **`<SubscriptionsHero>`** — MRR gradient card with 3 inline stats
- **`<FilterChipGroup>`** — horizontal scroll of filter chips with counts (reuse the existing `<Chip>` atom)
- **`<SubCard subscription onAction>`** — the per-store card with header, meta panel, and actions row
- **`<StatusPill status>`** — Active / Expired / Past due pill with leading dot
- **`<PlanBadge plan>`** — small BUSINESS / PRO uppercase pill
- **`<CreateSubscriptionSheet onSubmit onClose>`** — bottom sheet
- **`<PlanOption active plan onPress>`** — selectable plan card with check badge
- **`<DurationPicker value onChange>`** — 4-button segmented control
- **`<SummaryCard plan duration>`** — gradient total preview
- **`<Field>`** — reuse existing floating-label input from the New Product / Customer forms
- **`<Money n />`** — reuse existing currency formatter

---

## Animations

| Element | Spec |
|---|---|
| Subscriptions modal slide-up | 300ms `cubic-bezier(0.16, 1, 0.3, 1)`, `translateY(100% → 0)`, opacity 0.85 → 1 |
| Create sheet slide-up | Same |
| Backdrop fade | 250ms ease |
| Chip / plan / duration selection | 150ms color crossfade on bg + fg + border |
| Plan card border + bg crossfade | 150ms ease |
| Create button press | 100ms scale to 0.96 + medium haptic on submit |
| Status pill on action (e.g. Deactivate) | Crossfade 200ms to new status |

---

## State

### Subscriptions screen
```ts
filter: 'all' | 'active' | 'expired' | 'past_due'   // default 'all'
query:  string                                       // search input
createOpen: boolean                                  // open the create sheet
```

### Create Subscription sheet
```ts
storeId:  string
plan:     'Business' | 'Pro'   // default 'Business'
duration: '1' | '3' | '6' | '12'   // default '1'
reason:   string

// Derived:
const planMeta = PLANS[plan];
const total = planMeta.price * parseInt(duration);
const valid = storeId.trim().length > 0;
```

---

## Files in this bundle

| File | What |
|---|---|
| `Mobile POS.html` | Open in a browser to interact with the prototype. |
| `subscriptions.jsx` | **Primary source.** `SubscriptionsScreen` + `SubCard` + `CreateSubscriptionSheet` + `PlanOption` + fixture data + `STATUS_META` map. |
| `screens2.jsx` | Settings screen — see the "Admin" section near the end for the entry-point wiring. |
| `app.jsx` | Shell with theme tokens + how Subscriptions is mounted as a modal — reference for nav routing. |
| `icons.jsx` | Lucide-style icons used here: `receipt`, `store`, `plus`, `search`, `close`, `refund`, `bell`, `chevronRight`, `check`. |
| `forms.jsx`, `screens.jsx`, `transactions.jsx`, `customers.jsx`, `login.jsx`, `logo.jsx`, `tweaks-panel.jsx` | Out of scope — included only because `Mobile POS.html` references them. |
| `README.md` | This file. |

---

## Suggested Implementation Order

1. **Add the "Admin → Manage subscriptions" row** to the existing Settings screen.
2. **Build the Subscriptions list page** with a fixture array of `Subscription` objects. Get the hero, search, filter chips, and one card variant rendering before doing the data fetch.
3. **Add the status variants** (active / past_due / expired) and their action rows. Test all 3.
4. **Build the Create Subscription sheet** with the plan options + duration picker + live summary calc. Wire to a no-op submit handler first.
5. **Connect to the real data source** — replace the fixture with whatever store/query you have.
6. **Wire actions** to the existing subscription API (Renew, Deactivate, Reactivate, Collect, Remind, Create).

Light haptics on every primary action; respect safe-area insets at top + bottom on both platforms.
