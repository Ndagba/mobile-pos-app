/**
 * Bar/Lounge Phase 4 — damages (house loss), Bar Controller day close, manager
 * handover, and closed-day locking. Hermetic: Prisma is mocked.
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
import { BarDamageService } from '../../src/services/BarDamageService';
import { BarDayCloseService } from '../../src/services/BarDayCloseService';
import { BarLedgerService } from '../../src/services/BarLedgerService';
import { BarOrderService } from '../../src/services/BarOrderService';
import { AppError } from '../../src/utils/errorHandler';
import { getBusinessDate } from '../../src/utils/businessDate';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;
const D = (n: number | string) => new Prisma.Decimal(n);
const TODAY = getBusinessDate(new Date());
const TODAY_DB = new Date(`${TODAY}T00:00:00.000Z`);

const controller = { userId: 'ctl-1', role: 'cashier', storeId: 'store_001' };
const manager = { userId: 'mgr-1', role: 'manager', storeId: 'store_001' };
const attendant = { userId: 'att-1', role: 'cashier', storeId: 'store_001' };

const expectError = async (p: Promise<unknown>, status: number, code?: string | RegExp) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
  if (typeof code === 'string') expect(err.details?.code).toBe(code);
  if (code instanceof RegExp) expect(err.message).toMatch(code);
  return err;
};

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  mockPrisma.storeSetting.findUnique.mockResolvedValue(null); // 06:00 Lagos
  mockPrisma.barDayClose.findFirst.mockResolvedValue(null); // no closed days by default
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.product.findMany.mockResolvedValue([]);
});

// ─── Damages ─────────────────────────────────────────────────

describe('BarDamageService.record — always a house loss', () => {
  const product = { id: 'goldberg', name: 'Goldberg', item_type: 'PRODUCT', cost_price: D(400), effective_price: D(600) };
  const body = (over: Record<string, any> = {}) => ({
    client_ref: 'dmg-ref-0001',
    product_id: 'goldberg',
    quantity: 2,
    reason_code: 'flat',
    responsible_user_id: 'att-1',
    ...over,
  });

  beforeEach(() => {
    mockPrisma.damageRecord.findUnique.mockResolvedValue(null);
    mockPrisma.product.findFirst.mockResolvedValue(product);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'att-1', store_id: 'store_001' });
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.damageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'dmg-1', status: 'recorded', created_at: new Date(), reversal_reason: null, ...data, quantity: D(data.quantity) })
    );
  });

  it('deducts stock (guarded), writes a damage movement + record + audit, and NEVER touches the ledger', async () => {
    const r = await BarDamageService.record(controller, 'branch_001', body());
    expect(mockPrisma.inventory.updateMany).toHaveBeenCalledWith({
      where: { product_id: 'goldberg', quantity_on_hand: { gte: 2 } },
      data: { quantity_on_hand: { decrement: 2 } },
    });
    expect(mockPrisma.inventoryMovement.create.mock.calls[0][0].data).toMatchObject({
      movement_type: 'damage',
      quantity: -2,
      reference_id: 'dmg-1',
      user_id: 'ctl-1',
    });
    expect(mockPrisma.damageRecord.create.mock.calls[0][0].data).toMatchObject({
      reason_code: 'flat',
      responsible_user_id: 'att-1',
      recorded_by_user_id: 'ctl-1',
      unit_cost: D(400),
      unit_price: D(600),
    });
    expect(mockPrisma.cashierLedgerEntry.create).not.toHaveBeenCalled(); // D24
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled(); // not a sale
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DAMAGE_RECORDED');
    expect(r.record.cost_value).toBe(800);
  });

  it('cannot push stock below zero', async () => {
    mockPrisma.inventory.updateMany.mockResolvedValue({ count: 0 });
    await expectError(BarDamageService.record(controller, 'branch_001', body()), 400, /Not enough/);
    expect(mockPrisma.damageRecord.create).not.toHaveBeenCalled();
  });

  it('validates reason, quantity, product type and an "other" note', async () => {
    await expectError(BarDamageService.record(controller, 'branch_001', body({ reason_code: 'spilt' })), 400);
    await expectError(BarDamageService.record(controller, 'branch_001', body({ quantity: 0 })), 400);
    await expectError(BarDamageService.record(controller, 'branch_001', body({ reason_code: 'other' })), 400, /note/);
    mockPrisma.product.findFirst.mockResolvedValue({ ...product, item_type: 'SERVICE' });
    await expectError(BarDamageService.record(controller, 'branch_001', body()), 400, /Services/);
  });

  it('a house damage (no Attendant) is fine', async () => {
    await BarDamageService.record(controller, 'branch_001', body({ responsible_user_id: null }));
    expect(mockPrisma.damageRecord.create.mock.calls[0][0].data.responsible_user_id).toBeNull();
  });

  it('is idempotent on client_ref', async () => {
    mockPrisma.damageRecord.findUnique.mockResolvedValue({
      id: 'dmg-0', store_id: 'store_001', recorded_by_user_id: 'ctl-1', product_id: 'goldberg', quantity: D(2),
      unit_cost: D(400), unit_price: D(600), business_date: TODAY_DB, status: 'recorded', created_at: new Date(),
    });
    const r = await BarDamageService.record(controller, 'branch_001', body());
    expect(r.replayed).toBe(true);
    expect(mockPrisma.inventory.updateMany).not.toHaveBeenCalled();
  });

  it('is refused once the controller has closed today', async () => {
    mockPrisma.barDayClose.findFirst.mockResolvedValue({ id: 'close-1', status: 'submitted', business_date: TODAY_DB });
    await expectError(BarDamageService.record(controller, 'branch_001', body()), 409, 'DAY_CLOSED');
  });
});

describe('BarDamageService.reverse', () => {
  const rec = (over: Record<string, any> = {}) => ({
    id: 'dmg-1', store_id: 'store_001', branch_id: 'branch_001', product_id: 'goldberg', quantity: D(2),
    recorded_by_user_id: 'ctl-1', business_date: TODAY_DB, status: 'recorded', unit_cost: D(400), unit_price: D(600),
    created_at: new Date(), ...over,
  });

  beforeEach(() => {
    mockPrisma.damageRecord.findUnique.mockResolvedValue(rec());
    mockPrisma.damageRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.damageRecord.findUniqueOrThrow.mockResolvedValue(rec({ status: 'reversed' }));
  });

  it('puts stock back with an adjustment movement', async () => {
    await BarDamageService.reverse(controller, 'dmg-1', 'Bottle was fine after all');
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({ where: { product_id: 'goldberg' }, data: { quantity_on_hand: { increment: D(2) } } });
    expect(mockPrisma.inventoryMovement.create.mock.calls[0][0].data).toMatchObject({ movement_type: 'adjustment' });
  });

  it("controllers: own and same day only; nobody inside a closed day", async () => {
    mockPrisma.damageRecord.findUnique.mockResolvedValue(rec({ recorded_by_user_id: 'ctl-9' }));
    await expectError(BarDamageService.reverse(controller, 'dmg-1', 'not mine'), 403);
    mockPrisma.damageRecord.findUnique.mockResolvedValue(rec());
    mockPrisma.barDayClose.findFirst.mockResolvedValue({ id: 'close-1', status: 'acknowledged', business_date: TODAY_DB });
    await expectError(BarDamageService.reverse(manager, 'dmg-1', 'closed day'), 409, 'DAY_CLOSED');
  });
});

// ─── Day close ───────────────────────────────────────────────

function primeCompute({ cash = 0, transfer = 0, myAccepted = 0 } = {}) {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'ctl-1', first_name: 'Ada', last_name: null, branch_id: 'branch_001' });
  const remits = [];
  if (cash) remits.push({ cashier_user_id: 'att-1', amount: D(cash), method: 'cash' });
  if (transfer) remits.push({ cashier_user_id: 'att-1', amount: D(transfer), method: 'transfer' });
  mockPrisma.cashierRemittance.findMany.mockResolvedValue(remits);
  mockPrisma.barOrder.findMany.mockResolvedValue([{ status: 'fulfilled', fulfilled_total: D(5000), total_amount: D(5000), closed_reason: null }]);
  mockPrisma.damageRecord.findMany.mockResolvedValue([{ quantity: D(2), unit_cost: D(400), unit_price: D(600) }]);
  mockPrisma.barOrder.count.mockImplementation(({ where }: any) => Promise.resolve(where.status === 'accepted' ? myAccepted : 3));
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'att-1', first_name: 'John', last_name: null }]);
}

const closeRow = (over: Record<string, any> = {}) => ({
  id: 'close-1', store_id: 'store_001', branch_id: 'branch_001', business_date: TODAY_DB, closed_by_user_id: 'ctl-1',
  status: 'submitted', snapshot: {}, expected_cash: D(10000), expected_transfer: D(0), expected_card: D(0), expected_other: D(0),
  counted_cash: D(9500), variance: D(-500), variance_reason: 'short', notes: null, submitted_at: new Date(),
  acknowledged_by_user_id: null, acknowledged_amount: null, acknowledged_at: null, ack_note: null, variance_treatment: null,
  reopened_by_user_id: null, reopened_at: null, reopen_reason: null, ...over,
});

describe('BarDayCloseService.compute / submit', () => {
  it('expected money = what THIS controller received, by method; cash is the physical handover', async () => {
    primeCompute({ cash: 10000, transfer: 4000 });
    const f = await BarDayCloseService.compute('store_001', 'ctl-1', TODAY);
    expect(f.remittances.by_method).toEqual({ cash: 10000, transfer: 4000, card: 0, other: 0 });
    expect(f.handover_cash_expected).toBe(10000);
    expect(f.orders_released).toMatchObject({ count: 1, total: 5000 });
    expect(f.damages).toMatchObject({ quantity: 2, cost_value: 800, retail_value: 1200 });
    expect(mockPrisma.cashierRemittance.findMany.mock.calls[0][0].where).toMatchObject({ received_by_user_id: 'ctl-1', status: 'recorded' });
  });

  it('a variance needs a reason; zero variance does not', async () => {
    primeCompute({ cash: 10000 });
    mockPrisma.barDayClose.findUnique.mockResolvedValue(null);
    mockPrisma.barDayClose.create.mockImplementation(({ data }: any) => Promise.resolve(closeRow(data)));
    await expectError(BarDayCloseService.submit(controller, { counted_cash: 9500 }), 400, 'VARIANCE_REASON_REQUIRED');
    await BarDayCloseService.submit(controller, { counted_cash: 10000 });
    expect(mockPrisma.barDayClose.create.mock.calls[0][0].data).toMatchObject({ expected_cash: 10000, counted_cash: 10000, variance: 0, status: 'submitted' });
  });

  it('freezes the snapshot, links what it covers and audits, in one unit', async () => {
    primeCompute({ cash: 10000 });
    mockPrisma.barDayClose.findUnique.mockResolvedValue(null);
    mockPrisma.barDayClose.create.mockImplementation(({ data }: any) => Promise.resolve(closeRow(data)));
    await BarDayCloseService.submit(controller, { counted_cash: 9500, variance_reason: 'One ₦500 note missing' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.barDayClose.create.mock.calls[0][0].data).toMatchObject({ variance: -500, variance_reason: 'One ₦500 note missing' });
    expect(mockPrisma.cashierRemittance.updateMany.mock.calls[0][0]).toMatchObject({ where: { received_by_user_id: 'ctl-1' }, data: { day_close_id: 'close-1' } });
    expect(mockPrisma.barOrder.updateMany.mock.calls[0][0].where).toMatchObject({ fulfilled_by_user_id: 'ctl-1' });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DAY_CLOSE_SUBMITTED');
  });

  it('blocks while the controller is still preparing orders', async () => {
    primeCompute({ cash: 0, myAccepted: 2 });
    await expectError(BarDayCloseService.submit(controller, { counted_cash: 0 }), 409, 'OPEN_ORDERS');
  });

  it('one close per controller per day (D11): a second submit is refused; a reopened one is replaced', async () => {
    primeCompute({ cash: 1000 });
    mockPrisma.barDayClose.findUnique.mockResolvedValue(closeRow());
    await expectError(BarDayCloseService.submit(controller, { counted_cash: 1000 }), 409, 'ALREADY_CLOSED');
    mockPrisma.barDayClose.findUnique.mockResolvedValue(closeRow({ status: 'reopened' }));
    mockPrisma.barDayClose.update.mockResolvedValue(closeRow({ status: 'submitted' }));
    await BarDayCloseService.submit(controller, { counted_cash: 1000 });
    expect(mockPrisma.barDayClose.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DAY_CLOSE_RESUBMITTED');
  });

  it('cannot close a future day', async () => {
    await expectError(BarDayCloseService.submit(controller, { counted_cash: 0, business_date: '2999-01-01' }), 400);
  });
});

describe('acknowledge / reopen', () => {
  beforeEach(() => {
    mockPrisma.barDayClose.findUnique.mockResolvedValue(closeRow());
    mockPrisma.barDayClose.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.barDayClose.findUniqueOrThrow.mockResolvedValue(closeRow({ status: 'acknowledged' }));
  });

  it('only managers, never their own; a shortage needs a treatment (D23)', async () => {
    await expectError(BarDayCloseService.acknowledge(controller, 'close-1', ['branch_001'], { acknowledged_amount: 9500 }), 403);
    await expectError(BarDayCloseService.acknowledge(manager, 'close-1', ['branch_001'], { acknowledged_amount: 9500 }), 400, 'VARIANCE_TREATMENT_REQUIRED');
    mockPrisma.barDayClose.findUnique.mockResolvedValue(closeRow({ closed_by_user_id: 'mgr-1' }));
    await expectError(BarDayCloseService.acknowledge(manager, 'close-1', ['branch_001'], { acknowledged_amount: 9500, variance_treatment: 'absorb' }), 403);
  });

  it('absorb: no ledger entry; charge: an ADJUSTMENT on the controller for the shortage', async () => {
    await BarDayCloseService.acknowledge(manager, 'close-1', ['branch_001'], { acknowledged_amount: 9500, variance_treatment: 'absorb' });
    expect(mockPrisma.cashierLedgerEntry.create).not.toHaveBeenCalled();
    await BarDayCloseService.acknowledge(manager, 'close-1', ['branch_001'], { acknowledged_amount: 9500, variance_treatment: 'charge_controller' });
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      cashier_user_id: 'ctl-1',
      entry_type: 'ADJUSTMENT',
      amount: 500,
      source_type: 'day_close',
    });
  });

  it('receiving a different amount than counted needs a note', async () => {
    await expectError(
      BarDayCloseService.acknowledge(manager, 'close-1', ['branch_001'], { acknowledged_amount: 9000, variance_treatment: 'absorb' }),
      400,
      /note/
    );
  });

  it('reopen undoes a shortage charge with a reversing entry, and needs a reason', async () => {
    const ackAt = new Date('2026-11-17T22:00:00.000Z');
    mockPrisma.barDayClose.findUnique.mockResolvedValue(closeRow({ status: 'acknowledged', variance_treatment: 'charge_controller', acknowledged_at: ackAt }));
    mockPrisma.barDayClose.findUniqueOrThrow.mockResolvedValue(closeRow({ status: 'reopened' }));
    mockPrisma.cashierLedgerEntry.findUnique.mockResolvedValue({ id: 'led-charge', amount: D(500) });
    await expectError(BarDayCloseService.reopen(manager, 'close-1', ['branch_001'], ''), 400);
    await BarDayCloseService.reopen(manager, 'close-1', ['branch_001'], 'Found the missing ₦500');
    expect(mockPrisma.cashierLedgerEntry.findUnique.mock.calls[0][0].where.entry_type_source_type_source_id.source_id).toBe(`close-1@${ackAt.toISOString()}`);
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      entry_type: 'ADJUSTMENT',
      amount: -500,
      reverses_entry_id: 'led-charge',
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DAY_CLOSE_REOPENED');
  });

  it('closes outside the manager’s branches are invisible', async () => {
    await expectError(BarDayCloseService.reopen(manager, 'close-1', ['branch_002'], 'nope nope'), 404);
  });
});

// ─── Closed-day locks on existing flows ──────────────────────

describe('closed-day locks', () => {
  const closed = { id: 'close-1', status: 'submitted', business_date: TODAY_DB };

  it('a controller who closed today cannot record more money for today', async () => {
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'att-1', store_id: 'store_001', branch_id: 'branch_001', operational_profile: 'bar_attendant' });
    mockPrisma.cashierLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: D(5000) } });
    mockPrisma.cashierRemittance.findFirst.mockResolvedValue(null);
    mockPrisma.barDayClose.findFirst.mockResolvedValue(closed);
    await expectError(
      BarLedgerService.recordRemittance(controller, { cashier_user_id: 'att-1', amount: 1000, method: 'cash', client_ref: 'remit-ref-9999' }),
      409,
      'DAY_CLOSED'
    );
  });

  it('a hand-over inside a closed day cannot be reversed, even by a manager', async () => {
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue({
      id: 'rem-1', store_id: 'store_001', branch_id: 'branch_001', cashier_user_id: 'att-1', received_by_user_id: 'ctl-1',
      amount: D(1000), status: 'recorded', business_date: TODAY_DB,
    });
    mockPrisma.barDayClose.findFirst.mockResolvedValue(closed);
    await expectError(BarLedgerService.reverseRemittance(manager, 'rem-1', 'wrong amount'), 409, 'DAY_CLOSED');
  });

  it('a controller who closed today cannot release more orders', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue({
      id: 'ord-1', store_id: 'store_001', branch_id: 'branch_001', status: 'submitted', initiated_by_user_id: 'att-1',
      accepted_by_user_id: null, items: [{ id: 'it-1', product_id: 'p', quantity_requested: D(1), unit_price: D(500), tax_rate: D(0) }],
      customer_payment_method: 'cash', total_amount: D(500),
    });
    mockPrisma.barDayClose.findFirst.mockResolvedValue(closed);
    await expectError(BarOrderService.fulfil(controller, 'ord-1', ['branch_001'], {}), 409, 'DAY_CLOSED');
  });

  it('after the close, only a manager may change a payment declaration', async () => {
    mockPrisma.barOrder.findUnique.mockResolvedValue({
      id: 'ord-1', store_id: 'store_001', branch_id: 'branch_001', status: 'fulfilled', initiated_by_user_id: 'att-1',
      fulfilled_by_user_id: 'ctl-1', business_date: TODAY_DB, total_amount: D(500), fulfilled_total: D(500),
      customer_payment_method: 'cash', customer_payment_splits: null, items: [], transaction: { id: 'tx-1' },
    });
    mockPrisma.barDayClose.findFirst.mockResolvedValue(closed);
    await expectError(
      BarOrderService.declarePayment(attendant, 'ord-1', { canViewQueue: false, branchIds: ['branch_001'] }, { method: 'transfer' }),
      403,
      'DAY_CLOSED'
    );
  });
});
