import ApiClient from './ApiClient';
import DatabaseService from './DatabaseService';
import crypto from 'crypto-js';

interface PendingTransaction {
  id: string;
  offline_session_hash: string;
  store_id: string;
  user_id: string;
  customer_id?: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  items: any[];
}

export class SyncManager {
  static generateOfflineSessionHash(
    deviceId: string,
    transactionId: string,
    timestamp: number
  ): string {
    const data = `${deviceId}-${transactionId}-${timestamp}`;
    return crypto.SHA256(data).toString();
  }

  static async syncPendingTransactions(
    deviceId: string
  ): Promise<{ synced: number; failed: number; errors: any[] }> {
    try {
      const unsyncedTransactions = await DatabaseService.getUnsyncedTransactions();
      const transactionsToSync: any[] = Array.isArray(unsyncedTransactions)
        ? unsyncedTransactions
        : Array.from(unsyncedTransactions as Iterable<any>);

      if (transactionsToSync.length === 0) {
        return { synced: 0, failed: 0, errors: [] };
      }

      // Prepare batch (exclude id from payload - it's client-side only)
      const batch = transactionsToSync.map((tx: any) => ({
        store_id: tx.store_id,
        branch_id: tx.branch_id,
        customer_id: tx.customer_id || undefined,
        offline_session_hash: tx.offline_session_hash,
        subtotal: tx.subtotal,
        tax_amount: tx.tax_amount,
        discount_amount: tx.discount_amount,
        total_amount: tx.total_amount,
        payment_method: tx.payment_method,
        items: Array.isArray(tx.items) ? tx.items : Array.from(tx.items as Iterable<any>)
      }));

      console.log('Syncing batch:', { count: batch.length, batch });

      // Send to server
      const response = (await ApiClient.post('/transactions/batch', { transactions: batch })) as any;
      const result = response?.data ?? response;

      console.log('Sync response:', result);

      // Update sync status
      let synced = 0;
      let failed = 0;
      const errors: any[] = [];

      if (result?.results) {
        for (const item of result.results as any[]) {
          await DatabaseService.updateTransactionSyncStatusByHash(item.offline_session_hash, true);
          synced++;
        }
      }

      if (result?.errors) {
        failed = (result.errors as any[]).length;
        errors.push(...result.errors);
        console.error('Sync errors:', result.errors);
      }

      return {
        synced,
        failed,
        errors
      };
    } catch (error) {
      console.error('Sync failed:', error);
      return {
        synced: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  static async fetchLatestInventory(deviceId: string) {
    try {
      const inventory = (await ApiClient.get('/inventory')) as any[];
      await DatabaseService.saveInventory(inventory);
      return inventory;
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      // Return cached inventory on error
      throw error;
    }
  }

  static async fetchLatestProducts(deviceId: string) {
    try {
      const products = (await ApiClient.get('/products?limit=1000')) as any[];
      await DatabaseService.saveProducts(products);
      return products;
    } catch (error) {
      console.error('Failed to fetch products:', error);
      throw error;
    }
  }

  static async fetchLowStockAlerts() {
    try {
      return await ApiClient.get('/inventory/low-stock');
    } catch (error) {
      console.error('Failed to fetch low stock alerts:', error);
      return [];
    }
  }

  static async fetchExpiringBatches() {
    try {
      return await ApiClient.get('/inventory/expiring');
    } catch (error) {
      console.error('Failed to fetch expiring batches:', error);
      return [];
    }
  }

  static async submitTransaction(
    transaction: PendingTransaction,
    deviceId: string,
    isOnline: boolean
  ) {
    // Generate offline session hash
    const offlineSessionHash = this.generateOfflineSessionHash(
      deviceId,
      transaction.id,
      Date.now()
    );

    const payload = {
      ...transaction,
      offline_session_hash: offlineSessionHash
    };

    if (isOnline) {
      // Submit immediately
      try {
        return await ApiClient.post('/transactions', payload);
      } catch (error) {
        // Fallback to offline storage
        await DatabaseService.createTransaction({
          ...payload,
          is_sync_online: false
        });
        throw error;
      }
    } else {
      // Store for later sync
      await DatabaseService.createTransaction({
        ...payload,
        is_sync_online: false
      });
      return { id: transaction.id, status: 'queued_for_sync' };
    }
  }
}
