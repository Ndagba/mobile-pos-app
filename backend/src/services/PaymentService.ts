import { AppError } from '../utils/errorHandler';

export class PaymentService {
  static async processPayment(
    transactionId: string,
    amount: number,
    method: 'cash' | 'card' | 'mobile_wallet',
    paymentDetails?: any
  ) {
    switch (method) {
      case 'cash':
        return this.processCash(transactionId, amount);
      case 'card':
        return this.processCard(transactionId, amount, paymentDetails);
      case 'mobile_wallet':
        return this.processWallet(transactionId, amount, paymentDetails);
      default:
        throw new AppError(400, 'Invalid payment method');
    }
  }

  private static async processCash(transactionId: string, amount: number) {
    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'cash',
      amount,
      reference: `CASH-${transactionId.substring(0, 8)}`,
      timestamp: new Date().toISOString()
    };
  }

  private static async processCard(
    transactionId: string,
    amount: number,
    details: any
  ) {
    if (!details?.card_token) {
      throw new AppError(400, 'Card token required');
    }
    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'card',
      amount,
      reference: details.card_token,
      masked_pan: '****-****-****-4242',
      timestamp: new Date().toISOString()
    };
  }

  private static async processWallet(
    transactionId: string,
    amount: number,
    details: any
  ) {
    if (!details?.wallet_id) {
      throw new AppError(400, 'Wallet ID required');
    }
    return {
      transaction_id: transactionId,
      status: 'completed',
      method: 'mobile_wallet',
      amount,
      reference: details.wallet_id,
      timestamp: new Date().toISOString()
    };
  }

  static async refundPayment(
    transactionId: string,
    paymentReference: string,
    amount: number,
    reason: string
  ) {
    return {
      transaction_id: transactionId,
      refund_status: 'pending',
      refund_reference: `REFUND-${Date.now()}`,
      amount,
      reason
    };
  }
}