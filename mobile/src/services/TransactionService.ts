import ApiClient from './ApiClient';
import DatabaseService from './DatabaseService';
import { SyncManager } from './SyncManager';
import { v4 as uuidv4 } from 'uuid';

export interface TransactionInput {
  store_id: string;
  user_id: string;
  customer_id?: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    line_total: number;
  }>;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'mobile_wallet';
}

export class TransactionService {
  static async createTransaction(
    input: TransactionInput,
    deviceId: string,
    isOnline: boolean
  ) {
    const transactionId = uuidv4();

    const transaction = {
      id: transactionId,
      ...input,
      offline_session_hash: SyncManager.generateOfflineSessionHash(deviceId, transactionId, Date.now()),
      is_sync_online: isOnline,
      created_at: new Date()
    };

    if (isOnline) {
      try {
        // Submit to server
        const response = await ApiClient.post('/transactions', {
          ...transaction,
          items: input.items
        });

        // Also save locally
        await DatabaseService.createTransaction({
          ...transaction,
          is_sync_online: true,
          items: input.items
        });

        return {
          success: true,
          transaction_id: response.id || transactionId,
          receipt_number: response.receipt_number,
          status: 'completed'
        };
      } catch (error) {
        console.error('Error creating online transaction:', error);
        // Fallback to offline
        await DatabaseService.createTransaction({
          ...transaction,
          is_sync_online: false,
          items: input.items
        });

        return {
          success: true,
          transaction_id: transactionId,
          status: 'queued_for_sync',
          error: 'Offline: Transaction queued for sync'
        };
      }
    } else {
      // Offline transaction
      await DatabaseService.createTransaction({
        ...transaction,
        is_sync_online: false,
        items: input.items
      });

      return {
        success: true,
        transaction_id: transactionId,
        status: 'offline',
        message: 'Transaction saved locally. Will sync when online.'
      };
    }
  }

  static async getTransactionHistory(limit: number = 20, offset: number = 0) {
    try {
      return await ApiClient.get(`/transactions?limit=${limit}&offset=${offset}`);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw error;
    }
  }

  static async voidTransaction(transactionId: string, reason: string) {
    try {
      return await ApiClient.post(`/transactions/${transactionId}/void`, {
        voidReason: reason
      });
    } catch (error) {
      console.error('Error voiding transaction:', error);
      throw error;
    }
  }

  static async calculateTax(subtotal: number, taxRate: number): number {
    return (subtotal * taxRate) / 100;
  }

  static validateTransaction(transaction: TransactionInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!transaction.items || transaction.items.length === 0) {
      errors.push('Transaction must have at least one item');
    }

    if (transaction.total_amount <= 0) {
      errors.push('Transaction total must be greater than 0');
    }

    if (!transaction.payment_method) {
      errors.push('Payment method is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
