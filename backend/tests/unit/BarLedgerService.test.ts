/**
 * BarLedgerService — Attendant balances, remittances, write-offs (Bar/Lounge Phase 3).
 * Hermetic: Prisma is mocked. Business dates are pinned by mocking "today".
 */
jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  return { __esModule: true, prisma: m, default: m };
});

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { BarLedgerService, CONTROLLER_BACKDATE_DAYS } from '../../src/services/BarLedgerService';
import { AppError } from '../../src/utils/errorHandler';
import { getBusinessDate } from '../../src/utils/businessDate';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;
const D = (n: number | string) => new Prisma.Decimal(n);

const controller = { userId: 'ctl-1', role: 'cashier', storeId: 'store_001' };
const manager = { userId: 'mgr-1', role: 'manager', storeId: 'store_001' };
const admin = { userId: 'adm-1', role: 'admin', storeId: 'store_001' };
const TODAY = getBusinessDate(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const attendantRow = { id: 'att-1', store_id: 'store_001', branch_id: 'branch_001', operational_profile: 'bar_attendant', first_name: 'John', last_name: null };

const expectError = async (p: Promise<unknown>, status: number, code?: string) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
  if (code) expect(err.details?.code).toBe(code);
  return err;
};

/** Ledger mock: `owed` is Σ of all entries; `opening` is Σ before the asked date. */
function mockBalances({ owed = 0, opening = 0, day = {} as Record<string, number> } = {}) {
  mockPrisma.cashierLedgerEntry.aggregate.mockImplementation(({ where }: any) =>
    Promise.resolve({ _sum: { amount: D(where?.business_date?.lt ? opening : owed) } })
  );
  mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(
    Object.entries(day).map(([entry_type, v]) => ({ entry_type, _sum: { amount: D(v) } }))
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  mockPrisma.storeSetting.findUnique.mockResolvedValue(null); // 06:00 Lagos, no controller back-dating
  mockPrisma.user.findUnique.mockResolvedValue(attendantRow);
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'att-1', first_name: 'John', last_name: null }, { id: 'ctl-1', first_name: 'Ada', last_name: null }]);
  mockPrisma.cashierRemittance.findUnique.mockResolvedValue(null);
  mockPrisma.cashierRemittance.findFirst.mockResolvedValue(null);
  mockPrisma.cashierRemittance.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'rem-1', status: 'recorded', created_at: new Date(), reversed_at: null, reversal_reason: null, ...data, amount: D(data.amount) })
  );
  mockPrisma.cashierLedgerEntry.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'led-new', ...data }));
  mockPrisma.barOrder.count.mockResolvedValue(0);
  mockPrisma.transaction.findMany.mockResolvedValue([]);
  mockPrisma.cashierRemittance.groupBy.mockResolvedValue([]);
  mockBalances();
});

describe('cashierSummary — carry-forward (the brief’s example)', () => {
  it('day 1: ₦250,000 sales, ₦200,000 remitted → ₦50,000 outstanding', async () => {
    mockBalances({ opening: 0, owed: 50000, day: { SALE: 250000, REMITTANCE: -200000 } });
    const s = await BarLedgerService.cashierSummary('store_001', 'att-1', daysAgo(1));
    expect(s).toMatchObject({ brought_forward: 0, sales: 250000, remitted: 200000, closing_balance: 50000, outstanding_now: 50000 });
  });

  it('day 2: the ₦50,000 is brought forward separately; a ₦30,000 remittance leaves ₦20,000', async () => {
    mockBalances({ opening: 50000, owed: 20000, day: { REMITTANCE: -30000 } });
    const s = await BarLedgerService.cashierSummary('store_001', 'att-1', TODAY);
    expect(s).toMatchObject({ brought_forward: 50000, sales: 0, remitted: 30000, closing_balance: 20000, outstanding_now: 20000 });
    // opening is computed from entries strictly before the business date — never a stored balance
    const openingCall = mockPrisma.cashierLedgerEntry.aggregate.mock.calls.find((c: any) => c[0].where.business_date?.lt);
    expect(openingCall[0].where).toMatchObject({ store_id: 'store_001', cashier_user_id: 'att-1' });
  });

  it('a reversal and a write-off on the day are netted correctly', async () => {
    mockBalances({ opening: 10000, owed: 4000, day: { SALE: 5000, SALE_REVERSAL: -1000, REMITTANCE: -8000, REMITTANCE_REVERSAL: 1000, WRITE_OFF: -3000 } });
    const s = await BarLedgerService.cashierSummary('store_001', 'att-1', TODAY);
    expect(s).toMatchObject({ sales: 4000, remitted: 7000, written_off: 3000, closing_balance: 4000 });
  });

  it('payment mix expands split sales; remittance mix is what was actually received', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { payment_method: 'cash', total_amount: D(1000), payment_splits: null },
      { payment_method: 'split', total_amount: D(2200), payment_splits: { cash: 1200, transfer: 1000, card: 0 } },
      { payment_method: 'card', total_amount: D(500), payment_splits: null },
    ]);
    mockPrisma.cashierRemittance.groupBy.mockResolvedValue([{ method: 'cash', _sum: { amount: D(2000) }, _count: { _all: 2 } }]);
    const s = await BarLedgerService.cashierSummary('store_001', 'att-1', TODAY);
    expect(s.payment_mix).toEqual({ cash: 2200, transfer: 1000, card: 500 });
    expect(s.remittance_mix).toEqual({ cash: 2000 });
  });

  it('rejects malformed dates', async () => {
    await expectError(BarLedgerService.cashierSummary('store_001', 'att-1', '17/11/2026'), 400);
  });
});

describe('recordRemittance', () => {
  const body = (over: Record<string, any> = {}) => ({
    cashier_user_id: 'att-1',
    amount: 20000,
    method: 'cash',
    client_ref: 'remit-ref-0001',
    ...over,
  });

  it('records money and a REMITTANCE ledger entry (−amount) with audit, atomically', async () => {
    mockBalances({ owed: 50000 });
    const r = await BarLedgerService.recordRemittance(controller, body());
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cashierRemittance.create.mock.calls[0][0].data).toMatchObject({
      cashier_user_id: 'att-1',
      received_by_user_id: 'ctl-1',
      amount: 20000,
      method: 'cash',
    });
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      cashier_user_id: 'att-1',
      entry_type: 'REMITTANCE',
      amount: -20000,
      source_type: 'remittance',
      source_id: 'rem-1',
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('REMITTANCE_RECORDED');
    expect(r.replayed).toBe(false);
  });

  it('several remittances from the same Attendant in a day are fine (distinct client_refs)', async () => {
    mockBalances({ owed: 50000 });
    await BarLedgerService.recordRemittance(controller, body({ client_ref: 'remit-ref-0001' }));
    await BarLedgerService.recordRemittance(controller, body({ client_ref: 'remit-ref-0002' }));
    expect(mockPrisma.cashierRemittance.create).toHaveBeenCalledTimes(2);
  });

  it('a replayed client_ref returns the original and writes nothing', async () => {
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue({
      id: 'rem-0', store_id: 'store_001', received_by_user_id: 'ctl-1', cashier_user_id: 'att-1', amount: D(20000),
      method: 'cash', reference: null, narration: null, business_date: new Date(`${TODAY}T00:00:00Z`), status: 'recorded', created_at: new Date(),
    });
    const r = await BarLedgerService.recordRemittance(controller, body());
    expect(r.replayed).toBe(true);
    expect(mockPrisma.cashierRemittance.create).not.toHaveBeenCalled();
  });

  it('overpayment needs explicit confirmation (D21) and then creates a credit', async () => {
    mockBalances({ owed: 5000 });
    const err = await expectError(BarLedgerService.recordRemittance(controller, body({ amount: 8000 })), 409, 'OVERPAYMENT');
    expect(err.details).toMatchObject({ outstanding: 5000, excess: 3000 });
    await BarLedgerService.recordRemittance(controller, body({ amount: 8000, confirm_overpayment: true }));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({ overpayment: 3000 });
  });

  it('transfer / POS need a reference; a reused reference needs confirmation', async () => {
    mockBalances({ owed: 50000 });
    await expectError(BarLedgerService.recordRemittance(controller, body({ method: 'transfer' })), 400);
    mockPrisma.cashierRemittance.findFirst.mockResolvedValue({ id: 'rem-old', amount: D(20000), business_date: new Date(`${TODAY}T00:00:00Z`) });
    await expectError(BarLedgerService.recordRemittance(controller, body({ method: 'transfer', reference: 'GTB-123' })), 409, 'DUPLICATE_REFERENCE');
    await BarLedgerService.recordRemittance(controller, body({ method: 'transfer', reference: 'GTB-123', confirm_duplicate: true }));
    expect(mockPrisma.cashierRemittance.create).toHaveBeenCalledTimes(1);
  });

  it('nobody records money they are handing over themselves (admin excepted)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...attendantRow, id: 'ctl-1' });
    await expectError(BarLedgerService.recordRemittance(controller, body({ cashier_user_id: 'ctl-1' })), 403);
  });

  it('other-store or non-Attendant targets are refused', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...attendantRow, store_id: 'store_002' });
    await expectError(BarLedgerService.recordRemittance(controller, body()), 404);
    mockPrisma.user.findUnique.mockResolvedValue({ ...attendantRow, operational_profile: null });
    mockPrisma.cashierLedgerEntry.count.mockResolvedValue(0);
    await expectError(BarLedgerService.recordRemittance(controller, body()), 400);
  });

  it('amounts must be positive; future dates are refused', async () => {
    await expectError(BarLedgerService.recordRemittance(controller, body({ amount: 0 })), 400);
    await expectError(BarLedgerService.recordRemittance(controller, body({ amount: -5 })), 400);
    const tomorrow = daysAgo(-1);
    await expectError(BarLedgerService.recordRemittance(manager, body({ business_date: tomorrow })), 400);
  });

  it('back-dating: managers always; controllers only when allowed and within the window', async () => {
    mockBalances({ owed: 50000 });
    await expectError(BarLedgerService.recordRemittance(controller, body({ business_date: daysAgo(1) })), 403);
    await BarLedgerService.recordRemittance(manager, body({ business_date: daysAgo(3) }));
    mockPrisma.storeSetting.findUnique.mockResolvedValue({ bar_business_day_cutoff_hour: 6, bar_timezone: 'Africa/Lagos', bar_allow_backdated_remittance: true });
    await BarLedgerService.recordRemittance(controller, body({ client_ref: 'remit-ref-0009', business_date: daysAgo(2) }));
    await expectError(
      BarLedgerService.recordRemittance(controller, body({ client_ref: 'remit-ref-0010', business_date: daysAgo(CONTROLLER_BACKDATE_DAYS + 1) })),
      403
    );
  });
});

describe('reverseRemittance', () => {
  const rem = (over: Record<string, any> = {}) => ({
    id: 'rem-1', store_id: 'store_001', branch_id: 'branch_001', cashier_user_id: 'att-1', received_by_user_id: 'ctl-1',
    amount: D(20000), method: 'cash', reference: null, narration: null, status: 'recorded',
    business_date: new Date(`${TODAY}T00:00:00Z`), created_at: new Date(), reversed_at: null, reversal_reason: null, ...over,
  });

  beforeEach(() => {
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(rem());
    mockPrisma.cashierRemittance.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.cashierRemittance.findUniqueOrThrow.mockResolvedValue(rem({ status: 'reversed' }));
    mockPrisma.cashierLedgerEntry.findUnique.mockResolvedValue({ id: 'led-rem', amount: D(-20000) });
  });

  it('never edits: adds a REMITTANCE_REVERSAL (+amount) pointing at the original entry', async () => {
    await BarLedgerService.reverseRemittance(controller, 'rem-1', 'Typed 20,000 instead of 2,000');
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      entry_type: 'REMITTANCE_REVERSAL',
      amount: 20000,
      reverses_entry_id: 'led-rem',
      cashier_user_id: 'att-1',
    });
    expect(mockPrisma.cashierRemittance.updateMany.mock.calls[0][0].where).toEqual({ id: 'rem-1', status: 'recorded' });
  });

  it("controllers: only their own, only today; managers: any", async () => {
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(rem({ received_by_user_id: 'ctl-9' }));
    await expectError(BarLedgerService.reverseRemittance(controller, 'rem-1', 'not mine'), 403);
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(rem({ business_date: new Date(`${daysAgo(1)}T00:00:00Z`) }));
    await expectError(BarLedgerService.reverseRemittance(controller, 'rem-1', 'yesterday'), 403);
    await BarLedgerService.reverseRemittance(manager, 'rem-1', 'manager correction');
    expect(mockPrisma.cashierLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it('already reversed → 409; a lost race → 409; reason required', async () => {
    await expectError(BarLedgerService.reverseRemittance(controller, 'rem-1', ''), 400);
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(rem({ status: 'reversed' }));
    await expectError(BarLedgerService.reverseRemittance(controller, 'rem-1', 'again'), 409);
    mockPrisma.cashierRemittance.findUnique.mockResolvedValue(rem());
    mockPrisma.cashierRemittance.updateMany.mockResolvedValue({ count: 0 });
    await expectError(BarLedgerService.reverseRemittance(controller, 'rem-1', 'race'), 409);
  });
});

describe('write-off and adjustment', () => {
  it('manager writes off up to what is owed (WRITE_OFF −amount), with a reason', async () => {
    mockBalances({ owed: 50000 });
    await expectError(BarLedgerService.writeOff(manager, 'att-1', 60000, 'too much'), 400);
    await expectError(BarLedgerService.writeOff(manager, 'att-1', 1000, ''), 400);
    await BarLedgerService.writeOff(manager, 'att-1', 50000, 'Left the business — deducted from final salary');
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({ entry_type: 'WRITE_OFF', amount: -50000, cashier_user_id: 'att-1' });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('BALANCE_WRITTEN_OFF');
  });

  it('controllers cannot write off; only admins adjust (D13)', async () => {
    await expectError(BarLedgerService.writeOff(controller, 'att-1', 10, 'nope'), 403);
    await expectError(BarLedgerService.adjust(manager, 'att-1', 10, 'nope'), 403);
    await BarLedgerService.adjust(admin, 'att-1', -2500, 'Counting error on 17 Nov');
    expect(mockPrisma.cashierLedgerEntry.create.mock.calls[0][0].data).toMatchObject({ entry_type: 'ADJUSTMENT', amount: -2500 });
    await expectError(BarLedgerService.adjust(admin, 'att-1', 0, 'zero'), 400);
  });
});
