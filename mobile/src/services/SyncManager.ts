import ApiClient from './ApiClient';
import DatabaseService from './DatabaseService';
import crypto from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

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
      const unsyncedTransactions = DatabaseService.getUnsyncedTransactions();
      const transactionsToSync = Array.from(unsyncedTransactions);

      if (transactionsToSync.length === 0) {
        return { synced: 0, failed: 0, errors: [] };
      }

      // Prepare batch
      const batch = transactionsToSync.map((tx: any) => ({
        id: tx.id,
        store_id: tx.store_id,
        user_id: tx.user_id,
        customer_id: tx.customer_id,
        offline_session_hash: tx.offline_session_hash,
        subtotal: tx.subtotal,
        tax_amount: tx.tax_amount,
        discount_amount: tx.discount_amount,
        total_amount: tx.total_amount,
        payment_method: tx.payment_method,
        items: Array.from(tx.items)
      }));

      // Send to server
      const response = await ApiClient.post('/transactions/batch', { transactions: batch });

      // Update sync status
      let synced = 0;
      let failed = 0;

      if (response.results) {
        for (const result of response.results) {
          await DatabaseService.updateTransactionSyncStatus(result.transaction_id, true);
          synced++;
        }
      }

      if (response.errors) {
        failed = response.errors.length;
      }

      return {
        synced,
        failed,
        errors: response.errors || []
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
      const inventory = await ApiClient.get('/inventory');
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
      const products = await ApiClient.get('/products?limit=1000');
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
