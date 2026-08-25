import Dexie, { type Table } from 'dexie';
import type {
  IOfflineStore,
  OfflineTransaction,
  Product,
  Customer
} from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';

/**
 * Dexie/IndexedDB implementation of the shared `IOfflineStore` port.
 *
 * This is desktop's counterpart to mobile's AsyncStorage-backed
 * `DatabaseService`. It preserves the same behaviours the sync flow relies on:
 *  - per-store isolation (rows are stamped with `_store_id` and every read is
 *    scoped to the current store, matching mobile's per-store key prefixing);
 *  - products default a missing `item_type` to `'PRODUCT'` (legacy items predate
 *    the PRODUCT/SERVICE split);
 *  - the generic stale-while-revalidate API cache.
 *
 * IndexedDB is browser-only; every method guards against server-side use.
 */

interface StoredTransaction extends OfflineTransaction {
  _store_id: string;
}
interface StoredProduct extends Product {
  _store_id: string;
}
interface StoredCustomer extends Customer {
  _store_id: string;
}
interface StoredInventory {
  product_id: string;
  _store_id: string;
  status?: string;
  [key: string]: unknown;
}
interface StoredApiCache {
  key: string;
  data: unknown;
}

class JayposDexie extends Dexie {
  transactions!: Table<StoredTransaction, string>;
  products!: Table<StoredProduct, string>;
  inventory!: Table<StoredInventory, string>;
  customers!: Table<StoredCustomer, string>;
  apiCache!: Table<StoredApiCache, string>;

  constructor() {
    super('jaypos_desktop');
    // Note: is_sync_online is a boolean and therefore not a valid IndexedDB key,
    // so it is filtered in code rather than indexed.
    this.version(1).stores({
      transactions: 'id, offline_session_hash, _store_id',
      products: 'id, _store_id, sku, barcode',
      inventory: 'product_id, _store_id, status',
      customers: 'id, _store_id',
      apiCache: 'key'
    });
  }
}

class DexieOfflineStore implements IOfflineStore {
  private _db: JayposDexie | null = null;

  private get db(): JayposDexie {
    if (typeof window === 'undefined') {
      throw new Error('The offline store is only available in the browser.');
    }
    if (!this._db) {
      this._db = new JayposDexie();
    }
    return this._db;
  }

  /** Current store id, mirroring mobile's DatabaseService.getStoreId(). */
  private storeId(): string {
    return useAuthStore.getState().user?.store_id ?? '';
  }

  private cacheKey(key: string): string {
    const sid = this.storeId();
    return sid ? `${sid}_${key}` : key;
  }

  async initialize(): Promise<void> {
    await this.db.open();
  }

  // ── Transactions ────────────────────────────────────────────
  async createTransaction(transaction: OfflineTransaction): Promise<void> {
    await this.db.transactions.put({ ...transaction, _store_id: this.storeId() });
  }

  async getTransaction(id: string): Promise<OfflineTransaction | null> {
    const row = await this.db.transactions.get(id);
    if (!row || row._store_id !== this.storeId()) return null;
    return row;
  }

  async getAllTransactions(): Promise<OfflineTransaction[]> {
    return this.db.transactions.where('_store_id').equals(this.storeId()).toArray();
  }

  async getUnsyncedTransactions(): Promise<OfflineTransaction[]> {
    return this.db.transactions
      .where('_store_id')
      .equals(this.storeId())
      .and((t) => !t.is_sync_online)
      .toArray();
  }

  async updateTransactionSyncStatus(id: string, synced: boolean): Promise<void> {
    await this.db.transactions.update(id, { is_sync_online: synced });
  }

  async updateTransactionSyncStatusByHash(hash: string, synced: boolean): Promise<void> {
    const sid = this.storeId();
    const rows = await this.db.transactions
      .where('offline_session_hash')
      .equals(hash)
      .toArray();
    await Promise.all(
      rows
        .filter((r) => r._store_id === sid)
        .map((r) => this.db.transactions.update(r.id, { is_sync_online: synced }))
    );
  }

  // ── Products ────────────────────────────────────────────────
  async saveProducts(products: Product[]): Promise<void> {
    const sid = this.storeId();
    // Legacy cached products predate item_type and remain physical products.
    const rows: StoredProduct[] = products.map((p) => ({
      ...p,
      item_type: p.item_type ?? 'PRODUCT',
      _store_id: sid
    }));
    await this.db.products.bulkPut(rows);
  }

  async getProducts(): Promise<Product[]> {
    const rows = await this.db.products.where('_store_id').equals(this.storeId()).toArray();
    return rows.map((p) => ({ ...p, item_type: p.item_type ?? 'PRODUCT' }));
  }

  async searchProducts(query: string): Promise<Product[]> {
    const q = query.toLowerCase();
    const products = await this.getProducts();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }

  // ── Inventory ───────────────────────────────────────────────
  async saveInventory(inventory: any[]): Promise<void> {
    const sid = this.storeId();
    const rows: StoredInventory[] = inventory.map((i) => ({ ...i, _store_id: sid }));
    await this.db.inventory.bulkPut(rows);
  }

  async getAllInventory(): Promise<any[]> {
    return this.db.inventory.where('_store_id').equals(this.storeId()).toArray();
  }

  async getInventoryItem(productId: string): Promise<any | null> {
    const row = await this.db.inventory.get(productId);
    if (!row || row._store_id !== this.storeId()) return null;
    return row;
  }

  async getLowStockItems(): Promise<any[]> {
    return this.db.inventory
      .where('_store_id')
      .equals(this.storeId())
      .and((i) => i.status === 'LOW')
      .toArray();
  }

  // ── Customers ───────────────────────────────────────────────
  async saveCustomers(customers: Customer[]): Promise<void> {
    const sid = this.storeId();
    const rows: StoredCustomer[] = customers.map((c) => ({ ...c, _store_id: sid }));
    await this.db.customers.bulkPut(rows);
  }

  async getCustomers(): Promise<Customer[]> {
    return this.db.customers.where('_store_id').equals(this.storeId()).toArray();
  }

  // ── Generic API cache ───────────────────────────────────────
  async getApiCache<T = any>(key: string): Promise<T | null> {
    const row = await this.db.apiCache.get(this.cacheKey(key));
    return row ? (row.data as T) : null;
  }

  async setApiCache(key: string, data: any): Promise<void> {
    await this.db.apiCache.put({ key: this.cacheKey(key), data });
  }

  // ── Lifecycle ───────────────────────────────────────────────
  async clearAllData(): Promise<void> {
    const sid = this.storeId();
    await Promise.all([
      this.db.transactions.where('_store_id').equals(sid).delete(),
      this.db.products.where('_store_id').equals(sid).delete(),
      this.db.inventory.where('_store_id').equals(sid).delete(),
      this.db.customers.where('_store_id').equals(sid).delete()
    ]);
    // API cache keys are prefixed with the store id.
    if (sid) {
      const prefixed = await this.db.apiCache
        .filter((row) => row.key.startsWith(`${sid}_`))
        .toArray();
      await this.db.apiCache.bulkDelete(prefixed.map((r) => r.key));
    }
  }

  async close(): Promise<void> {
    this._db?.close();
  }
}

export const offlineStore: IOfflineStore = new DexieOfflineStore();
