import type { OfflineTransaction, Product, Customer } from '../../types';

/**
 * Platform-neutral surface for the local offline store.
 *
 * Mirrors mobile's `DatabaseService` (AsyncStorage-backed) so the same sync and
 * POS logic can drive it on desktop via a Dexie/IndexedDB implementation. Any
 * platform (AsyncStorage on mobile, Dexie on desktop) implements this interface;
 * shared sync code depends only on the interface, never a concrete store.
 */
export interface IOfflineStore {
  initialize(): Promise<void>;

  // Transactions
  createTransaction(transaction: OfflineTransaction): Promise<void>;
  getTransaction(id: string): Promise<OfflineTransaction | null>;
  getAllTransactions(): Promise<OfflineTransaction[]>;
  getUnsyncedTransactions(): Promise<OfflineTransaction[]>;
  updateTransactionSyncStatus(id: string, synced: boolean): Promise<void>;
  updateTransactionSyncStatusByHash(hash: string, synced: boolean): Promise<void>;

  // Products
  saveProducts(products: Product[]): Promise<void>;
  getProducts(): Promise<Product[]>;
  searchProducts(query: string): Promise<Product[]>;

  // Inventory
  saveInventory(inventory: any[]): Promise<void>;
  getAllInventory(): Promise<any[]>;
  getInventoryItem(productId: string): Promise<any | null>;
  getLowStockItems(): Promise<any[]>;

  // Customers
  saveCustomers(customers: Customer[]): Promise<void>;
  getCustomers(): Promise<Customer[]>;

  // Generic stale-while-revalidate cache
  getApiCache<T = any>(key: string): Promise<T | null>;
  setApiCache(key: string, data: any): Promise<void>;

  clearAllData(): Promise<void>;
  close(): Promise<void>;
}
