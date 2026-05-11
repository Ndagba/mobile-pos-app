import Realm from 'realm';

// Realm Models
export const TransactionSchema: Realm.ObjectSchema = {
  name: 'Transaction',
  primaryKey: 'id',
  properties: {
    id: 'string',
    store_id: 'string',
    user_id: 'string',
    customer_id: 'string?',
    offline_session_hash: 'string?',
    is_sync_online: 'bool',
    subtotal: 'double',
    tax_amount: 'double',
    discount_amount: 'double',
    total_amount: 'double',
    payment_method: 'string',
    payment_status: 'string',
    status: 'string',
    items: 'TransactionItem[]',
    created_at: 'date',
    updated_at: 'date'
  }
};

export const TransactionItemSchema: Realm.ObjectSchema = {
  name: 'TransactionItem',
  primaryKey: 'id',
  properties: {
    id: 'string',
    product_id: 'string',
    product_name: 'string',
    quantity: 'int',
    unit_price: 'double',
    tax_amount: 'double',
    line_total: 'double',
    created_at: 'date'
  }
};

export const ProductSchema: Realm.ObjectSchema = {
  name: 'Product',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    sku: 'string',
    marked_price: 'double',
    effective_price: 'double',
    tax_rate: 'double',
    barcode: 'string?',
    image_url: 'string?',
    category_id: 'string'
  }
};

export const InventorySchema: Realm.ObjectSchema = {
  name: 'Inventory',
  primaryKey: 'product_id',
  properties: {
    product_id: 'string',
    quantity_on_hand: 'int',
    low_stock_threshold: 'int',
    status: 'string'
  }
};

class DatabaseService {
  private realm: Realm | null = null;

  async initialize() {
    if (this.realm) return;

    try {
      this.realm = await Realm.open({
        schema: [TransactionSchema, TransactionItemSchema, ProductSchema, InventorySchema],
        schemaVersion: 1
      });
      console.log('Database initialized');
    } catch (error) {
      console.error('Failed to open Realm:', error);
      throw error;
    }
  }

  // Transaction operations
  async createTransaction(transaction: any) {
    if (!this.realm) throw new Error('Database not initialized');

    try {
      this.realm.write(() => {
        this.realm!.create('Transaction', transaction);
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  async getTransaction(id: string) {
    if (!this.realm) throw new Error('Database not initialized');

    return this.realm.objectForPrimaryKey('Transaction', id);
  }

  async getUnsyncedTransactions() {
    if (!this.realm) throw new Error('Database not initialized');

    return this.realm.objects('Transaction').filtered('is_sync_online == false');
  }

  async updateTransactionSyncStatus(id: string, synced: boolean) {
    if (!this.realm) throw new Error('Database not initialized');

    try {
      this.realm.write(() => {
        const tx = this.realm!.objectForPrimaryKey('Transaction', id);
        if (tx) {
          (tx as any).is_sync_online = synced;
        }
      });
    } catch (error) {
      console.error('Error updating transaction sync status:', error);
      throw error;
    }
  }

  // Product operations
  async saveProducts(products: any[]) {
    if (!this.realm) throw new Error('Database not initialized');

    try {
      this.realm.write(() => {
        products.forEach((product) => {
          this.realm!.create('Product', product, Realm.UpdateMode.All);
        });
      });
    } catch (error) {
      console.error('Error saving products:', error);
      throw error;
    }
  }

  async getProducts() {
    if (!this.realm) throw new Error('Database not initialized');

    return Array.from(this.realm.objects('Product'));
  }

  async searchProducts(query: string) {
    if (!this.realm) throw new Error('Database not initialized');

    const allProducts = this.realm.objects('Product');
    return allProducts.filtered(
      `name CONTAINS[c] "${query}" OR sku CONTAINS[c] "${query}" OR barcode CONTAINS[c] "${query}"`
    );
  }

  // Inventory operations
  async saveInventory(inventory: any[]) {
    if (!this.realm) throw new Error('Database not initialized');

    try {
      this.realm.write(() => {
        inventory.forEach((item) => {
          this.realm!.create('Inventory', item, Realm.UpdateMode.All);
        });
      });
    } catch (error) {
      console.error('Error saving inventory:', error);
      throw error;
    }
  }

  async getInventoryItem(productId: string) {
    if (!this.realm) throw new Error('Database not initialized');

    return this.realm.objectForPrimaryKey('Inventory', productId);
  }

  async getLowStockItems() {
    if (!this.realm) throw new Error('Database not initialized');

    return this.realm.objects('Inventory').filtered('status == "LOW"');
  }

  // Cleanup
  async close() {
    if (this.realm) {
      this.realm.close();
      this.realm = null;
    }
  }

  async clearAllData() {
    if (!this.realm) throw new Error('Database not initialized');

    try {
      this.realm.write(() => {
        this.realm!.deleteAll();
      });
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
}

export default new DatabaseService();
