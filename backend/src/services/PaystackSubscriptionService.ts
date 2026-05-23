import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface PaystackCustomerResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    customer_code: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface PaystackChargeResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    customer: {
      customer_code: string;
    };
  };
}

interface PaystackAuthorizationResponse {
  status: boolean;
  message: string;
  data: {
    authorization_code: string;
    account_number: string;
    receiver_bank_account_number: string;
    receiver_bank: string;
  };
}

export class PaystackSubscriptionService {
  private client: AxiosInstance;
  private secretKey: string;
  private baseUrl = 'https://api.paystack.co';

  constructor(secretKey: string) {
    this.secretKey = secretKey;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create or get a customer in Paystack
   * Returns customer code for future operations
   */
  async createOrGetPaystackCustomer(
    email: string,
    firstName?: string,
    lastName?: string,
    phone?: string
  ): Promise<{
    customer_code: string;
    customer_id: number;
  }> {
    try {
      const response = await this.client.post<PaystackCustomerResponse>('/customer', {
        email,
        first_name: firstName || '',
        last_name: lastName || '',
        phone: phone || '',
      });

      if (!response.data.status) {
        throw new Error(`Failed to create customer: ${response.data.message}`);
      }

      return {
        customer_code: response.data.data.customer_code,
        customer_id: response.data.data.id,
      };
    } catch (error) {
      console.error('Error creating Paystack customer:', error);
      throw error;
    }
  }

  /**
   * Initialize a transaction (payment)
   * This is the first step for collecting card details
   */
  async initializeTransaction(
    amount: number, // amount in kobo (smallest unit)
    email: string,
    metadata?: Record<string, any>
  ): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    try {
      const response = await this.client.post('/transaction/initialize', {
        amount: Math.round(amount * 100), // Convert ₦ to kobo
        email,
        metadata: metadata || {},
      });

      if (!response.data.status) {
        throw new Error(`Failed to initialize transaction: ${response.data.message}`);
      }

      return {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference,
      };
    } catch (error) {
      console.error('Error initializing Paystack transaction:', error);
      throw error;
    }
  }

  /**
   * Verify transaction and get authorization code
   * Call this after customer completes payment
   */
  async verifyTransaction(reference: string): Promise<{
    status: string;
    authorization_code: string;
    customer_code: string;
    amount: number;
  }> {
    try {
      const response = await this.client.get(`/transaction/verify/${reference}`);

      if (!response.data.status) {
        throw new Error(`Verification failed: ${response.data.message}`);
      }

      const data = response.data.data;

      return {
        status: data.status,
        authorization_code: data.authorization.authorization_code,
        customer_code: data.customer.customer_code,
        amount: data.amount / 100, // Convert kobo back to ₦
      };
    } catch (error) {
      console.error('Error verifying Paystack transaction:', error);
      throw error;
    }
  }

  /**
   * Charge a customer using stored authorization code
   * For recurring subscription charges
   */
  async chargeRecurring(
    authorizationCode: string,
    email: string,
    amount: number, // in ₦
    metadata?: Record<string, any>
  ): Promise<{
    reference: string;
    status: string;
    amount: number;
  }> {
    try {
      const response = await this.client.post<PaystackChargeResponse>('/charge', {
        authorization_code: authorizationCode,
        email,
        amount: Math.round(amount * 100), // Convert ₦ to kobo
        metadata: metadata || {},
      });

      if (!response.data.status) {
        throw new Error(`Charge failed: ${response.data.message}`);
      }

      return {
        reference: response.data.data.reference,
        status: response.data.data.status,
        amount: response.data.data.amount / 100, // Convert back to ₦
      };
    } catch (error) {
      console.error('Error charging Paystack customer:', error);
      throw error;
    }
  }

  /**
   * Create a payment plan (for future use)
   * Paystack allows setting up recurring payment plans
   */
  async createPaymentPlan(
    name: string,
    amount: number, // monthly amount in ₦
    interval: 'monthly' | 'quarterly' | 'biannually' | 'annually'
  ): Promise<{
    plan_code: string;
    plan_id: number;
  }> {
    try {
      const response = await this.client.post('/plan', {
        name,
        amount: Math.round(amount * 100), // Convert ₦ to kobo
        interval,
      });

      if (!response.data.status) {
        throw new Error(`Failed to create plan: ${response.data.message}`);
      }

      return {
        plan_code: response.data.data.plan_code,
        plan_id: response.data.data.id,
      };
    } catch (error) {
      console.error('Error creating Paystack payment plan:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * Always call this first when receiving a webhook from Paystack
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const hash = crypto.createHmac('sha512', this.secretKey).update(body).digest('hex');
    return hash === signature;
  }

  /**
   * Get transaction details
   */
  async getTransaction(reference: string): Promise<any> {
    try {
      const response = await this.client.get(`/transaction/${reference}`);
      return response.data.data;
    } catch (error) {
      console.error('Error getting Paystack transaction:', error);
      throw error;
    }
  }

  /**
   * Refund a transaction
   */
  async refundTransaction(reference: string, amount?: number): Promise<{
    reference: string;
    status: string;
  }> {
    try {
      const response = await this.client.post(`/refund`, {
        transaction: reference,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount provided
      });

      if (!response.data.status) {
        throw new Error(`Refund failed: ${response.data.message}`);
      }

      return {
        reference: response.data.data.reference,
        status: response.data.data.status,
      };
    } catch (error) {
      console.error('Error refunding Paystack transaction:', error);
      throw error;
    }
  }

  /**
   * Get customer details
   */
  async getCustomer(customerCode: string): Promise<any> {
    try {
      const response = await this.client.get(`/customer/${customerCode}`);

      if (!response.data.status) {
        throw new Error(`Failed to get customer: ${response.data.message}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Error getting Paystack customer:', error);
      throw error;
    }
  }

  /**
   * List customer transactions
   */
  async listCustomerTransactions(email: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await this.client.get('/transaction', {
        params: {
          customer: email,
          perPage: limit,
        },
      });

      if (!response.data.status) {
        return [];
      }

      return response.data.data;
    } catch (error) {
      console.error('Error listing customer transactions:', error);
      return [];
    }
  }

  /**
   * Disable authorization (revoke customer's stored card)
   * For security or account changes
   */
  async disableAuthorization(authorizationCode: string): Promise<{
    status: string;
    message: string;
  }> {
    try {
      const response = await this.client.post(`/authorization/disable`, {
        authorization_code: authorizationCode,
      });

      if (!response.data.status) {
        throw new Error(`Failed to disable authorization: ${response.data.message}`);
      }

      return {
        status: response.data.status,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Error disabling Paystack authorization:', error);
      throw error;
    }
  }
}

// Singleton instance
let paystackService: PaystackSubscriptionService | null = null;

export function initializePaystackService(secretKey: string): PaystackSubscriptionService {
  if (!paystackService) {
    paystackService = new PaystackSubscriptionService(secretKey);
  }
  return paystackService;
}

export function getPaystackService(): PaystackSubscriptionService {
  if (!paystackService) {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      throw new Error('PAYSTACK_SECRET_KEY environment variable not set');
    }
    paystackService = new PaystackSubscriptionService(key);
  }
  return paystackService;
}
