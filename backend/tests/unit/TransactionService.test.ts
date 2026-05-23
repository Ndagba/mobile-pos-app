import { TransactionService } from '../../src/services/TransactionService';
import { PrismaClient } from '@prisma/client';

describe('TransactionService', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createTransaction', () => {
    it('should create a transaction with items', async () => {
      const input = {
        store_id: 'store_001',
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: `hash_test_${Date.now()}`,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash' as const,
        items: []
      };

      const result = await TransactionService.createTransaction(input);

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('completed');
    });

    it('should prevent duplicate transactions via offline_session_hash', async () => {
      const hash = `unique_hash_${Date.now()}`;
      const input = {
        store_id: 'store_001',
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: hash,
        subtotal: 500,
        tax_amount: 50,
        discount_amount: 0,
        total_amount: 550,
        payment_method: 'cash' as const,
        items: []
      };

      // First creation
      const result1 = await TransactionService.createTransaction(input);

      // Second creation with identical input and same hash
      const result2 = await TransactionService.createTransaction(input);

      expect(result1.id).toBe(result2.id);
    });

  });

  describe('getTransactionById', () => {
    it('should return a transaction by id', async () => {
      const created = await TransactionService.createTransaction({
        store_id: 'store_001',
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: `hash_get_${Date.now()}`,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: []
      });

      const result = await TransactionService.getTransactionById(created.id);
      expect(result).toHaveProperty('id', created.id);
      expect(result).toHaveProperty('status', 'completed');
    });

    it('should throw for non-existent transaction', async () => {
      await expect(
        TransactionService.getTransactionById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow();
    });
  });

  describe('getStoreTransactions', () => {
    it('should return paginated transactions', async () => {
      const result = await TransactionService.getStoreTransactions('store_001', 10, 0);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter by date range', async () => {
      const dateFrom = new Date('2020-01-01');
      const dateTo = new Date('2030-01-01');
      const result = await TransactionService.getStoreTransactions('store_001', 10, 0, {
        dateFrom,
        dateTo
      });
      expect(result).toHaveProperty('data');
    });
  });

  describe('getStoreDailySummary', () => {
    it('should return daily summary', async () => {
      const result = await TransactionService.getStoreDailySummary('store_001', new Date());
      expect(result).toHaveProperty('transaction_count');
      expect(result).toHaveProperty('total_revenue');
      expect(result).toHaveProperty('average_transaction');
    });
  });

  describe('generateOfflineSessionHash', () => {
    it('should generate a consistent hash', () => {
      const hash1 = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
      const hash2 = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
      const hash2 = TransactionService.generateOfflineSessionHash('device2', 'tx2', 2000);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('exportTransactions', () => {
    it('should return json format', async () => {
      const result = await TransactionService.exportTransactions(
        'store_001',
        new Date('2020-01-01'),
        new Date('2030-01-01'),
        'json'
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return csv format', async () => {
      const result = await TransactionService.exportTransactions(
        'store_001',
        new Date('2020-01-01'),
        new Date('2030-01-01'),
        'csv'
      );
      expect(Array.isArray(result)).toBe(true);
      if ((result as any[][]).length > 0) {
        expect((result as any[][])[0]).toContain('ID');
      }
    });
  });

  describe('voidTransaction', () => {
    it('should void an existing transaction', async () => {
      const created = await TransactionService.createTransaction({
        store_id: 'store_001',
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: `hash_void_${Date.now()}`,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: []
      });

      const result = await TransactionService.voidTransaction(
        created.id,
        'test void',
        'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'
      );
      expect(result).toHaveProperty('status', 'voided');
    });

    it('should throw for non-existent transaction', async () => {
      await expect(
        TransactionService.voidTransaction(
          '00000000-0000-0000-0000-000000000000',
          'test void',
          'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'
        )
      ).rejects.toThrow();
    });

    it('should throw if already voided', async () => {
      const created = await TransactionService.createTransaction({
        store_id: 'store_001',
        user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
        offline_session_hash: `hash_void2_${Date.now()}`,
        subtotal: 900,
        tax_amount: 100,
        discount_amount: 0,
        total_amount: 1000,
        payment_method: 'cash',
        items: []
      });

      await TransactionService.voidTransaction(
        created.id,
        'first void',
        'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'
      );

      await expect(
        TransactionService.voidTransaction(
          created.id,
          'second void',
          'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'
        )
      ).rejects.toThrow();
    });
  });

  describe('batchSyncTransactions', () => {
    it('should sync multiple transactions', async () => {
      const transactions = [
        {
          store_id: 'store_001',
          user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
          offline_session_hash: `hash_batch1_${Date.now()}`,
          subtotal: 900,
          tax_amount: 100,
          discount_amount: 0,
          total_amount: 1000,
          payment_method: 'cash' as const,
          items: []
        },
        {
          store_id: 'store_001',
          user_id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
          offline_session_hash: `hash_batch2_${Date.now()}`,
          subtotal: 450,
          tax_amount: 50,
          discount_amount: 0,
          total_amount: 500,
          payment_method: 'cash' as const,
          items: []
        }
      ];

      const result = await TransactionService.batchSyncTransactions(transactions);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('errors');
      expect(result.results.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });
  });
});