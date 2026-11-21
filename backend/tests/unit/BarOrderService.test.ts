/**
 * BarOrderService — Bar/Lounge Phase 2. Hermetic: Prisma is mocked.
 * Real concurrency (two controllers racing) is exercised in the live E2E script;
 * here we pin the conditional-claim behaviour and every rule around it.
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
import { BarOrderService, priceLines } from '../../src/services/BarOrderService';
import { TransactionService } from '../../src/services/TransactionService';
import { AppError } from '../../src/utils/errorHandler';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;
const D = (n: number | string) => new Prisma.Decimal(n);

const attendant = { userId: 'att-1', role: 'cashier', storeId: 'store_001', branchId: 'branch_001' };
const otherAttendant = { userId: 'att-2', role: 'cashier', storeId: 'store_001', branchId: 'branch_001' };
const controller = { userId: 'ctl-1', role: 'cashier', storeId: 'store_001', branchId: 'branch_001' };
const manager = { userId: 'mgr-1', role: 'manager', storeId: 'store_001', branchId: 'branch_001' };
const admin = { userId: 'adm-1', role: 'admin', storeId: 'store_001', branchId: 'branch_001' };
const BRANCHES = ['branch_001'];

function orderRow(over: Record<string, any> = {}) {
  return {
    id: 'ord-1',
    store_id: 'store_001',
    branch_id: 'branch_001',
    order_number: 'B-20261117-0001',
    client_ref: 'ref-12345678',
    status: 'submitted',
    initiated_by_user_id: 'att-1',
    accepted_by_user_id: null,
    fulfilled_by_user_id: null,
    accepted_at: null,
    subtotal: D(1300),
    tax_amount: D(0),
    discount_amount: D(0),
    total_amount: D(1300),
    fulfilled_total: null,
    customer_payment_method: 'cash',
    customer_payment_splits: null,
    customer_payment_ref: null,
    business_date: null,
    submitted_at: new Date(),
    items: [
      { id: 'it-1', product_id: 'goldberg', quantity_requested: D(2), quantity_fulfilled: null, unit_price: D(500), tax_rate: D(0), line_total: D(1000), product: { name: 'Goldberg', sku: 'G', item_type: 'PRODUCT' } },
      { id: 'it-2', product_id: 'water', quantity_requested: D(2), quantity_fulfilled: null, unit_price: D(150), tax_rate: D(0), line_total: D(300), product: { name: 'Water', sku: 'W', item_type: 'PRODUCT' } },
    ],
    initiated_by: { id: 'att-1', first_name: 'John', last_name: null },
    accepted_by: null,
    fulfilled_by: null,
    transaction: null,
    ...over,
  };
}

const expectError = async (p: Promise<unknown>, status: number, msg?: RegExp) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
  if (msg) expect(err.message).toMatch(msg);
  return err;
};

let postSaleSpy: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  mockPrisma.storeSetting.findUnique.mockResolvedValue(null); // defaults: 06:00 Lagos, no forced declaration
  mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow());
  mockPrisma.barOrder.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.barOrder.count.mockResolvedValue(0);
  postSaleSpy = jest.spyOn(TransactionService, 'postSale').mockResolvedValue({ id: 'tx-1' } as any);
});

afterEach(() => postSaleSpy.mockRestore());

describe('priceLines (house rule: line_total excl. tax, rounded sums)', () => {
  it('prices the brief example: 2 Goldberg, 1 Hero, 2 water', () => {
    const r = priceLines([
      { unit_price: 500, tax_rate: 0, quantity: 2 },
      { unit_price: 550, tax_rate: 0, quantity: 1 },
      { unit_price: 150, tax_rate: 0, quantity: 2 },
    ]);
    expect(r).toMatchObject({ subtotal: 1850, tax_amount: 0, total_amount: 1850 });
    expect(r.priced.map((p) => p.line_total)).toEqual([1000, 550, 300]);
  });

  it('applies per-line VAT and rounds once on the sums', () => {
    const r = priceLines([
      { unit_price: 333.33, tax_rate: 7.5, quantity: 3 },
      { unit_price: 0.1, tax_rate: 7.5, quantity: 1 },
    ]);
    expect(r.subtotal).toBe(1000.09);
    expect(r.tax_amount).toBe(75.01);
    expect(r.total_amount).toBe(1075.1);
  });
});

describe('submit', () => {
  const products = [
    { id: 'goldberg', name: 'Goldberg', effective_price: D(500), tax_rate: D(0), item_type: 'PRODUCT', inventory: { quantity_on_hand: D(1), quantity_reserved: D(0) } },
    { id: 'water', name: 'Water', effective_price: D(150), tax_rate: D(0), item_type: 'PRODUCT', inventory: { quantity_on_hand: D(50), quantity_reserved: D(0) } },
  ];

  beforeEach(() => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(null); // no idempotent replay
    mockPrisma.product.findMany.mockResolvedValue(products);
    mockPrisma.barOrder.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ord-new', ...data }));
    mockPrisma.barOrder.findUniqueOrThrow.mockResolvedValue(orderRow({ id: 'ord-new' }));
  });

  const body = (over: Record<string, any> = {}) => ({
    client_ref: 'device-ref-0001',
    items: [
      { product_id: 'goldberg', quantity: 1, unit_price: 1 /* ignored */ },
      { product_id: 'goldberg', quantity: 1 }, // duplicates merge
      { product_id: 'water', quantity: 2 },
    ],
    ...over,
  });

  it('prices from the catalog (client prices ignored), merges duplicates, attributes to the caller', async () => {
    await BarOrderService.submit(attendant, 'branch_001', body());
    const data = mockPrisma.barOrder.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      store_id: 'store_001',
      branch_id: 'branch_001',
      status: 'submitted',
      initiated_by_user_id: 'att-1',
      subtotal: 1300,
      total_amount: 1300,
      customer_payment_method: 'cash',
    });
    expect(data.order_number).toMatch(/^B-\d{8}-0001$/);
    const lines = data.items.create;
    expect(lines.find((l: any) => l.product_id === 'goldberg')).toMatchObject({ quantity_requested: 2, unit_price: 500, line_total: 1000 });
    expect(mockPrisma.product.findMany.mock.calls[0][0].where).toMatchObject({ branch_id: 'branch_001', is_active: true });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BAR_ORDER_SUBMITTED');
  });

  it('warns (does not block) when the bar looks short — no reservation (D5)', async () => {
    const r = await BarOrderService.submit(attendant, 'branch_001', body());
    expect(r.stock_warnings).toEqual([{ product_id: 'goldberg', product_name: 'Goldberg', requested: 2, available: 1 }]);
    expect(mockPrisma.inventory.update).not.toHaveBeenCalled();
    expect(mockPrisma.inventory.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent on client_ref for the same attendant', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ client_ref: 'device-ref-0001' }));
    const r = await BarOrderService.submit(attendant, 'branch_001', body());
    expect(r.replayed).toBe(true);
    expect(mockPrisma.barOrder.create).not.toHaveBeenCalled();
  });

  it('refuses a client_ref owned by someone else', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ initiated_by_user_id: 'att-2' }));
    await expectError(BarOrderService.submit(attendant, 'branch_001', body()), 409);
  });

  it('rejects products outside the branch, bad quantities, and split at submit', async () => {
    mockPrisma.product.findMany.mockResolvedValue([products[1]]);
    await expectError(BarOrderService.submit(attendant, 'branch_001', body()), 400, /not available/);
    mockPrisma.product.findMany.mockResolvedValue(products);
    await expectError(BarOrderService.submit(attendant, 'branch_001', body({ items: [{ product_id: 'water', quantity: 0 }] })), 400);
    await expectError(BarOrderService.submit(attendant, 'branch_001', body({ customer_payment_method: 'split' })), 400, /split/);
    await expectError(BarOrderService.submit(attendant, 'branch_001', body({ client_ref: 'short' })), 400);
  });

  it('requires a payment method when the store demands declaration', async () => {
    mockPrisma.storeSetting.findUnique.mockResolvedValue({ bar_business_day_cutoff_hour: 6, bar_timezone: 'Africa/Lagos', bar_require_payment_declaration: true });
    await expectError(BarOrderService.submit(attendant, 'branch_001', body()), 400, /paying/);
    await BarOrderService.submit(attendant, 'branch_001', body({ customer_payment_method: 'transfer' }));
    expect(mockPrisma.barOrder.create.mock.calls[0][0].data.customer_payment_method).toBe('transfer');
  });

  it('retries the order number on a collision', async () => {
    const collision = Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['store_id', 'order_number'] } });
    mockPrisma.barOrder.create.mockRejectedValueOnce(collision).mockImplementation(({ data }: any) => Promise.resolve({ id: 'ord-new', ...data }));
    await BarOrderService.submit(attendant, 'branch_001', body());
    expect(mockPrisma.barOrder.create.mock.calls[1][0].data.order_number).toMatch(/-0002$/);
  });
});

describe('fulfil', () => {
  it('posts ONE sale attributed to the Attendant, released by the Controller, linked to the order', async () => {
    await BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {});
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(postSaleSpy).toHaveBeenCalledTimes(1);
    const sale = postSaleSpy.mock.calls[0][1];
    expect(sale).toMatchObject({
      user_id: 'att-1', // seller of record from the ORDER row
      fulfilled_by_user_id: 'ctl-1',
      sales_order_id: 'ord-1',
      offline_session_hash: 'bar-order:ord-1',
      store_id: 'store_001',
      branch_id: 'branch_001',
      subtotal: 1300,
      total_amount: 1300,
      payment_method: 'cash',
    });
    expect(sale.business_date).toBeInstanceOf(Date);
    expect(sale.items).toHaveLength(2);
    // conditional claim: status in the WHERE clause
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'ord-1', status: { in: ['submitted', 'accepted'] } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BAR_ORDER_FULFILLED');
  });

  it('partial release: quantities go down with a reason, totals follow, zero lines are dropped', async () => {
    await BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {
      lines: [{ item_id: 'it-1', quantity: 1 }, { item_id: 'it-2', quantity: 0 }],
      reduction_reason: 'Only one Goldberg left',
    });
    const sale = postSaleSpy.mock.calls[0][1];
    expect(sale.total_amount).toBe(500);
    expect(sale.items).toEqual([expect.objectContaining({ product_id: 'goldberg', quantity: 1, line_total: 500 })]);
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].data).toMatchObject({ fulfilled_total: 500, closed_reason: 'Only one Goldberg left' });
    expect(mockPrisma.barOrderItem.update).toHaveBeenCalledWith({ where: { id: 'it-2' }, data: { quantity_fulfilled: 0 } });
  });

  it('never releases more than ordered; a reduction needs a reason; releasing nothing means reject', async () => {
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, { lines: [{ item_id: 'it-1', quantity: 3 }] }), 400, /never more/);
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, { lines: [{ item_id: 'it-1', quantity: 1 }] }), 400, /reason/);
    await expectError(
      BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {
        lines: [{ item_id: 'it-1', quantity: 0 }, { item_id: 'it-2', quantity: 0 }],
        reduction_reason: 'out of stock',
      }),
      400,
      /reject/
    );
    expect(postSaleSpy).not.toHaveBeenCalled();
  });

  it('losing the race (claim matched 0 rows) posts nothing and returns 409', async () => {
    mockPrisma.barOrder.updateMany.mockResolvedValue({ count: 0 });
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 409);
    expect(postSaleSpy).not.toHaveBeenCalled();
  });

  it('a unique-constraint backstop (P2002) becomes a clean 409', async () => {
    postSaleSpy.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 409);
  });

  it('a stock failure inside postSale aborts the whole unit (error propagates)', async () => {
    postSaleSpy.mockRejectedValue(new AppError(400, 'Insufficient stock for Goldberg'));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 400, /Insufficient stock/);
  });

  it('segregation: a controller cannot release their own order; an admin can (logged)', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ initiated_by_user_id: 'ctl-1' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 403);
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ initiated_by_user_id: 'adm-1' }));
    await BarOrderService.fulfil(admin, 'ord-1', BRANCHES, {});
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.changes.self_fulfil).toBe(true);
  });

  it("can't fulfil an order another controller accepted (managers can)", async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'accepted', accepted_by_user_id: 'ctl-9' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 409, /Another/);
    await BarOrderService.fulfil(manager, 'ord-1', BRANCHES, {});
    expect(postSaleSpy).toHaveBeenCalledTimes(1);
  });

  it('closed orders, other branches and other stores are refused', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'cancelled' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 409);
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ branch_id: 'branch_002' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 404);
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ store_id: 'store_002' }));
    await expectError(BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {}), 404);
  });
});

describe('accept / release / reject / cancel', () => {
  it('accept claims a submitted order conditionally; losing returns 409', async () => {
    await BarOrderService.accept(controller, 'ord-1', BRANCHES);
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'ord-1', status: 'submitted' },
      data: { status: 'accepted', accepted_by_user_id: 'ctl-1' },
    });
    mockPrisma.barOrder.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'accepted', accepted_by_user_id: 'ctl-9' }));
    await expectError(BarOrderService.accept(controller, 'ord-1', BRANCHES), 409, /Another/);
  });

  it('only the claimer (or a manager) can release a claim', async () => {
    await BarOrderService.release(controller, 'ord-1', BRANCHES);
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].where).toMatchObject({ accepted_by_user_id: 'ctl-1' });
    await BarOrderService.release(manager, 'ord-1', BRANCHES);
    expect(mockPrisma.barOrder.updateMany.mock.calls[1][0].where.accepted_by_user_id).toBeUndefined();
  });

  it('reject needs a reason', async () => {
    await expectError(BarOrderService.reject(controller, 'ord-1', BRANCHES, ''), 400);
    await BarOrderService.reject(controller, 'ord-1', BRANCHES, 'Customer left');
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'rejected', closed_reason: 'Customer left' });
  });

  it("attendant cancels only their own submitted order; another attendant's looks missing", async () => {
    const scope = { canViewQueue: false, branchIds: BRANCHES };
    await BarOrderService.cancel(attendant, 'ord-1', scope, 'Customer changed mind');
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].where).toEqual({ id: 'ord-1', status: 'submitted' });
    await expectError(BarOrderService.cancel(otherAttendant, 'ord-1', scope, 'nope nope'), 404);
  });

  it('cancelling an order the controller already accepted explains what to do', async () => {
    mockPrisma.barOrder.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.barOrder.findUnique
      .mockResolvedValueOnce(orderRow())
      .mockResolvedValueOnce({ status: 'accepted' });
    await expectError(
      BarOrderService.cancel(attendant, 'ord-1', { canViewQueue: false, branchIds: BRANCHES }, 'Customer left'),
      409,
      /reject/
    );
  });
});

describe('reads are scoped server-side', () => {
  it('listMine always filters by the caller', async () => {
    mockPrisma.barOrder.findMany.mockResolvedValue([]);
    await BarOrderService.listMine(attendant, {});
    expect(mockPrisma.barOrder.findMany.mock.calls[0][0].where).toMatchObject({
      store_id: 'store_001',
      initiated_by_user_id: 'att-1',
    });
  });

  it('listMine from/to filters on submitted_at by business day (cutoff 06:00 Lagos)', async () => {
    mockPrisma.storeSetting.findUnique.mockResolvedValue(null); // defaults: 6 h cutoff, Africa/Lagos
    mockPrisma.barOrder.findMany.mockResolvedValue([]);
    await BarOrderService.listMine(attendant, { status: ['fulfilled'], from: '2026-11-20', to: '2026-11-21' });
    const args = mockPrisma.barOrder.findMany.mock.calls[0][0];
    expect(args.where.submitted_at).toEqual({
      gte: new Date('2026-11-20T05:00:00.000Z'),
      lt: new Date('2026-11-22T05:00:00.000Z'),
    });
    expect(args.where.initiated_by_user_id).toBe('att-1');
    expect(args.take).toBe(200);
  });

  it('listMine rejects bad or reversed date ranges', async () => {
    mockPrisma.storeSetting.findUnique.mockResolvedValue(null);
    await expectError(BarOrderService.listMine(attendant, { from: '21-11-2026' }), 400);
    await expectError(BarOrderService.listMine(attendant, { from: '2026-11-22', to: '2026-11-20' }), 400);
  });

  it("getOrder: another attendant's order is 404; a controller in the branch can see it", async () => {
    await expectError(BarOrderService.getOrder(otherAttendant, 'ord-1', { canViewQueue: false, branchIds: BRANCHES }), 404);
    await BarOrderService.getOrder(controller, 'ord-1', { canViewQueue: true, branchIds: BRANCHES });
    await expectError(BarOrderService.getOrder(controller, 'ord-1', { canViewQueue: true, branchIds: ['branch_002'] }), 404);
  });
});

describe('declarePayment', () => {
  const scope = { canViewQueue: false, branchIds: BRANCHES };

  it('split must add up to the released total and is only allowed after release', async () => {
    await expectError(BarOrderService.declarePayment(attendant, 'ord-1', scope, { method: 'split', splits: { cash: 650, transfer: 650 } }), 400, /released/);
    mockPrisma.barOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'fulfilled', fulfilled_total: D(1300), transaction: { id: 'tx-1', receipt_number: 'R', status: 'completed' } })
    );
    await expectError(BarOrderService.declarePayment(attendant, 'ord-1', scope, { method: 'split', splits: { cash: 600, transfer: 600 } }), 400, /add up/);
    await BarOrderService.declarePayment(attendant, 'ord-1', scope, { method: 'split', splits: { cash: 800, transfer: 500 } });
    // keeps the sale's payment fields in step (EOD / payment-mix reports)
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tx-1' }, data: expect.objectContaining({ payment_method: 'split', payment_splits: { cash: 800, card: 0, transfer: 500 } }) })
    );
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BAR_PAYMENT_DECLARED');
  });

  it('rejects unknown methods', async () => {
    await expectError(BarOrderService.declarePayment(attendant, 'ord-1', scope, { method: 'bitcoin' }), 400);
  });
});

describe('reverse (manager/admin)', () => {
  it('voids the linked sale through voidSaleCore in the same unit', async () => {
    const voidSpy = jest.spyOn(TransactionService, 'voidSaleCore').mockResolvedValue(undefined as any);
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'fulfilled', fulfilled_total: D(1300) }));
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1', status: 'completed', transaction_items: [] });
    await BarOrderService.reverse(manager, 'ord-1', BRANCHES, 'Wrong drinks released');
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'ord-1', status: { in: ['fulfilled', 'reversal_requested'] } }, data: { status: 'reversed' } });
    expect(voidSpy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BAR_ORDER_REVERSED');
    voidSpy.mockRestore();
  });

  it('controllers and attendants cannot reverse', async () => {
    await expectError(BarOrderService.reverse(controller, 'ord-1', BRANCHES, 'because'), 403);
  });
});

describe('Phase 3: ledger entries + reversal requests', () => {
  it('release appends ONE SALE ledger entry for the Attendant, in the same unit', async () => {
    await BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {});
    expect(mockPrisma.cashierLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      cashier_user_id: 'att-1',
      entry_type: 'SALE',
      amount: 1300,
      source_type: 'bar_order',
      source_id: 'ord-1',
      recorded_by_user_id: 'ctl-1',
    });
  });

  it('a reduced release books only the released amount', async () => {
    await BarOrderService.fulfil(controller, 'ord-1', BRANCHES, {
      lines: [{ item_id: 'it-1', quantity: 1 }, { item_id: 'it-2', quantity: 2 }],
      reduction_reason: 'one Goldberg short',
    });
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data.amount).toBe(800);
  });

  it('reversal cancels the SALE entry exactly (reverses_entry_id) on today', async () => {
    const voidSpy = jest.spyOn(TransactionService, 'voidSaleCore').mockResolvedValue(undefined as any);
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'reversal_requested', reversal_requested_by_user_id: 'att-1', fulfilled_total: D(1300) }));
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1', status: 'completed', transaction_items: [] });
    mockPrisma.cashierLedgerEntry.findUnique.mockResolvedValue({ id: 'led-sale', cashier_user_id: 'att-1', amount: D(1300) });
    await BarOrderService.reverse(manager, 'ord-1', BRANCHES, 'Bottles returned unopened');
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      cashier_user_id: 'att-1',
      entry_type: 'SALE_REVERSAL',
      amount: -1300,
      reverses_entry_id: 'led-sale',
      source_id: 'ord-1',
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({ approved_request: true, ledger_reversed: true });
    voidSpy.mockRestore();
  });

  it('a manager cannot approve a reversal they requested (admin can)', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'reversal_requested', reversal_requested_by_user_id: 'mgr-1' }));
    await expectError(BarOrderService.reverse(manager, 'ord-1', BRANCHES, 'my own request'), 403);
  });

  it('attendant requests a reversal of their released order; others cannot', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'fulfilled' }));
    await BarOrderService.requestReversal(attendant, 'ord-1', { canViewQueue: false, branchIds: BRANCHES }, 'Customer returned 2 bottles');
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'ord-1', status: 'fulfilled' },
      data: { status: 'reversal_requested', reversal_requested_by_user_id: 'att-1', reversal_request_reason: 'Customer returned 2 bottles' },
    });
    await expectError(BarOrderService.requestReversal(otherAttendant, 'ord-1', { canViewQueue: false, branchIds: BRANCHES }, 'not mine'), 404);
    expect(mockPrisma.cashierLedgerEntry.create).not.toHaveBeenCalled(); // nothing moves until approved
  });

  it('manager declines: back to released, request cleared, audited; controllers cannot decide', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue(orderRow({ status: 'reversal_requested', reversal_requested_by_user_id: 'att-1', reversal_request_reason: 'x' }));
    await BarOrderService.declineReversal(manager, 'ord-1', BRANCHES, 'Bottles were opened');
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'ord-1', status: 'reversal_requested' },
      data: { status: 'fulfilled', reversal_requested_by_user_id: null },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BAR_REVERSAL_DECLINED');
    await expectError(BarOrderService.declineReversal(controller, 'ord-1', BRANCHES, 'nope nope'), 403);
  });
});
