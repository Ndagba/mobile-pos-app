import ApiClient from './ApiClient';
import DatabaseService from './DatabaseService';
import { SyncManager } from './SyncManager';
import { generateId } from '../utils/generateId';

export interface TransactionInput {
  store_id: string;
  user_id: string;
  customer_id?: string;
  branch_id?: string | null;
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
    const transactionId = generateId();

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
        const response = (await ApiClient.post('/transactions', {
          ...transaction,
          items: input.items
        })) as any;

        // ApiClient returns an optimistic echo of the request body when it can't
        // reach the server (network error). A genuine server response carries a
        // server-generated receipt_number — its absence means we're actually
        // offline and the sale has NOT been persisted on the backend yet.
        const confirmedByServer = !!response?.receipt_number;

        await DatabaseService.createTransaction({
          ...transaction,
          is_sync_online: confirmedByServer,
          items: input.items
        });

        if (!confirmedByServer) {
          return {
            success: true,
            transaction_id: transactionId,
            status: 'queued_for_sync',
            message: 'Saved offline. Will sync when online.'
          };
        }

        return {
          success: true,
          transaction_id: response.id || transactionId,
          receipt_number: response.receipt_number,
          status: 'completed'
        };
      } catch (error: any) {
        console.error('Error creating online transaction:', error);

        // The server responded with an error (e.g. subscription inactive,
        // validation failure). This is a real rejection, NOT an offline
        // condition — surface it to the cashier instead of faking a sale.
        if (error?.response) {
          throw error;
        }

        // Genuine network error (no response): queue locally for later sync.
        await DatabaseService.createTransaction({
          ...transaction,
          is_sync_online: false,
          items: input.items
        });

        return {
          success: true,
          transaction_id: transactionId,
          status: 'queued_for_sync',
          message: 'Saved offline. Will sync when online.'
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

  static async calculateTax(subtotal: number, taxRate: number): Promise<number> {
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
