import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageCacheService from './ImageCacheService';

class DatabaseService {
  getStoreId(): string | null {
    try {
      const { store } = require('../redux/store');
      return store.getState().auth.user?.store_id || null;
    } catch {
      return null;
    }
  }

  private getStoreKey(baseKey: string): string {
    const storeId = this.getStoreId();
    return storeId ? `${storeId}_${baseKey}` : baseKey;
  }

  async initialize() {
    console.log('Database initialized (AsyncStorage)');
  }

  // Transaction operations
  async createTransaction(transaction: any) {
    try {
      const existing = await this.getAllTransactions();
      existing.push(transaction);
      await AsyncStorage.setItem(this.getStoreKey('transactions'), JSON.stringify(existing));
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  async getTransaction(id: string) {
    const transactions = await this.getAllTransactions();
    return transactions.find((t: any) => t.id === id) || null;
  }

  async getAllTransactions() {
    const data = await AsyncStorage.getItem(this.getStoreKey('transactions'));
    return data ? JSON.parse(data) : [];
  }

  async getUnsyncedTransactions() {
    const transactions = await this.getAllTransactions();
    return transactions.filter((t: any) => !t.is_sync_online);
  }

  async updateTransactionSyncStatus(id: string, synced: boolean) {
    try {
      const transactions = await this.getAllTransactions();
      const updated = transactions.map((t: any) =>
        t.id === id ? { ...t, is_sync_online: synced } : t
      );
      await AsyncStorage.setItem(this.getStoreKey('transactions'), JSON.stringify(updated));
    } catch (error) {
      console.error('Error updating transaction sync status:', error);
      throw error;
    }
  }

  async updateTransactionSyncStatusByHash(hash: string, synced: boolean) {
    try {
      const transactions = await this.getAllTransactions();
      const updated = transactions.map((t: any) =>
        t.offline_session_hash === hash ? { ...t, is_sync_online: synced } : t
      );
      await AsyncStorage.setItem(this.getStoreKey('transactions'), JSON.stringify(updated));
    } catch (error) {
      console.error('Error updating transaction sync status:', error);
      throw error;
    }
  }

  // Product operations
  async saveProducts(products: any[]) {
    try {
      const existing = await this.getProducts();
      const map = new Map(existing.map((p: any) => [p.id, p]));
      products.forEach((p) => map.set(p.id, p));
      await AsyncStorage.setItem(this.getStoreKey('products'), JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving products:', error);
      throw error;
    }
  }

  async getProducts() {
    const data = await AsyncStorage.getItem(this.getStoreKey('products'));
    return data ? JSON.parse(data) : [];
  }

  async searchProducts(query: string) {
    const products = await this.getProducts();
    const q = query.toLowerCase();
    return products.filter(
      (p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }

  // Inventory operations
  async saveInventory(inventory: any[]) {
    try {
      const existing = await this.getAllInventory();
      const map = new Map(existing.map((i: any) => [i.product_id, i]));
      inventory.forEach((i) => map.set(i.product_id, i));
      await AsyncStorage.setItem(this.getStoreKey('inventory'), JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving inventory:', error);
      throw error;
    }
  }

  async getAllInventory() {
    const data = await AsyncStorage.getItem(this.getStoreKey('inventory'));
    return data ? JSON.parse(data) : [];
  }

  async getInventoryItem(productId: string) {
    const inventory = await this.getAllInventory();
    return inventory.find((i: any) => i.product_id === productId) || null;
  }

  // Customer operations
  async saveCustomers(customers: any[]) {
    try {
      const existing = await this.getCustomers();
      const map = new Map(existing.map((c: any) => [c.id, c]));
      customers.forEach((c) => map.set(c.id, c));
      await AsyncStorage.setItem(this.getStoreKey('customers'), JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving customers:', error);
      throw error;
    }
  }

  async getCustomers() {
    const data = await AsyncStorage.getItem(this.getStoreKey('customers'));
    return data ? JSON.parse(data) : [];
  }

  async getLowStockItems() {
    const inventory = await this.getAllInventory();
    return inventory.filter((i: any) => i.status === 'LOW');
  }

  // Generic API response cache — used for stale-while-revalidate page loads.
  async getApiCache<T = any>(key: string): Promise<T | null> {
    try {
      const storeId = this.getStoreId();
      const storageKey = storeId ? `apicache_${storeId}_${key}` : `apicache_${key}`;
      const data = await AsyncStorage.getItem(storageKey);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  async setApiCache(key: string, data: any) {
    try {
      const storeId = this.getStoreId();
      const storageKey = storeId ? `apicache_${storeId}_${key}` : `apicache_${key}`;
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  }

  async close() {
    console.log('Database closed');
  }

  async clearAllData() {
    try {
      await AsyncStorage.multiRemove([
        this.getStoreKey('transactions'),
        this.getStoreKey('products'),
        this.getStoreKey('inventory'),
        this.getStoreKey('customers')
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  async clearCurrentStoreCache() {
    try {
      const storeId = this.getStoreId();
      if (!storeId) return;

      const keys = await AsyncStorage.getAllKeys();
      // Remove products, inventory, customers, apicaches and api client caches for the current store.
      // EXCLUDE transaction logs to prevent data loss.
      const storeKeys = keys.filter(
        (key) =>
          (key.startsWith(`${storeId}_`) && !key.endsWith('_transactions')) ||
          key.startsWith(`apicache_${storeId}_`) ||
          key.startsWith(`cache_${storeId}_`)
      );

      if (storeKeys.length > 0) {
        await AsyncStorage.multiRemove(storeKeys);
      }
      // Clear locally cached product image thumbnails
      await ImageCacheService.clearStoreCache(storeId);
      console.log(`Cleared ${storeKeys.length} cache keys for store ${storeId}`);
    } catch (error) {
      console.error('Error clearing store cache:', error);
      throw error;
    }
  }
}

export default new DatabaseService();