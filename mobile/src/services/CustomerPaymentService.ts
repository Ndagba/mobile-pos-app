import ApiClient from './ApiClient';

export interface PaymentInput {
  customer_id: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface PaymentResult {
  success: boolean;
  payment_id?: string;
  error?: string;
}

export class CustomerPaymentService {
  /**
   * Record a payment for a customer
   * @param customerId Customer ID
   * @param amount Payment amount
   * @param date Payment date (YYYY-MM-DD)
   * @param notes Optional notes
   * @returns Payment result with ID
   */
  static async recordPayment(
    customerId: string,
    amount: number,
    date: string,
    notes?: string
  ): Promise<PaymentResult> {
    try {
      if (!customerId || amount <= 0) {
        return {
          success: false,
          error: 'Invalid customer ID or payment amount',
        };
      }

      const payload: any = {
        amount,
        date,
      };

      if (notes?.trim()) {
        payload.notes = notes.trim();
      }

      const response: any = await ApiClient.post(
        `/customers/${customerId}/payments`,
        payload
      );

      return {
        success: true,
        payment_id: response?.id || response?.payment_id,
      };
    } catch (error: any) {
      console.error('Payment recording error:', error);
      return {
        success: false,
        error:
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Failed to record payment',
      };
    }
  }

  /**
   * Get payment history for a customer
   * @param customerId Customer ID
   * @returns Array of payment records
   */
  static async getPaymentHistory(customerId: string): Promise<any[]> {
    try {
      const response: any = await ApiClient.get(
        `/customers/${customerId}/payments`
      );
      return Array.isArray(response) ? response : response?.data ?? [];
    } catch (error) {
      console.error('Payment history fetch error:', error);
      return [];
    }
  }

  /**
   * Calculate customer balance
   * Balance = total_spent - total_payments
   * @param totalSpent Sum of all customer transaction amounts
   * @param totalPayments Sum of all customer payments
   * @returns Outstanding balance (negative if customer overpaid)
   */
  static calculateBalance(totalSpent: number, totalPayments: number): number {
    return totalSpent - totalPayments;
  }

  /**
   * Check if customer has available credit
   * @param creditLimit Customer's credit limit (null = unlimited)
   * @param currentBalance Current outstanding balance
   * @param transactionAmount Amount of pending transaction
   * @returns true if transaction can proceed, false if would exceed limit
   */
  static canChargeCustomer(
    creditLimit: number | null | undefined,
    currentBalance: number,
    transactionAmount: number
  ): boolean {
    // If no credit limit, allow unlimited charges
    if (!creditLimit) return true;

    // Check if new balance would exceed limit
    const newBalance = currentBalance + transactionAmount;
    return newBalance <= creditLimit;
  }

  /**
   * Get remaining credit for customer
   * @param creditLimit Customer's credit limit (null = unlimited)
   * @param currentBalance Current outstanding balance
   * @returns Available credit amount (null if unlimited)
   */
  static getAvailableCredit(
    creditLimit: number | null | undefined,
    currentBalance: number
  ): number | null {
    if (!creditLimit) return null; // Unlimited credit
    return Math.max(0, creditLimit - currentBalance);
  }
}

export default CustomerPaymentService;
