import type {
  BatchSyncResponse,
  CreateTransactionResult,
  OfflineTransaction,
} from '../../types';
import type { IApiClient } from '../api/IApiClient';
import type { IOfflineStore } from '../sync/IOfflineStore';
import { generateId } from '../../utils/id';
import { generateOfflineSessionHash } from '../sync/offlineSessionHash';
import type { TransactionDraft } from './buildTransactionInput';

/** Dependencies for a single sale. `isOnline` reflects live connectivity at charge time. */
export interface CreateTransactionDeps {
  api: IApiClient;
  store: IOfflineStore;
  deviceId: string;
  isOnline: boolean;
}

/** Dependencies for draining the pending-sync queue. */
export interface SyncDeps {
  api: IApiClient;
  store: IOfflineStore;
}

/** Aggregate outcome of one batch-sync pass. */
export interface SyncResult {
  synced: number;
  failed: number;
  errors: unknown[];
}

/** The only field of `POST /v1/transactions` we act on: presence ⇒ server confirmed. */
interface CreateTransactionResponse {
  id?: string;
  receipt_number?: string | null;
}

/** True when an error carries an HTTP response (real server rejection) vs a bare network failure. */
function hasHttpResponse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    (err as { response?: unknown }).response != null
  );
}

/**
 * Create a sale, online or offline, with idempotent persistence.
 *
 * Mirrors mobile's `TransactionService.createTransaction`
 * (mobile/src/services/TransactionService.ts) exactly:
 *  - `transactionId = generateId()` and
 *    `offline_session_hash = generateOfflineSessionHash(deviceId, transactionId, Date.now())`
 *    are generated HERE (not by the caller), so the hash is byte-identical to mobile.
 *  - ONLINE: POST /transactions. `confirmed = !!receipt_number`. The local row is
 *    ALWAYS persisted (with `is_sync_online = confirmed`) so nothing is lost.
 *      · confirmed  → `completed` (carries the server receipt_number)
 *      · no receipt → `queued_for_sync` (optimistic; drained later by batch)
 *    A thrown error WITH an HTTP `.response` (subscription 403, stock 400,
 *    validation) is RE-THROWN for the caller to surface. A bare network error
 *    (no `.response`) is swallowed: the row is persisted unsynced → `queued_for_sync`.
 *  - OFFLINE: persist unsynced immediately → `offline`.
 *
 * The backend ignores the client `id`/`created_at`/`device_id` and dedupes on
 * `offline_session_hash`, so re-sending the same local row is always safe.
 */
export async function createTransaction(
  input: TransactionDraft,
  deps: CreateTransactionDeps
): Promise<CreateTransactionResult> {
  const { api, store, deviceId, isOnline } = deps;

  const transactionId = generateId();
  const offline_session_hash = generateOfflineSessionHash(deviceId, transactionId, Date.now());

  const record: OfflineTransaction = {
    id: transactionId,
    ...input,
    offline_session_hash,
    is_sync_online: isOnline,
    created_at: new Date(),
  };

  if (isOnline) {
    try {
      const resp = await api.post<CreateTransactionResponse>('/transactions', {
        ...input,
        offline_session_hash,
      });
      const confirmed = !!resp?.receipt_number;
      await store.createTransaction({ ...record, is_sync_online: confirmed });

      if (confirmed) {
        return {
          status: 'completed',
          transaction_id: resp?.id || transactionId,
          offline_session_hash,
          receipt_number: resp?.receipt_number ?? null,
        };
      }
      return { status: 'queued_for_sync', transaction_id: transactionId, offline_session_hash };
    } catch (err) {
      // Real server rejection → surface it. Bare network failure → queue for later.
      if (hasHttpResponse(err)) {
        throw err;
      }
      await store.createTransaction({ ...record, is_sync_online: false });
      return { status: 'queued_for_sync', transaction_id: transactionId, offline_session_hash };
    }
  }

  await store.createTransaction({ ...record, is_sync_online: false });
  return { status: 'offline', transaction_id: transactionId, offline_session_hash };
}

/**
 * Drain all unsynced local sales to the backend in one batch.
 *
 * Mirrors mobile's `SyncManager.syncPendingTransactions`
 * (mobile/src/services/SyncManager.ts):
 *  - Reads `store.getUnsyncedTransactions()`; empty ⇒ short-circuit.
 *  - Maps each row to the batch shape, OMITTING `id`/`user_id`/`created_at`/
 *    `is_sync_online` (server injects/derives those) and sending
 *    `customer_id || undefined`.
 *  - POSTs `{ transactions }` to `/transactions/batch`; the api client has
 *    already unwrapped one `.data`, so we read `{ results, errors }` directly.
 *  - For each result row, marks the local record synced BY HASH (order-independent).
 *  - Duplicates come back in `results` as `synced`, so a re-run is a no-op — the
 *    backend dedupes on `offline_session_hash`.
 *  - A whole-batch failure (thrown request) is caught and reported via `errors`;
 *    the rows stay unsynced and are retried on the next pass (mobile parity).
 */
export async function syncPendingTransactions(deps: SyncDeps): Promise<SyncResult> {
  const { api, store } = deps;

  const unsynced = await store.getUnsyncedTransactions();
  if (!unsynced || unsynced.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  const batch = unsynced.map((tx) => ({
    store_id: tx.store_id,
    branch_id: tx.branch_id,
    customer_id: tx.customer_id || undefined,
    offline_session_hash: tx.offline_session_hash,
    subtotal: tx.subtotal,
    tax_amount: tx.tax_amount,
    discount_amount: tx.discount_amount,
    total_amount: tx.total_amount,
    payment_method: tx.payment_method,
    items: tx.items,
  }));

  try {
    const result = await api.post<BatchSyncResponse>('/transactions/batch', {
      transactions: batch,
    });

    let synced = 0;
    for (const row of result?.results ?? []) {
      await store.updateTransactionSyncStatusByHash(row.offline_session_hash, true);
      synced++;
    }
    const errors: unknown[] = result?.errors ? [...result.errors] : [];
    return { synced, failed: errors.length, errors };
  } catch (err) {
    // Request never completed — leave everything pending for the next trigger.
    return { synced: 0, failed: 0, errors: [err] };
  }
}
