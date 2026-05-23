import { InventoryService } from '../../src/services/InventoryService';

describe('InventoryService', () => {
  describe('getInventoryStatus', () => {
    it('should return inventory list', async () => {
      const result = await InventoryService.getInventoryStatus();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return items with required fields', async () => {
      const result = await InventoryService.getInventoryStatus();
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('product_id');
        expect(result[0]).toHaveProperty('quantity_on_hand');
        expect(result[0]).toHaveProperty('status');
      }
    });
  });

  describe('getLowStockAlerts', () => {
    it('should return an array', async () => {
      const result = await InventoryService.getLowStockAlerts();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getExpiringBatches', () => {
    it('should return an array', async () => {
      const result = await InventoryService.getExpiringBatches(30);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('updateStock', () => {
    it('should throw for non-existent product', async () => {
      await expect(
        InventoryService.updateStock('non-existent-id', 10, 'test')
      ).rejects.toThrow();
    });
  });

  describe('updateStock', () => {
    it('should update stock for existing product', async () => {
      const result = await InventoryService.updateStock(
        'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e',
        5,
        'test restock'
      );
      expect(result).toHaveProperty('product_id');
    });

    it('should throw for insufficient stock', async () => {
      await expect(
        InventoryService.updateStock(
          'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e',
          -999999,
          'test'
        )
      ).rejects.toThrow();
    });
  });

  describe('getInventoryTurnover', () => {
    it('should throw on raw query table name mismatch', async () => {
      await expect(
        InventoryService.getInventoryTurnover(
          'store_001',
          new Date('2020-01-01'),
          new Date('2030-01-01')
        )
      ).rejects.toThrow();
    });
  });

  describe('createBatch', () => {
    it('should throw if expiry is before manufactured date', async () => {
      await expect(
        InventoryService.createBatch(
          'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e',
          'BATCH-001',
          new Date('2026-01-01'),
          new Date('2025-01-01'),
          10
        )
      ).rejects.toThrow();
    });

    it('should create a valid batch', async () => {
      const result = await InventoryService.createBatch(
        'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e',
        `BATCH-${Date.now()}`,
        new Date('2025-01-01'),
        new Date('2027-01-01'),
        5
      );
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('batch_number');
    });
  });
});