import AsyncStorage from '@react-native-async-storage/async-storage';

class DatabaseService {
  async initialize() {
    console.log('Database initialized (AsyncStorage)');
  }

  // Transaction operations
  async createTransaction(transaction: any) {
    try {
      const existing = await this.getAllTransactions();
      existing.push(transaction);
      await AsyncStorage.setItem('transactions', JSON.stringify(existing));
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
    const data = await AsyncStorage.getItem('transactions');
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
      await AsyncStorage.setItem('transactions', JSON.stringify(updated));
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
      await AsyncStorage.setItem('transactions', JSON.stringify(updated));
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
      await AsyncStorage.setItem('products', JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving products:', error);
      throw error;
    }
  }

  async getProducts() {
    const data = await AsyncStorage.getItem('products');
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
      await AsyncStorage.setItem('inventory', JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving inventory:', error);
      throw error;
    }
  }

  async getAllInventory() {
    const data = await AsyncStorage.getItem('inventory');
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
      await AsyncStorage.setItem('customers', JSON.stringify(Array.from(map.values())));
    } catch (error) {
      console.error('Error saving customers:', error);
      throw error;
    }
  }

  async getCustomers() {
    const data = await AsyncStorage.getItem('customers');
    return data ? JSON.parse(data) : [];
  }

  async getLowStockItems() {
    const inventory = await this.getAllInventory();
    return inventory.filter((i: any) => i.status === 'LOW');
  }

  // Generic API response cache — used for stale-while-revalidate page loads.
  async getApiCache<T = any>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(`apicache_${key}`);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  async setApiCache(key: string, data: any) {
    try {
      await AsyncStorage.setItem(`apicache_${key}`, JSON.stringify(data));
    } catch {}
  }

  async close() {
    console.log('Database closed');
  }

  async clearAllData() {
    try {
      await AsyncStorage.multiRemove(['transactions', 'products', 'inventory']);
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
}

export default new DatabaseService();