import { describe, it, expect, vi } from 'vitest';
import { createTransaction, syncPendingTransactions } from './transactionService';
import { buildTransactionInput } from './buildTransactionInput';
import type { IApiClient } from '../api/IApiClient';
import type { IOfflineStore } from '../sync/IOfflineStore';
import type { CartItem, OfflineTransaction } from '../../types';

// --- fakes -----------------------------------------------------------------

/** Minimal in-memory IOfflineStore exposing just the methods the service touches. */
function makeStore() {
  const txs: OfflineTransaction[] = [];
  const store = {
    async createTransaction(tx: OfflineTransaction) {
      txs.push(tx);
    },
    async getUnsyncedTransactions() {
      return txs.filter((t) => !t.is_sync_online);
    },
    async updateTransactionSyncStatusByHash(hash: string, synced: boolean) {
      for (const t of txs) if (t.offline_session_hash === hash) t.is_sync_online = synced;
    },
  } as unknown as IOfflineStore;
  return { store, txs };
}

/** IApiClient whose `post` is a supplied fn; other methods are unused. */
function makeApi(post: (url: string, data?: unknown) => Promise<unknown>) {
  return {
    get: async () => {
      throw new Error('unused');
    },
    post: vi.fn(post),
    patch: async () => {
      throw new Error('unused');
    },
    delete: async () => {
      throw new Error('unused');
    },
    getOnlineStatus: () => true,
    setOnlineStatus: () => {},
  } as unknown as IApiClient & { post: ReturnType<typeof vi.fn> };
}

const cart: CartItem[] = [
  { product_id: 'p1', product_name: 'Rice', quantity: 2, unit_price: 100, tax_rate: 7.5 },
];
const draft = () =>
  buildTransactionInput(cart, { store_id: 'store_001', branch_id: 'b1', payment_method: 'cash' });

const deps = (api: IApiClient, store: IOfflineStore, isOnline: boolean) => ({
  api,
  store,
  deviceId: 'device-xyz',
  isOnline,
});

// --- createTransaction -----------------------------------------------------

describe('createTransaction', () => {
  it('online + server returns receipt_number → completed, persisted synced', async () => {
    const api = makeApi(async () => ({ id: 'srv-1', receipt_number: 'RCPT-001' }));
    const { store, txs } = makeStore();

    const res = await createTransaction(draft(), deps(api, store, true));

    expect(res.status).toBe('completed');
    expect(res.receipt_number).toBe('RCPT-001');
    expect(res.transaction_id).toBe('srv-1');
    expect(api.post).toHaveBeenCalledWith('/transactions', expect.any(Object));
    expect(txs).toHaveLength(1);
    expect(txs[0].is_sync_online).toBe(true);
    // the idempotency hash is sent in the body (not a header)
    expect((api.post as ReturnType<typeof vi.fn>).mock.calls[0][1]).toHaveProperty(
      'offline_session_hash',
      res.offline_session_hash
    );
  });

  it('online but no receipt_number → queued_for_sync, persisted UNsynced', async () => {
    const api = makeApi(async () => ({ id: 'srv-1' })); // optimistic ack, no receipt
    const { store, txs } = makeStore();

    const res = await createTransaction(draft(), deps(api, store, true));

    expect(res.status).toBe('queued_for_sync');
    expect(txs).toHaveLength(1);
    expect(txs[0].is_sync_online).toBe(false);
  });

  it('online + server rejects WITH a response (e.g. 403/400) → rethrows, nothing persisted', async () => {
    const httpErr = { response: { status: 403, data: { message: 'No active subscription' } } };
    const api = makeApi(async () => {
      throw httpErr;
    });
    const { store, txs } = makeStore();

    await expect(createTransaction(draft(), deps(api, store, true))).rejects.toBe(httpErr);
    expect(txs).toHaveLength(0);
  });

  it('online + bare network error (no response) → queued_for_sync, persisted UNsynced', async () => {
    const api = makeApi(async () => {
      throw new Error('Network Error');
    });
    const { store, txs } = makeStore();

    const res = await createTransaction(draft(), deps(api, store, true));

    expect(res.status).toBe('queued_for_sync');
    expect(txs).toHaveLength(1);
    expect(txs[0].is_sync_online).toBe(false);
  });

  it('offline → offline, persisted UNsynced, server never called', async () => {
    const api = makeApi(async () => {
      throw new Error('should not be called');
    });
    const { store, txs } = makeStore();

    const res = await createTransaction(draft(), deps(api, store, false));

    expect(res.status).toBe('offline');
    expect(api.post).not.toHaveBeenCalled();
    expect(txs).toHaveLength(1);
    expect(txs[0].is_sync_online).toBe(false);
    expect(res.offline_session_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// --- syncPendingTransactions ----------------------------------------------

describe('syncPendingTransactions', () => {
  it('short-circuits with no network call when nothing is pending', async () => {
    const api = makeApi(async () => ({ results: [], errors: [] }));
    const { store } = makeStore();

    const res = await syncPendingTransactions({ api, store });

    expect(res).toEqual({ synced: 0, failed: 0, errors: [] });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('marks every returned row synced by hash and reports the count', async () => {
    // Seed two offline sales, then echo their hashes back as synced.
    const offlineApi = makeApi(async () => {
      throw new Error('offline');
    });
    const { store, txs } = makeStore();
    await createTransaction(draft(), deps(offlineApi, store, false));
    await createTransaction(draft(), deps(offlineApi, store, false));
    expect((await store.getUnsyncedTransactions()).length).toBe(2);

    const api = makeApi(async (_url, body) => {
      const sent = (body as { transactions: Array<{ offline_session_hash: string }> }).transactions;
      // batch payload must omit local-only fields
      expect(sent[0]).not.toHaveProperty('id');
      expect(sent[0]).not.toHaveProperty('is_sync_online');
      expect(sent[0]).not.toHaveProperty('created_at');
      return {
        results: sent.map((t) => ({
          offline_session_hash: t.offline_session_hash,
          transaction_id: 'srv',
          status: 'synced',
        })),
        errors: [],
      };
    });

    const res = await syncPendingTransactions({ api, store });

    expect(res.synced).toBe(2);
    expect(res.failed).toBe(0);
    expect((await store.getUnsyncedTransactions()).length).toBe(0);
    expect(txs.every((t) => t.is_sync_online)).toBe(true);
  });

  it('counts per-row errors and leaves those rows pending', async () => {
    const offlineApi = makeApi(async () => {
      throw new Error('offline');
    });
    const { store } = makeStore();
    await createTransaction(draft(), deps(offlineApi, store, false));

    const api = makeApi(async () => ({
      results: [],
      errors: [{ offline_session_hash: 'h', error: 'boom', status: 'failed' }],
    }));

    const res = await syncPendingTransactions({ api, store });

    expect(res.synced).toBe(0);
    expect(res.failed).toBe(1);
    expect((await store.getUnsyncedTransactions()).length).toBe(1);
  });

  it('treats a whole-batch request failure as retryable (rows stay pending)', async () => {
    const offlineApi = makeApi(async () => {
      throw new Error('offline');
    });
    const { store } = makeStore();
    await createTransaction(draft(), deps(offlineApi, store, false));

    const api = makeApi(async () => {
      throw new Error('Network Error');
    });

    const res = await syncPendingTransactions({ api, store });

    expect(res.synced).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect((await store.getUnsyncedTransactions()).length).toBe(1);
  });
});
