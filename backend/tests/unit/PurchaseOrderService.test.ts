/**
 * Hermetic unit tests for PurchaseOrderService — Prisma is fully mocked (no DB).
 *
 * Focus: Phase-4B procurement invariants.
 *  - Server computes PO totals (subtotal / per-product tax / total); SERVICE items rejected.
 *  - Status derivation: ordered → partially_received → received (over-receipt counts as received).
 *  - THE load-bearing guarantee: receiving increments quantity_on_hand by the received qty AND
 *    writes exactly one `purchase` InventoryMovement per line (the only new stock-in path).
 *  - receipt_hash idempotency returns the existing receipt without touching stock.
 *  - RBAC 403 (cashier) and cross-store 404 isolation.
 *
 * The shared mockPrisma helper predates procurement, so this file augments the mock with the
 * PO models inside the (hoisted) jest.mock factory — no edit to tests/helpers/mockPrisma.ts.
 */

jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  const model = () => ({
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  });
  m.purchaseOrder = model();
  m.purchaseOrderItem = model();
  m.goodsReceipt = model();
  m.goodsReceiptItem = model();
  m.purchaseInvoice = model();
  m.supplier = model();
  return { __esModule: true, prisma: m, default: m };
});

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { PurchaseOrderService } from '../../src/services/PurchaseOrderService';
import { AppError } from '../../src/utils/errorHandler';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
});

// A product catalog map for computeLineTotals.
function productMap(entries: Array<{ id: string; tax_rate?: number; item_type?: string; name?: string }>) {
  return new Map(
    entries.map((e) => [e.id, { tax_rate: e.tax_rate ?? 0, item_type: e.item_type ?? 'PRODUCT', name: e.name ?? e.id }])
  );
}

describe('PurchaseOrderService.assertCanManage (RBAC)', () => {
  it('allows admin and manager', () => {
    expect(() => PurchaseOrderService.assertCanManage('admin')).not.toThrow();
    expect(() => PurchaseOrderService.assertCanManage('manager')).not.toThrow();
  });

  it('rejects cashier and undefined with 403', () => {
    expect(() => PurchaseOrderService.assertCanManage('cashier')).toThrow(AppError);
    try {
      PurchaseOrderService.assertCanManage('cashier');
    } catch (e: any) {
      expect(e.statusCode).toBe(403);
    }
    expect(() => PurchaseOrderService.assertCanManage(undefined)).toThrow(AppError);
  });
});

describe('PurchaseOrderService.computeLineTotals', () => {
  it('computes per-line total, per-product tax, and header totals', () => {
    const items = [
      { product_id: 'p1', quantity_ordered: 10, unit_cost: 100 }, // 1000 @ 7.5% = 75 tax
      { product_id: 'p2', quantity_ordered: 2, unit_cost: 50 }, //    100 @ 0%   = 0  tax
    ];
    const { lineData, subtotal, taxAmount, totalAmount } = PurchaseOrderService.computeLineTotals(
      items,
      productMap([
        { id: 'p1', tax_rate: 7.5 },
        { id: 'p2', tax_rate: 0 },
      ])
    );

    expect(subtotal).toBe(1100);
    expect(taxAmount).toBe(75);
    expect(totalAmount).toBe(1175);
    expect(lineData).toHaveLength(2);
    expect(Number(lineData[0].line_total)).toBe(1000);
    expect(Number(lineData[0].quantity_ordered)).toBe(10);
    expect(Number(lineData[0].unit_cost)).toBe(100);
  });

  it('rejects a SERVICE item (no stock to order)', () => {
    expect(() =>
      PurchaseOrderService.computeLineTotals(
        [{ product_id: 's1', quantity_ordered: 1, unit_cost: 10 }],
        productMap([{ id: 's1', item_type: 'SERVICE', name: 'Delivery' }])
      )
    ).toThrow(/service/i);
  });

  it('rejects a product missing from the branch catalog', () => {
    expect(() =>
      PurchaseOrderService.computeLineTotals([{ product_id: 'ghost', quantity_ordered: 1, unit_cost: 10 }], productMap([]))
    ).toThrow(/not found/i);
  });

  it('rejects non-positive quantity and negative cost', () => {
    expect(() =>
      PurchaseOrderService.computeLineTotals(
        [{ product_id: 'p1', quantity_ordered: 0, unit_cost: 10 }],
        productMap([{ id: 'p1' }])
      )
    ).toThrow(/greater than 0/i);
    expect(() =>
      PurchaseOrderService.computeLineTotals(
        [{ product_id: 'p1', quantity_ordered: 1, unit_cost: -5 }],
        productMap([{ id: 'p1' }])
      )
    ).toThrow(/0 or more/i);
  });
});

describe('PurchaseOrderService.deriveStatus', () => {
  it('ordered when nothing received', () => {
    expect(PurchaseOrderService.deriveStatus([{ quantity_ordered: 10, quantity_received: 0 }])).toBe('ordered');
  });
  it('partially_received when some but not all lines fulfilled', () => {
    expect(
      PurchaseOrderService.deriveStatus([
        { quantity_ordered: 10, quantity_received: 4 },
        { quantity_ordered: 5, quantity_received: 0 },
      ])
    ).toBe('partially_received');
  });
  it('received when every line meets its ordered qty', () => {
    expect(
      PurchaseOrderService.deriveStatus([
        { quantity_ordered: 10, quantity_received: 10 },
        { quantity_ordered: 5, quantity_received: 5 },
      ])
    ).toBe('received');
  });
  it('received when over-received (received >= ordered on every line)', () => {
    expect(PurchaseOrderService.deriveStatus([{ quantity_ordered: 10, quantity_received: 12 }])).toBe('received');
  });
});

describe('PurchaseOrderService.createPurchaseOrder', () => {
  it('creates a draft with server-computed totals and generated PO number', async () => {
    mockPrisma.supplier.findUnique.mockResolvedValue({ store_id: 'store-1' });
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'p1', tax_rate: 7.5, item_type: 'PRODUCT', name: 'Widget' }]);
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null); // PO number free
    mockPrisma.purchaseOrder.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data, items: [] }));

    const po = await PurchaseOrderService.createPurchaseOrder({
      store_id: 'store-1',
      branch_id: 'branch-1',
      supplier_id: 'sup-1',
      items: [{ product_id: 'p1', quantity_ordered: 10, unit_cost: 100 }],
    });

    const created = mockPrisma.purchaseOrder.create.mock.calls[0][0].data;
    expect(created.status).toBe('draft');
    expect(Number(created.subtotal)).toBe(1000);
    expect(Number(created.tax_amount)).toBe(75);
    expect(Number(created.total_amount)).toBe(1075);
    expect(created.po_number).toMatch(/^PO-\d{8}-/);
    expect(po).toBeDefined();
  });

  it('rejects a supplier from another store (cross-store isolation)', async () => {
    mockPrisma.supplier.findUnique.mockResolvedValue({ store_id: 'other-store' });
    await expect(
      PurchaseOrderService.createPurchaseOrder({
        store_id: 'store-1',
        branch_id: 'branch-1',
        supplier_id: 'sup-1',
        items: [{ product_id: 'p1', quantity_ordered: 1, unit_cost: 10 }],
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('rejects an empty order', async () => {
    await expect(
      PurchaseOrderService.createPurchaseOrder({
        store_id: 'store-1',
        branch_id: 'branch-1',
        supplier_id: 'sup-1',
        items: [],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('PurchaseOrderService.receiveGoods (the core stock-in transaction)', () => {
  const orderedPo = {
    id: 'po-1',
    store_id: 'store-1',
    branch_id: 'branch-1',
    supplier_id: 'sup-1',
    status: 'ordered',
    items: [
      { id: 'poi-1', product_id: 'p1', quantity_ordered: new Prisma.Decimal(10), quantity_received: new Prisma.Decimal(0), unit_cost: new Prisma.Decimal(100) },
      { id: 'poi-2', product_id: 'p2', quantity_ordered: new Prisma.Decimal(5), quantity_received: new Prisma.Decimal(0), unit_cost: new Prisma.Decimal(50) },
    ],
  };

  function primeReceiveMocks(fresh: Array<{ quantity_ordered: number; quantity_received: number }>) {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo });
    mockPrisma.goodsReceipt.findUnique
      .mockResolvedValueOnce(null) // idempotency miss
      .mockResolvedValueOnce({ id: 'gr-1', items: [] }); // final re-read
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr-1' });
    mockPrisma.goodsReceiptItem.create.mockResolvedValue({});
    mockPrisma.inventory.upsert.mockResolvedValue({});
    mockPrisma.inventoryMovement.create.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue(fresh);
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockPrisma.batchTracking.upsert.mockResolvedValue({});
    mockPrisma.purchaseInvoice.create.mockResolvedValue({});
  }

  it('increments quantity_on_hand and writes exactly one `purchase` movement per line', async () => {
    primeReceiveMocks([
      { quantity_ordered: 10, quantity_received: 10 },
      { quantity_ordered: 5, quantity_received: 5 },
    ]);

    const { idempotent } = await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      user_id: 'user-1',
      items: [
        { purchase_order_item_id: 'poi-1', quantity_received: 10 },
        { purchase_order_item_id: 'poi-2', quantity_received: 5 },
      ],
    });

    expect(idempotent).toBe(false);

    // One movement per line, all of type `purchase`, positive qty matching received.
    const moves = mockPrisma.inventoryMovement.create.mock.calls.map((c) => c[0].data);
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.movement_type === 'purchase')).toBe(true);
    expect(moves.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([5, 10]);
    expect(moves.every((m) => m.reference_id === 'gr-1')).toBe(true);

    // Stock incremented by the received qty on each line.
    const upserts = mockPrisma.inventory.upsert.mock.calls.map((c) => c[0]);
    expect(upserts).toHaveLength(2);
    const byProduct = Object.fromEntries(upserts.map((u) => [u.where.product_id, Number(u.update.quantity_on_hand.increment)]));
    expect(byProduct).toEqual({ p1: 10, p2: 5 });

    // Header rolled up to received.
    expect(mockPrisma.purchaseOrder.update.mock.calls[0][0].data.status).toBe('received');
    // No AP invoice unless opted in.
    expect(mockPrisma.purchaseInvoice.create).not.toHaveBeenCalled();
  });

  it('partial receive rolls the header to partially_received', async () => {
    primeReceiveMocks([
      { quantity_ordered: 10, quantity_received: 4 },
      { quantity_ordered: 5, quantity_received: 0 },
    ]);

    await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      items: [{ purchase_order_item_id: 'poi-1', quantity_received: 4 }],
    });

    expect(mockPrisma.inventory.upsert).toHaveBeenCalledTimes(1);
    expect(Number(mockPrisma.inventory.upsert.mock.calls[0][0].update.quantity_on_hand.increment)).toBe(4);
    expect(mockPrisma.purchaseOrder.update.mock.calls[0][0].data.status).toBe('partially_received');
  });

  it('allows over-receipt: stock rises by the real amount and header becomes received', async () => {
    primeReceiveMocks([{ quantity_ordered: 10, quantity_received: 12 }]);

    await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      items: [{ purchase_order_item_id: 'poi-1', quantity_received: 12 }],
    });

    expect(Number(mockPrisma.inventory.upsert.mock.calls[0][0].update.quantity_on_hand.increment)).toBe(12);
    expect(mockPrisma.purchaseOrder.update.mock.calls[0][0].data.status).toBe('received');
  });

  it('opt-in create_invoice writes one unpaid PurchaseInvoice linked to the PO', async () => {
    primeReceiveMocks([{ quantity_ordered: 10, quantity_received: 10 }]);

    await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      create_invoice: true,
      items: [{ purchase_order_item_id: 'poi-1', quantity_received: 10 }],
    });

    expect(mockPrisma.purchaseInvoice.create).toHaveBeenCalledTimes(1);
    const inv = mockPrisma.purchaseInvoice.create.mock.calls[0][0].data;
    expect(inv.status).toBe('unpaid');
    expect(inv.purchase_order_id).toBe('po-1');
    expect(inv.supplier_id).toBe('sup-1');
    expect(Number(inv.amount)).toBe(1000); // 10 × 100 (PO line unit_cost)
  });

  it('upserts a BatchTracking row only when batch_number AND expiry are supplied', async () => {
    primeReceiveMocks([{ quantity_ordered: 10, quantity_received: 3 }]);

    await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      items: [{ purchase_order_item_id: 'poi-1', quantity_received: 3, batch_number: 'LOT-9', expiry_date: '2027-01-01' }],
    });

    expect(mockPrisma.batchTracking.upsert).toHaveBeenCalledTimes(1);
    const batch = mockPrisma.batchTracking.upsert.mock.calls[0][0];
    expect(batch.where.product_id_batch_number.batch_number).toBe('LOT-9');
    expect(Number(batch.update.quantity.increment)).toBe(3);
  });

  it('receipt_hash idempotency returns the existing receipt WITHOUT touching stock', async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo });
    mockPrisma.goodsReceipt.findUnique.mockResolvedValueOnce({ id: 'gr-existing', items: [] });

    const { receipt, idempotent } = await PurchaseOrderService.receiveGoods({
      purchase_order_id: 'po-1',
      store_id: 'store-1',
      authorized_branch_ids: ['branch-1'],
      receipt_hash: 'dupe-hash',
      items: [{ purchase_order_item_id: 'poi-1', quantity_received: 10 }],
    });

    expect(idempotent).toBe(true);
    expect((receipt as any).id).toBe('gr-existing');
    expect(mockPrisma.inventory.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(mockPrisma.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects receiving a PO from another store (404) without touching stock', async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo, store_id: 'other-store' });
    await expect(
      PurchaseOrderService.receiveGoods({
        purchase_order_id: 'po-1',
        store_id: 'store-1',
        authorized_branch_ids: ['branch-1'],
        items: [{ purchase_order_item_id: 'poi-1', quantity_received: 1 }],
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects receiving in an unauthorized branch (403)', async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo });
    await expect(
      PurchaseOrderService.receiveGoods({
        purchase_order_id: 'po-1',
        store_id: 'store-1',
        authorized_branch_ids: ['branch-99'],
        items: [{ purchase_order_item_id: 'poi-1', quantity_received: 1 }],
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects receiving against a draft PO (400)', async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo, status: 'draft' });
    await expect(
      PurchaseOrderService.receiveGoods({
        purchase_order_id: 'po-1',
        store_id: 'store-1',
        authorized_branch_ids: ['branch-1'],
        items: [{ purchase_order_item_id: 'poi-1', quantity_received: 1 }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a received line that does not belong to the PO (400)', async () => {
    mockPrisma.purchaseOrder.findUnique.mockResolvedValue({ ...orderedPo });
    mockPrisma.goodsReceipt.findUnique.mockResolvedValueOnce(null);
    await expect(
      PurchaseOrderService.receiveGoods({
        purchase_order_id: 'po-1',
        store_id: 'store-1',
        authorized_branch_ids: ['branch-1'],
        items: [{ purchase_order_item_id: 'poi-does-not-exist', quantity_received: 1 }],
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
