# DESKTOP_OFFLINE_SYNC.md — how the desktop POS makes and syncs sales

How the Desktop POS (`desktop/`) records a sale, survives going offline, and drains
its backlog to the existing backend **without creating duplicates**. This describes
the code as built in Phase 2; it deliberately mirrors the mobile app so the two
clients are interchangeable against the same backend.

Verified against the working tree on **2026‑08‑23**.

---

## The model in one paragraph

A sale is built **client-side** (`buildTransactionInput`) with the exact arithmetic
the backend trusts, then finalized by `createTransaction`. **Online**, it POSTs to
`POST /v1/transactions` and shows the server `receipt_number`. **Offline** (or on a
bare network failure), it is written to **Dexie/IndexedDB** with `is_sync_online=false`
and drained later via `POST /v1/transactions/batch` — triggered automatically on
reconnect and manually by **"Sync Now"**. Every sale carries an
`offline_session_hash`; the backend enforces it `@unique` and returns the existing
row on collision, so re-sending is always safe. This is the same hybrid, push-only
model the mobile app uses.

---

## Where the logic lives (reuse-first)

The orchestration is pure and platform-agnostic, so it lives in **`@jaypos/shared`**
behind ports; desktop supplies the concrete adapters built in Phase 1.

| Concern | Shared (framework-agnostic) | Desktop adapter |
|---|---|---|
| Build a sale from the cart | `services/transactions/buildTransactionInput.ts` | — |
| Create / queue a sale | `services/transactions/transactionService.ts` → `createTransaction` | — |
| Drain the backlog | `services/transactions/transactionService.ts` → `syncPendingTransactions` | — |
| Idempotency hash | `services/sync/offlineSessionHash.ts` | — |
| Client id | `utils/id.ts` (`generateId`) | — |
| HTTP | `IApiClient` port | `lib/apiClient.ts` (`WebApiClient`, axios) |
| Durable store | `IOfflineStore` port | `lib/db.ts` (`DexieOfflineStore`) |
| Connectivity | `INetwork` port | `lib/network.ts` (`navigator.onLine` + events) |

UI state: cart in `store/cartStore.ts`, pending-sync count + "Sync Now" in
`store/syncStore.ts`, auto-sync in `hooks/useAutoSync.ts` (mounted once in `AppShell`).

---

## Idempotency — byte-identical to mobile (do not change)

```ts
offline_session_hash = SHA256(`${deviceId}-${transactionId}-${timestamp}`)  // crypto-js, lowercase hex
// transactionId = generateId()          — Math.random-based UUID v4 (shared/utils/id.ts)
// timestamp     = Date.now()            — generated inside createTransaction, NOT by the caller
// deviceId      = getDeviceId()          — persisted `device_${ts}_${rand}` in localStorage (lib/deviceId.ts)
```

The hash and id are generated **inside `createTransaction`**, exactly as mobile does,
so a desktop sale and a mobile sale hash identically. The backend
(`TransactionService.createTransaction`) does a `findFirst` on the hash and returns
the existing row on collision — that is the entire duplicate-prevention mechanism.
There is **no client-side conflict resolver** (none is needed for push-only sales).

---

## `createTransaction` — the decision tree

`isOnline` is read from the live `useNetworkStatus()` (navigator) at charge time.

- **Online:**
  1. `POST /v1/transactions { ...input, offline_session_hash }`.
  2. `confirmed = !!response.receipt_number`. The local row is **always** persisted
     (with `is_sync_online = confirmed`) so nothing is ever lost.
     - confirmed → `status: 'completed'` (+ server `receipt_number`).
     - no receipt → `status: 'queued_for_sync'` (optimistic; batch will confirm later).
  3. A thrown error **with an HTTP `.response`** (e.g. **403** no active subscription,
     **400** insufficient stock, validation) is **re-thrown** so the UI can show it —
     the sale is **not** persisted.
  4. A **bare network error** (no `.response`) is swallowed: persist unsynced →
     `queued_for_sync`.
- **Offline:** persist unsynced immediately → `status: 'offline'`.

The desktop `Checkout` surfaces a re-thrown server error via
`err.response.data.message || err.response.data.error`, and shows the receipt modal on
any of `completed | queued_for_sync | offline`.

## `syncPendingTransactions` — draining the backlog

- Reads `store.getUnsyncedTransactions()`; **empty ⇒ short-circuits** (no network call).
- Maps each row to the batch shape, **omitting** `id` / `user_id` / `created_at` /
  `is_sync_online` (the server injects/derives those from the JWT) and sending
  `customer_id || undefined`.
- `POST /v1/transactions/batch { transactions:[...] }` → `{ results, errors }` (the
  api client has already unwrapped one `.data` envelope level).
- For **each** result row, marks the local record synced **by hash** (order-independent).
- **Duplicates come back in `results` as `synced`**, so a re-run is a safe no-op.
- A whole-batch failure (thrown request) is caught and reported via `errors`; the rows
  **stay unsynced** and are retried on the next trigger (mobile parity).

---

## Triggers

- **On every sale:** the sales page calls `syncStore.refreshPendingCount()` so the
  topbar badge is live.
- **On reconnect:** `useAutoSync` subscribes to `INetwork`; an online transition calls
  `apiClient.setOnlineStatus(true)` then `syncNow()` (which no-ops if nothing is pending).
- **Manually:** the topbar **"Sync Now"** button (disabled when 0 pending / offline /
  already syncing).

---

## What is NOT synced this way

Everything except sales is **pull-only, server-wins**: products, categories, and
customers are fetched (`useProducts`/`useCategories`/`useCustomers`), normalized
(Decimal strings → numbers), and cached to Dexie for offline reads. There is no push
path for them from the desktop — same as mobile.

---

## Verifying (needs a running backend)

Scenarios 1–6 are end-to-end and require the backend up (Postgres/Redis per
`docker-compose.yml`) with an **active-subscription** store, and `desktop/.env.local`
pointing `NEXT_PUBLIC_API_URL` at it. The pure create/queue/sync/idempotency logic is
covered hermetically by the shared vitest suite
(`shared/src/services/transactions/*.test.ts`, `services/sync/offlineSessionHash.test.ts`).
See the Phase 2 verification checklist in [`TODO.md`](TODO.md).
