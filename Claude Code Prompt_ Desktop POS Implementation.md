# Claude Code Implementation Prompt: Desktop POS

You are working on an existing production-oriented **JayPOS / MobilePOS** codebase located at:

`C:\Projects\MobilePOS`

Your task is to **study the existing codebase first, then design and implement the Desktop POS application without breaking the existing mobile application or backend**.

The attached architecture document describes the intended direction. Treat it as the architectural target, but **do not assume that every file, service, endpoint, database model, or sync mechanism described in the document already exists exactly as stated**.

Your first responsibility is to inspect and understand the actual codebase.

---

## 1. PRIMARY OBJECTIVE

Build a **Desktop POS application** inside:

`C:\Projects\MobilePOS\desktop`

using:

- Next.js 14+ / App Router
- TypeScript
- React
- Tailwind CSS
- Shadcn/UI where appropriate
- TanStack Query
- Zustand
- Dexie.js / IndexedDB
- PWA capabilities
- Existing Node.js + Express backend
- Existing PostgreSQL/Prisma backend where applicable

The desktop application must:

1. Work online.
2. Continue operating when temporarily offline.
3. Store appropriate offline transactions locally.
4. Synchronize with the existing backend when connectivity returns.
5. Share business logic and types with the mobile application where practical.
6. Support the same backend and authentication model.
7. Support local/on-premise deployment.
8. Support cloud deployment.
9. Support thermal receipt printing.
10. Provide desktop-oriented management functionality beyond the mobile POS.

The architecture document explicitly targets a Next.js PWA rather than Django.

---

# 2. CRITICAL RULE: INSPECT BEFORE MODIFYING

**DO NOT immediately start creating files.**

Before making implementation changes:

### Step 1: Inspect the repository

Study:

- `mobile/`
- `backend/`
- existing package files
- existing TypeScript configuration
- existing Prisma schema
- existing API routes
- authentication implementation
- Redux stores
- API clients
- sync implementation
- offline database implementation
- conflict resolution
- network detection
- transaction models
- inventory models
- product/service models
- customer models
- user/role models
- existing tests
- Docker configuration
- environment configuration
- database configuration

Use repository search aggressively.

Look for files/classes/functions containing terms such as:

- `ApiClient`
- `SyncManager`
- `ConflictResolver`
- `SyncQueue`
- `offline`
- `is_sync_online`
- `offline_session_hash`
- `transaction`
- `inventory`
- `product`
- `customer`
- `supplier`
- `auth`
- `JWT`
- `role`
- `permission`
- `Prisma`
- `SQLite`
- `PostgreSQL`

### Step 2: Build an internal understanding

Before implementation, determine:

1. What already exists?
2. What is reusable?
3. What needs refactoring?
4. What is missing?
5. Which architecture assumptions in the attached document are incorrect or outdated?
6. Which backend endpoints can already support the desktop?
7. Which new backend endpoints are genuinely required?
8. Which database changes are genuinely required?
9. Whether the existing mobile offline/sync architecture can actually be shared.
10. Whether the current project structure should be converted to a monorepo.

**Do not duplicate functionality that already exists.**

---

# 3. DO NOT BREAK THE MOBILE APPLICATION

The existing mobile POS is the source of truth for existing POS business behavior.

The desktop application must not:

- break existing mobile functionality
- silently change mobile API contracts
- change database behavior without understanding downstream effects
- replace working sync logic unnecessarily
- duplicate business rules that can be shared
- introduce incompatible data structures

If a shared abstraction is needed, refactor carefully and update all affected consumers.

After every significant refactor, run the existing mobile and backend tests.

---

# 4. MONOREPO STRATEGY

The intended architecture is to share TypeScript code between:

```text
mobile/
desktop/
backend/
shared/
```

The architecture plan recommends a proper monorepo so that types, API clients, synchronization logic, and utilities can be shared.

The desired direction is:

```text
C:\Projects\MobilePOS
│
├── mobile/
├── desktop/
├── backend/
├── shared/
├── package.json
├── docker-compose.yml
└── ...
```

However:

**Do not perform a large monorepo migration blindly.**

First inspect the current repository.

If the existing project can safely support workspaces, use an appropriate workspace strategy such as:

- pnpm workspaces
- npm workspaces

Choose the simplest solution that preserves the current project.

Do not introduce Turborepo merely because it is available.

---

# 5. SHARED PACKAGE

Create `shared/` only after confirming what can safely be extracted.

Potential structure:

```text
shared/
├── types/
│   ├── models/
│   ├── api/
│   └── enums/
│
├── utils/
│   ├── formatters/
│   ├── validators/
│   └── calculations/
│
├── services/
│   ├── api/
│   └── sync/
│
└── package.json
```

Potential shared functionality:

- TypeScript interfaces
- API types
- enums
- validation
- currency/number formatting
- tax calculations
- API client
- sync queue
- sync manager
- conflict resolver
- retry handling

Only extract code that is genuinely shared.

Do not copy files into `shared/` just to satisfy the architecture document.

---

# 6. DESKTOP APPLICATION

Create:

```text
desktop/
```

Use Next.js App Router.

Preferred structure:

```text
desktop/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx
│   │   │   ├── pos/
│   │   │   ├── inventory/
│   │   │   ├── analytics/
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── employees/
│   │   │   └── settings/
│   │   │
│   │   └── ...
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── pos/
│   │   ├── inventory/
│   │   ├── analytics/
│   │   ├── customers/
│   │   ├── suppliers/
│   │   └── common/
│   │
│   ├── services/
│   ├── stores/
│   ├── hooks/
│   └── lib/
│
├── public/
├── package.json
├── tsconfig.json
├── next.config.*
└── Dockerfile
```

Adjust this structure if repository inspection reveals a better convention.

---

# 7. DESKTOP MODULES

The initial desktop application should support:

### Dashboard

- sales summary
- revenue
- transaction count
- inventory summary
- low-stock products
- outstanding sync operations
- daily performance
- relevant KPIs

### POS / Checkout

- product search
- barcode scanning
- categories
- cart
- quantity changes
- discounts
- taxes
- customer selection
- payment
- sale completion
- receipt generation
- offline sales
- transaction history

### Inventory

- products
- services
- stock quantities
- stock adjustments
- inventory history
- low-stock alerts
- bulk operations where supported

### Customers

- customer list
- customer details
- purchase history
- customer creation/editing

### Suppliers

The architecture explicitly includes supplier management as part of the requested scope.

Implement:

- supplier CRUD
- supplier details
- purchase orders
- purchase order items
- goods received workflow where backend support exists
- supplier transaction/history information

Do not invent backend behavior. If required functionality does not exist, identify it and implement the smallest compatible backend extension.

### Analytics / Reports

Support:

- date range filtering
- sales reports
- product performance
- inventory reports
- CSV export
- PDF reports
- P&L where the underlying data model supports it

### Employees / Roles

Desktop should support:

- employee management
- role assignment
- permissions

Reuse the existing authentication and authorization system wherever possible.

### Settings

Include:

- account information
- device information
- network status
- synchronization status
- `Sync Now`
- sync history
- conflict management
- local/cloud configuration where applicable
- printer configuration

---

# 8. AUTHENTICATION

The agreed desktop authentication method is:

**Username + Password**

Do not introduce:

- biometric authentication
- Google OAuth
- unnecessary SSO

unless the existing backend requires it.

Reuse the existing JWT authentication system if one already exists.

Inspect the existing authentication implementation before creating anything new.

---

# 9. OFFLINE-FIRST ARCHITECTURE

Offline support is a core requirement.

The desktop should use:

**Dexie.js + IndexedDB**

for browser-side offline persistence.

The architecture document specifies IndexedDB/Dexie as the browser-native offline persistence layer.

However, first inspect the mobile offline database and synchronization implementation.

The desktop should reuse the existing synchronization protocol wherever technically possible.

---

# 10. OFFLINE SALES

When offline:

1. User can continue creating sales.
2. Sale is stored locally.
3. Inventory changes are recorded locally according to the existing business rules.
4. A sync queue records pending operations.
5. The transaction receives a deterministic offline identifier/session hash if that is how the existing system works.
6. User can continue using the POS.
7. When connectivity returns, pending operations are synchronized.

Do not invent a new synchronization protocol if the existing mobile implementation already provides one.

---

# 11. SYNCHRONIZATION

The agreed synchronization model is:

### Manual

A visible:

**Sync Now**

button.

### Automatic

When network connectivity returns, the application should automatically attempt synchronization.

This is **not** intended to be a continuously connected real-time WebSocket synchronization system.

The architecture document explicitly specifies on-demand synchronization with automatic sync on connectivity.

Synchronization should:

- batch operations
- retry failures
- avoid duplicate transactions
- preserve idempotency
- expose sync status
- show pending items
- report errors clearly
- handle conflicts

---

# 12. CONFLICT RESOLUTION

Inspect the existing `ConflictResolver`.

If the mobile application already implements last-write-wins using timestamps, reuse the same behavior.

The architecture document proposes:

> last-write-wins with timestamp

and an admin UI for conflicts.

Do not replace an existing proven conflict strategy without justification.

---

# 13. LOCAL DEPLOYMENT

The desktop application must support local/on-premise operation.

Target architecture:

```text
Local Machine
│
├── Desktop Next.js PWA
├── Existing Backend
└── Local Database
```

The agreed local database direction is:

**SQLite**

where appropriate for simplified local deployment.

However:

**Do not replace PostgreSQL globally.**

Determine whether the backend can safely support a SQLite "lite/local mode".

If Prisma/database compatibility makes this impractical, document the issue before implementing an alternative.

The architecture plan explicitly identifies SQLite as the desired local-mode direction.

---

# 14. CLOUD DEPLOYMENT

Cloud mode should continue using:

```text
Desktop
   ↓
Existing Express API
   ↓
PostgreSQL
```

The desktop should not directly connect to PostgreSQL from the browser.

All database access must occur through the backend/API.

---

# 15. THERMAL RECEIPT PRINTING

Thermal receipt printing is required.

Research the existing project first for any current receipt-printing implementation.

If none exists, implement the simplest robust approach that supports common thermal receipt printers.

Consider:

- browser printing
- ESC/POS-compatible printing
- QZ Tray if required

Do not introduce a heavyweight native desktop wrapper merely for printing.

The architecture specifically requires thermal receipt printer integration.

---

# 16. PWA

The desktop app must be installable as a PWA.

Requirements:

- web app manifest
- service worker
- cached application shell
- offline startup
- appropriate icons
- installable from Chrome/Edge
- clear online/offline status

Do not assume `next-pwa` is mandatory. Use the most compatible current approach for the chosen Next.js version.

---

# 17. BACKEND EXTENSIONS

Only add backend functionality that the desktop genuinely requires.

Potential new routes:

```text
suppliers
purchase-orders
reports
sync-devices
```

Potential new Prisma models:

```text
Supplier
PurchaseOrder
PurchaseOrderItem
SyncDevice
```

These are proposed by the architecture document.

Before adding them:

1. Inspect the existing Prisma schema.
2. Check whether equivalent models already exist.
3. Check whether suppliers/purchases already exist under another name.
4. Reuse existing models whenever possible.
5. Only create migrations for genuinely missing functionality.

---

# 18. UI / UX

The desktop UI should feel like a professional POS/admin application.

Use:

- responsive desktop layouts
- sidebar navigation
- topbar
- breadcrumbs where useful
- keyboard-friendly POS interactions
- fast product search
- tables with pagination/virtualization where necessary
- clear loading states
- empty states
- error states
- confirmation dialogs
- toast notifications
- online/offline indicator
- synchronization indicator

The architecture targets Shadcn/UI + Radix + Tailwind for the desktop UI.

Follow the existing MobilePOS design language where possible rather than creating a completely unrelated visual system.

---

# 19. PERFORMANCE

The application must remain responsive with large datasets.

Pay particular attention to:

- 10,000+ products
- large transaction histories
- large inventory tables
- offline IndexedDB queries
- product search
- barcode lookup
- synchronization batches
- dashboard queries

Use virtualization where appropriate.

Do not prematurely optimize everything.

Measure before introducing complexity.

---

# 20. TESTING

Every major feature must include appropriate tests.

### Desktop

Run:

```bash
npm run test
```

or the project's actual test command.

Test:

- authentication
- cart
- checkout
- calculations
- offline storage
- sync queue
- synchronization
- conflict handling
- inventory
- suppliers
- reports
- permissions

### Backend

Run the existing backend test suite.

### Mobile

After shared-code changes, run the mobile test suite.

**A desktop implementation is not considered complete if it breaks the existing mobile application.**

---

# 21. VERIFICATION SCENARIOS

You must verify these scenarios.

### Scenario 1: Online Sale

```text
Login
→ Add product
→ Checkout
→ Complete payment
→ Verify sale in backend
→ Verify inventory update
```

### Scenario 2: Offline Sale

```text
Disable network
→ Login/session remains usable
→ Create sale
→ Complete sale
→ Verify local persistence
→ Verify pending sync
```

### Scenario 3: Reconnect

```text
Enable network
→ Automatic sync starts
→ Pending transaction uploads
→ Backend receives transaction
→ Local record marked synchronized
```

### Scenario 4: Manual Sync

```text
Create offline transaction
→ Keep network available
→ Click "Sync Now"
→ Verify transaction synchronization
```

### Scenario 5: Duplicate Prevention

```text
Create offline sale
→ Trigger sync
→ Retry sync
→ Verify only ONE backend transaction exists
```

### Scenario 6: Mobile/Desktop Data Sharing

```text
Create sale on desktop
→ Sync
→ Open mobile
→ Verify sale is visible
```

And the reverse:

```text
Create sale on mobile
→ Sync
→ Open desktop
→ Verify sale is visible
```

### Scenario 7: PWA

```text
Open desktop application
→ Install PWA
→ Disconnect internet
→ Close/reopen application
→ Verify application shell loads
```

---

# 22. DO NOT OVERENGINEER

Avoid introducing unnecessary:

- microservices
- WebSocket infrastructure
- Electron
- Tauri
- separate authentication systems
- duplicate API clients
- duplicate business logic
- duplicate database models
- unnecessary state-management libraries

The goal is a **maintainable desktop extension of the existing POS ecosystem**, not a second independent POS platform.

---

# 23. IMPLEMENTATION PHASES

Do not attempt the entire project in one uncontrolled pass.

Implement in phases.

## Phase 0: Repository Audit

Before coding, produce:

```text
DESKTOP_IMPLEMENTATION_AUDIT.md
```

Include:

- existing architecture
- reusable services
- mobile sync architecture
- backend API inventory
- Prisma models
- authentication flow
- offline implementation
- recommended shared-code extraction
- missing backend capabilities
- risks
- proposed implementation sequence

Do not modify application behavior during this phase unless necessary for tooling.

---

## Phase 1: Foundation

Implement:

- desktop Next.js project
- TypeScript
- Tailwind
- UI system
- routing
- authentication
- layout
- shared package foundation
- API integration
- online/offline detection
- Dexie setup
- PWA foundation

Verify build and tests.

---

## Phase 2: Core POS

Implement:

- product search
- cart
- checkout
- payments
- customers
- receipts
- offline sales
- sync

Verify online and offline workflows.

---

## Phase 3: Inventory

Implement:

- inventory
- stock adjustment
- product management
- services
- inventory history
- low-stock reporting

---

## Phase 4: Suppliers

Implement:

- supplier CRUD
- purchase orders
- purchase order items
- receiving workflow
- inventory integration

Only create new backend/database models where required.

---

## Phase 5: Analytics & Administration

Implement:

- dashboard
- reports
- CSV export
- PDF reports
- employees
- roles
- permissions
- device/sync management

---

## Phase 6: Printing & Deployment

Implement:

- thermal receipt printing
- PWA installation
- Docker deployment
- local deployment
- SQLite local-mode investigation/implementation
- cloud deployment configuration

---

# 24. GIT SAFETY

Before major architectural changes:

```bash
git status
```

Review the current branch and working tree.

Do not destroy uncommitted user work.

Do not reset, checkout, clean, or force-push without explicit instruction.

Make changes in small logical commits where practical.

---

# 25. ENVIRONMENT VARIABLES

Never hardcode:

- database credentials
- JWT secrets
- API keys
- production URLs
- passwords
- printer credentials

Use `.env` / `.env.local` appropriately.

Provide `.env.example` files where needed.

---

# 26. DOCUMENTATION

Maintain documentation as implementation progresses.

At minimum create/update:

```text
DESKTOP_IMPLEMENTATION_AUDIT.md
DESKTOP_ARCHITECTURE.md
DESKTOP_SETUP.md
DESKTOP_OFFLINE_SYNC.md
DESKTOP_DEPLOYMENT.md
```

Documentation must describe the **actual implementation**, not the intended architecture if implementation differs.

---

# 27. IMPORTANT DECISION RULE

If the architecture document says something should exist but repository inspection shows something different:

**Trust the existing code as the implementation source of truth.**

Then adapt the architecture accordingly.

Do not force the codebase to match the document simply because the document says so.

If there is a conflict between:

1. existing working behavior
2. architecture document
3. proposed new implementation

first preserve working behavior, then determine the safest evolution path.

---

# 28. CLAUDE CODE WORKING STYLE

Work like a senior engineer joining an existing production project.

Before changing code:

```text
Inspect → Understand → Plan → Implement → Test → Verify
```

Not:

```text
Read requirements → Generate everything → Hope it works
```

For each phase:

1. Inspect relevant files.
2. Explain the implementation plan briefly.
3. Implement the smallest coherent change.
4. Run tests/type-check/build.
5. Fix errors.
6. Verify integration.
7. Summarize what changed.
8. Identify the next phase.

Do not stop merely because TypeScript compiles.

Verify actual application behavior.

---

# 29. FIRST TASK

**Do NOT begin implementing the Desktop POS yet.**

Your first task is:

### AUDIT THE EXISTING CODEBASE.

Inspect:

```text
C:\Projects\MobilePOS
```

Then produce:

```text
DESKTOP_IMPLEMENTATION_AUDIT.md
```

The audit must answer:

1. What is the current mobile architecture?
2. What is the current backend architecture?
3. What offline functionality already exists?
4. How does synchronization currently work?
5. What API endpoints already exist?
6. What database models already exist?
7. What authentication system already exists?
8. What code can safely be shared?
9. What should move into `shared/`?
10. What desktop functionality can be built immediately using existing APIs?
11. What backend extensions are actually required?
12. What database changes are actually required?
13. What risks exist with SQLite local mode?
14. What is the safest monorepo strategy?
15. What should Phase 1 contain?
16. What should NOT be changed yet?

After creating the audit, **STOP and present the findings and recommended implementation plan for approval before beginning Phase 1.**

Do not begin Phase 1 until explicitly instructed.

---

## SUCCESS CRITERIA

The project is successful when:

- Desktop and mobile share compatible business logic.
- Existing mobile functionality remains intact.
- Desktop POS works online.
- Desktop POS works offline.
- Offline transactions synchronize reliably.
- Duplicate transactions are prevented.
- Desktop and mobile can exchange synchronized data.
- Inventory remains consistent.
- Suppliers and purchasing are supported.
- Reports work.
- Thermal receipt printing works.
- PWA installation works.
- Local/on-premise deployment is supported.
- Cloud deployment is supported.
- Tests pass.
- Documentation reflects the real implementation.

Most importantly:

**Build on the existing JayPOS/MobilePOS system. Do not build a disconnected second POS system beside it.**