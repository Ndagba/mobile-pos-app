/**
 * Hermetic unit tests for TransactionService — Prisma is fully mocked (no DB).
 *
 * Focus: Phase-1 invariants around Product vs. Service and Decimal(15,4) quantities.
 *  - item_type is resolved from the authoritative catalog record (the mocked product);
 *  - PRODUCT lines move stock + write one InventoryMovement; SERVICE lines do neither;
 *  - decimal quantities flow through untruncated;
 *  - void/refund restore PRODUCT lines only; refund also reverses customer stats;
 *  - offline_session_hash is idempotent.
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

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { TransactionService } from '../../src/services/TransactionService';
import { AppError } from '../../src/utils/errorHandler';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;

type ItemOverride = Partial<{
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount_amount: number;
  line_total: number;
  batch_id: string;
}>;

function makeItem(over: ItemOverride = {}) {
  return {
    product_id: 'prod-1',
    quantity: 1,
    unit_price: 100,
    tax_amount: 0,
    discount_amount: 0,
    line_total: 100,
    ...over,
  };
}

function makeInput(over: Record<string, any> = {}) {
  return {
    store_id: 'store-1',
    branch_id: 'branch-1',
    user_id: 'user-1',
    offline_session_hash: 'hash-1',
    subtotal: 100,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: 100,
    payment_method: 'cash' as const,
    items: [],
    ...over,
  };
}

/** A PRODUCT catalog row (with inventory) for `tx.product.findUnique`. */
function productRow(over: Record<string, any> = {}) {
  return {
    id: 'prod-1',
    name: 'Widget',
    branch_id: 'branch-1',
    item_type: 'PRODUCT',
    inventory: { quantity_on_hand: new Prisma.Decimal('100') },
    ...over,
  };
}

/** A SERVICE catalog row (no inventory). */
function serviceRow(over: Record<string, any> = {}) {
  return {
    id: 'svc-1',
    name: 'Installation',
    branch_id: 'branch-1',
    item_type: 'SERVICE',
    inventory: null,
    ...over,
  };
}

/** Route `product.findUnique({ where: { id } })` through a lookup table. */
function seedCatalog(rows: Record<string, any>) {
  mockPrisma.product.findUnique.mockImplementation((args: any) =>
    Promise.resolve(rows[args?.where?.id] ?? null)
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  // Idempotency guard defaults to "no existing tx" so createTransaction proceeds.
  mockPrisma.transaction.findFirst.mockResolvedValue(null);
  mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-new', status: 'completed' });
});

describe('TransactionService.createTransaction', () => {
  it('creates a transaction with no items and returns it', async () => {
    const result: any = await TransactionService.createTransaction(makeInput());

    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('id', 'tx-new');
    expect(result.status).toBe('completed');
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });

  it('is idempotent: an existing offline_session_hash returns the existing tx without a second create', async () => {
    mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'existing-tx' });
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'existing-tx', status: 'completed' });

    const result: any = await TransactionService.createTransaction(makeInput());

    expect(result.id).toBe('existing-tx');
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-tx' } })
    );
  });

  it('mixed cart: moves stock + writes a movement for the PRODUCT line, nothing for the SERVICE line', async () => {
    seedCatalog({ 'prod-1': productRow(), 'svc-1': serviceRow() });

    await TransactionService.createTransaction(
      makeInput({
        items: [
          makeItem({ product_id: 'prod-1', quantity: 2 }),
          makeItem({ product_id: 'svc-1', quantity: 1 }),
        ],
      })
    );

    // Both lines are recorded...
    expect(mockPrisma.transactionItem.create).toHaveBeenCalledTimes(2);
    // ...but only the PRODUCT moves inventory.
    expect(mockPrisma.inventory.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { quantity_on_hand: { decrement: 2 } },
    });
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledTimes(1);
    const movement = mockPrisma.inventoryMovement.create.mock.calls[0][0].data;
    expect(movement).toMatchObject({
      product_id: 'prod-1',
      movement_type: 'sale',
      quantity: -2,
    });
    // The service product_id never touched inventory.
    expect(mockPrisma.inventory.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { product_id: 'svc-1' } })
    );
  });

  it.each([1.5, 0.25])('passes a decimal quantity (%p) through decrement and movement untruncated', async (qty) => {
    seedCatalog({ 'prod-1': productRow({ inventory: { quantity_on_hand: new Prisma.Decimal('10') } }) });

    await TransactionService.createTransaction(
      makeInput({ items: [makeItem({ product_id: 'prod-1', quantity: qty })] })
    );

    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { quantity_on_hand: { decrement: qty } },
    });
    expect(mockPrisma.inventoryMovement.create.mock.calls[0][0].data.quantity).toBe(-qty);
  });

  it('rejects when a PRODUCT line exceeds available stock, without moving inventory', async () => {
    seedCatalog({ 'prod-1': productRow({ inventory: { quantity_on_hand: new Prisma.Decimal('1') } }) });

    const err: any = await TransactionService.createTransaction(
      makeInput({ items: [makeItem({ product_id: 'prod-1', quantity: 5 })] })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/insufficient stock/i);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
    expect(mockPrisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('does NOT gate a line on branch: product_id already pins the branch, so a cross-branch product still sells', async () => {
    seedCatalog({ 'prod-1': productRow({ branch_id: 'other-branch' }) });

    await TransactionService.createTransaction(
      makeInput({ items: [makeItem({ product_id: 'prod-1', quantity: 1 })] })
    );

    // The line is recorded and stock is deducted from that product's own inventory.
    expect(mockPrisma.transactionItem.create).toHaveBeenCalled();
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { product_id: 'prod-1' },
      data: { quantity_on_hand: { decrement: 1 } },
    });
  });

  it('rejects a line whose product does not exist', async () => {
    seedCatalog({}); // findUnique → null

    await expect(
      TransactionService.createTransaction(
        makeInput({ items: [makeItem({ product_id: 'ghost', quantity: 1 })] })
      )
    ).rejects.toThrow(/unavailable product/i);
  });

  it('rejects a non-positive line quantity', async () => {
    seedCatalog({ 'prod-1': productRow() });

    await expect(
      TransactionService.createTransaction(
        makeInput({ items: [makeItem({ product_id: 'prod-1', quantity: 0 })] })
      )
    ).rejects.toThrow(/positive number/i);
  });

  it('updates customer stats when a customer is attached', async () => {
    seedCatalog({ 'prod-1': productRow() });

    await TransactionService.createTransaction(
      makeInput({
        customer_id: 'cust-1',
        total_amount: 236,
        items: [makeItem({ product_id: 'prod-1', quantity: 1 })],
      })
    );

    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: expect.objectContaining({
        total_spent: { increment: 236 },
        transaction_count: { increment: 1 },
        last_transaction_at: expect.any(Date),
      }),
    });
  });

  it('writes an audit log only when a discount is applied', async () => {
    seedCatalog({ 'prod-1': productRow() });

    await TransactionService.createTransaction(
      makeInput({ items: [makeItem({ product_id: 'prod-1' })] })
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    await TransactionService.createTransaction(
      makeInput({
        offline_session_hash: 'hash-2',
        discount_amount: 10,
        items: [makeItem({ product_id: 'prod-1' })],
      })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('APPLY_DISCOUNT');
  });
});

describe('TransactionService.voidTransaction', () => {
  function voidableTx(over: Record<string, any> = {}) {
    return {
      id: 'tx-1',
      status: 'completed',
      store_id: 'store-1',
      branch_id: 'branch-1',
      total_amount: new Prisma.Decimal('236'),
      customer_id: null,
      transaction_items: [
        { product_id: 'prod-1', quantity: new Prisma.Decimal('2'), product: { item_type: 'PRODUCT' } },
        { product_id: 'svc-1', quantity: new Prisma.Decimal('1'), product: { item_type: 'SERVICE' } },
      ],
      ...over,
    };
  }

  it('restores inventory for PRODUCT lines only and marks the tx voided', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(voidableTx());

    const result = await TransactionService.voidTransaction('tx-1', 'wrong item', 'user-1');

    expect(result).toEqual({ status: 'voided', transaction_id: 'tx-1' });
    expect(mockPrisma.inventory.update).toHaveBeenCalledTimes(1);
    const call = mockPrisma.inventory.update.mock.calls[0][0];
    expect(call.where).toEqual({ product_id: 'prod-1' });
    expect(Number(call.data.quantity_on_hand.increment)).toBe(2);
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tx-1' }, data: expect.objectContaining({ status: 'voided' }) })
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('throws for a non-existent transaction', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(null);
    await expect(TransactionService.voidTransaction('nope', 'r', 'user-1')).rejects.toThrow(/not found/i);
  });

  it('throws when the transaction is already voided', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(voidableTx({ status: 'voided' }));
    await expect(TransactionService.voidTransaction('tx-1', 'r', 'user-1')).rejects.toThrow(/already voided/i);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
  });
});

describe('TransactionService.refundTransaction', () => {
  function refundableTx(over: Record<string, any> = {}) {
    return {
      id: 'tx-1',
      status: 'completed',
      store_id: 'store-1',
      branch_id: 'branch-1',
      total_amount: new Prisma.Decimal('236'),
      customer_id: 'cust-1',
      transaction_items: [
        { product_id: 'prod-1', quantity: new Prisma.Decimal('2'), product: { item_type: 'PRODUCT' } },
        { product_id: 'svc-1', quantity: new Prisma.Decimal('1'), product: { item_type: 'SERVICE' } },
      ],
      ...over,
    };
  }

  it('restores PRODUCT stock only and reverses customer stats', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(refundableTx());

    const result = await TransactionService.refundTransaction('tx-1', 'customer return', 'user-1');

    expect(result).toEqual({ status: 'refunded', transaction_id: 'tx-1' });
    expect(mockPrisma.inventory.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.inventory.update.mock.calls[0][0].where).toEqual({ product_id: 'prod-1' });
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { total_spent: { decrement: refundableTx().total_amount }, transaction_count: { decrement: 1 } },
    });
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'refunded' }) })
    );
  });

  it('does not touch customer stats when there is no customer', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(refundableTx({ customer_id: null }));
    await TransactionService.refundTransaction('tx-1', 'r', 'user-1');
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('throws when already refunded or voided', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(refundableTx({ status: 'refunded' }));
    await expect(TransactionService.refundTransaction('tx-1', 'r', 'user-1')).rejects.toThrow(/already refunded/i);
  });
});

describe('TransactionService.generateOfflineSessionHash', () => {
  it('is deterministic for identical inputs', () => {
    const a = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
    const b = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different inputs', () => {
    const a = TransactionService.generateOfflineSessionHash('device1', 'tx1', 1000);
    const b = TransactionService.generateOfflineSessionHash('device2', 'tx2', 2000);
    expect(a).not.toBe(b);
  });
});

describe('TransactionService.getStoreDailySummary', () => {
  it('derives count, revenue and average from the aggregate', async () => {
    mockPrisma.transaction.aggregate.mockResolvedValue({
      _count: { id: 2 },
      _sum: { total_amount: new Prisma.Decimal('200') },
    });

    const summary = await TransactionService.getStoreDailySummary('store-1', new Date('2026-08-19'));

    expect(summary.transaction_count).toBe(2);
    expect(Number(summary.total_revenue)).toBe(200);
    expect(summary.average_transaction).toBe(100);
  });
});
