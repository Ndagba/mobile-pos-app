/**
 * Hermetic unit tests for InventoryService — Prisma/Redis mocked (no DB, no cache).
 *
 * Phase-1 invariant: SERVICE products have no physical inventory, so the stock
 * mutators must reject them with AppError(400) and never touch the inventory table.
 * PRODUCT rows follow the normal happy path.
 */

jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  return { __esModule: true, prisma: m, default: m };
});
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/lib/redis', () => {
  const noop = jest.fn(async () => null);
  const stub = { get: noop, set: noop, setex: noop, del: noop, quit: noop, on: jest.fn() };
  return { __esModule: true, redis: stub, default: stub };
});

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { InventoryService } from '../../src/services/InventoryService';
import { AppError } from '../../src/utils/errorHandler';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
});

async function catchErr(p: Promise<unknown>): Promise<any> {
  return p.then(() => { throw new Error('expected rejection'); }, (e) => e);
}

describe('InventoryService.updateStock', () => {
  it('rejects a SERVICE and never touches inventory', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'SERVICE' });

    const err = await catchErr(InventoryService.updateStock('svc-1', 5, 'restock'));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/physical inventory/i);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it('increments stock for a PRODUCT', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'PRODUCT' });
    mockPrisma.inventory.findUnique.mockResolvedValue({ quantity_on_hand: new Prisma.Decimal('10') });
    mockPrisma.inventory.update.mockResolvedValue({ quantity_on_hand: new Prisma.Decimal('15') });

    await InventoryService.updateStock('prod-1', 5, 'restock');

    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { quantity_on_hand: { increment: 5 }, last_stock_check: expect.any(Date) },
    });
  });

  it('rejects an adjustment that would drive stock negative', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'PRODUCT' });
    mockPrisma.inventory.findUnique.mockResolvedValue({ quantity_on_hand: new Prisma.Decimal('1') });

    const err = await catchErr(InventoryService.updateStock('prod-1', -5, 'shrinkage'));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });
});

describe('InventoryService.updateThreshold', () => {
  it('rejects a SERVICE and never touches inventory', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'SERVICE' });

    const err = await catchErr(InventoryService.updateThreshold('svc-1', 7));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it('sets the low-stock threshold for a PRODUCT', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'PRODUCT' });
    mockPrisma.inventory.findUnique.mockResolvedValue({ quantity_on_hand: new Prisma.Decimal('10') });
    mockPrisma.inventory.update.mockResolvedValue({});

    await InventoryService.updateThreshold('prod-1', 7);

    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { low_stock_threshold: 7 },
    });
  });
});

describe('InventoryService.createBatch', () => {
  const mfg = new Date('2026-01-01');
  const exp = new Date('2026-12-31');

  it('rejects a SERVICE and never creates a batch', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'SERVICE' });

    const err = await catchErr(InventoryService.createBatch('svc-1', 'B1', mfg, exp, 10));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/batch tracking/i);
    expect(mockPrisma.batchTracking.create).not.toHaveBeenCalled();
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it('creates a batch and increments inventory for a PRODUCT', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'PRODUCT' });
    mockPrisma.batchTracking.create.mockResolvedValue({ id: 'batch-1' });
    mockPrisma.inventory.update.mockResolvedValue({});

    await InventoryService.createBatch('prod-1', 'B1', mfg, exp, 10, 'A1');

    expect(mockPrisma.batchTracking.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.batchTracking.create.mock.calls[0][0].data).toMatchObject({
      product_id: 'prod-1',
      batch_number: 'B1',
      quantity: 10,
    });
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { quantity_on_hand: { increment: 10 } },
    });
  });

  it('rejects an expiry that is not after the manufactured date', async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ item_type: 'PRODUCT' });

    const err = await catchErr(InventoryService.createBatch('prod-1', 'B1', exp, mfg, 10));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(mockPrisma.batchTracking.create).not.toHaveBeenCalled();
  });
});
