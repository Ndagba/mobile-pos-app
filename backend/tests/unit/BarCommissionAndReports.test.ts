/**
 * Bar/Lounge Phase 5 — commission runs (draft → post → pay / cancel) and the
 * report helpers. Hermetic: Prisma is mocked.
 */
jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  return { __esModule: true, prisma: m, default: m };
});

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { BarCommissionService, COMMISSION_CATEGORY } from '../../src/services/BarCommissionService';
import { BarReportService, CONTROLLER_MAX_DAYS_BACK } from '../../src/services/BarReportService';
import { AppError } from '../../src/utils/errorHandler';
import { getBusinessDate } from '../../src/utils/businessDate';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;
const D = (n: number | string) => new Prisma.Decimal(n);
const TODAY = getBusinessDate(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const manager = { userId: 'mgr-1', role: 'manager', storeId: 'store_001' };
const controller = { userId: 'ctl-1', role: 'cashier', storeId: 'store_001' };

const expectError = async (p: Promise<unknown>, status: number, code?: string | RegExp) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
  if (typeof code === 'string') expect(err.details?.code).toBe(code);
  if (code instanceof RegExp) expect(err.message).toMatch(code);
  return err;
};

/** Ledger groupBy rows: [cashier, branch, type, amount]. */
const ledgerRows = (rows: [string, string, string, number][]) =>
  rows.map(([cashier_user_id, branch_id, entry_type, amount]) => ({ cashier_user_id, branch_id, entry_type, _sum: { amount: D(amount) } }));

const users = [
  { id: 'att-1', role: 'cashier', operational_profile: 'bar_attendant', first_name: 'John', last_name: null },
  { id: 'att-2', role: 'cashier', operational_profile: 'bar_attendant', first_name: 'Mary', last_name: null },
  { id: 'ctl-1', role: 'cashier', operational_profile: 'bar_controller', first_name: 'Ada', last_name: null },
  { id: 'mgr-1', role: 'manager', operational_profile: null, first_name: 'Boss', last_name: null },
];

function runRow(over: Record<string, any> = {}) {
  return {
    id: 'run-1', store_id: 'store_001', branch_id: 'branch_001', status: 'draft', rate: D(5), basis: 'total_sales',
    period_start: new Date(`${daysAgo(6)}T00:00:00Z`), period_end: new Date(`${TODAY}T00:00:00Z`),
    created_by_user_id: 'mgr-1', posted_at: null, cancelled_reason: null,
    lines: [
      { id: 'line-1', cashier_user_id: 'att-1', branch_id: 'branch_001', gross_sales: D(200000), reversals: D(0), eligible_sales: D(200000), commission_amount: D(10000), status: 'draft', expense_id: null, payment_status: 'unpaid', paid_at: null, paid_method: null, paid_reference: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  mockPrisma.storeSetting.findUnique.mockResolvedValue({ commission_enabled: true, commission_rate: D(5), commission_basis: 'total_sales', bar_business_day_cutoff_hour: 6, bar_timezone: 'Africa/Lagos' });
  mockPrisma.user.findMany.mockImplementation(({ where }: any) => Promise.resolve(users.filter((u) => !where?.id?.in || where.id.in.includes(u.id))));
  mockPrisma.commissionRunLine.findMany.mockResolvedValue([]); // no overlaps
  mockPrisma.commissionRun.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'run-1', ...data }));
  mockPrisma.commissionRun.findUnique.mockResolvedValue(runRow());
  mockPrisma.commissionRun.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$queryRaw.mockResolvedValue([{ pg_advisory_xact_lock: '' }]);
  mockPrisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat-comm' });
  mockPrisma.expense.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'exp-1', ...data }));
});

describe('createDraft — D27: rate × total sales from the ledger', () => {
  it('the brief’s example: 5% × ₦200,000 = ₦10,000', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(ledgerRows([['att-1', 'branch_001', 'SALE', 200000]]));
    await BarCommissionService.createDraft(manager, ['branch_001'], { period_start: daysAgo(6), period_end: TODAY });
    const lines = mockPrisma.commissionRun.create.mock.calls[0][0].data.lines.create;
    expect(lines).toEqual([expect.objectContaining({ cashier_user_id: 'att-1', gross_sales: 200000, eligible_sales: 200000, commission_amount: 10000 })]);
  });

  it('reversals reduce the base; a net-negative period earns ₦0 (never a negative expense)', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(
      ledgerRows([
        ['att-1', 'branch_001', 'SALE', 100000],
        ['att-1', 'branch_001', 'SALE_REVERSAL', -20000],
        ['att-2', 'branch_001', 'SALE_REVERSAL', -5000],
      ])
    );
    await BarCommissionService.createDraft(manager, ['branch_001'], { period_start: daysAgo(6), period_end: TODAY });
    const lines = mockPrisma.commissionRun.create.mock.calls[0][0].data.lines.create;
    expect(lines.find((l: any) => l.cashier_user_id === 'att-1')).toMatchObject({ eligible_sales: 80000, commission_amount: 4000 });
    expect(lines.find((l: any) => l.cashier_user_id === 'att-2')).toMatchObject({ eligible_sales: -5000, commission_amount: 0 });
  });

  it('Bar Controllers and managers never earn commission (D15)', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(
      ledgerRows([
        ['att-1', 'branch_001', 'SALE', 1000],
        ['ctl-1', 'branch_001', 'SALE', 5000],
        ['mgr-1', 'branch_001', 'SALE', 5000],
      ])
    );
    await BarCommissionService.createDraft(manager, ['branch_001'], { period_start: daysAgo(6), period_end: TODAY });
    const ids = mockPrisma.commissionRun.create.mock.calls[0][0].data.lines.create.map((l: any) => l.cashier_user_id);
    expect(ids).toEqual(['att-1']);
  });

  it('skips Attendants already covered by a posted run for an overlapping period', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(ledgerRows([['att-1', 'branch_001', 'SALE', 1000], ['att-2', 'branch_001', 'SALE', 2000]]));
    mockPrisma.commissionRunLine.findMany.mockResolvedValue([{ cashier_user_id: 'att-1' }]);
    const r = await BarCommissionService.createDraft(manager, ['branch_001'], { period_start: daysAgo(6), period_end: TODAY });
    expect(r.skipped_already_posted).toEqual(['att-1']);
    expect(mockPrisma.commissionRun.create.mock.calls[0][0].data.lines.create.map((l: any) => l.cashier_user_id)).toEqual(['att-2']);
  });

  it('requires commission on, a sane period, and manager rights', async () => {
    await expectError(BarCommissionService.createDraft(controller, ['branch_001'], { period_start: TODAY, period_end: TODAY }), 403);
    mockPrisma.storeSetting.findUnique.mockResolvedValue({ commission_enabled: false, commission_rate: D(5) });
    await expectError(BarCommissionService.createDraft(manager, ['branch_001'], { period_start: TODAY, period_end: TODAY }), 400, 'COMMISSION_DISABLED');
    mockPrisma.storeSetting.findUnique.mockResolvedValue({ commission_enabled: true, commission_rate: D(5) });
    await expectError(BarCommissionService.createDraft(manager, ['branch_001'], { period_start: TODAY, period_end: daysAgo(1) }), 400);
    await expectError(BarCommissionService.createDraft(manager, ['branch_001'], { period_start: TODAY, period_end: '2999-01-01' }), 400);
    await expectError(BarCommissionService.createDraft(manager, ['branch_001'], { period_start: daysAgo(200), period_end: TODAY }), 400, /at most/);
  });
});

describe('post — accrual expense, duplicates impossible', () => {
  beforeEach(() => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(ledgerRows([['att-1', 'branch_001', 'SALE', 200000]]));
  });

  it('takes the store lock, recomputes, and creates ONE linked expense in "Cashier Commission"', async () => {
    await BarCommissionService.post(manager, 'run-1');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1); // advisory lock
    expect(mockPrisma.expense.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.expense.create.mock.calls[0][0].data).toMatchObject({
      category_id: 'cat-comm',
      branch_id: 'branch_001',
      amount: 10000,
      paymentMethod: 'accrued',
      source_type: 'commission_run_line',
      source_id: 'line-1',
    });
    expect(mockPrisma.commissionRunLine.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'line-1' },
      data: { status: 'posted', expense_id: 'exp-1', commission_amount: 10000 },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('COMMISSION_RUN_POSTED');
  });

  it('creates the category the first time', async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue(null);
    mockPrisma.expenseCategory.create.mockResolvedValue({ id: 'cat-new' });
    await BarCommissionService.post(manager, 'run-1');
    expect(mockPrisma.expenseCategory.create.mock.calls[0][0].data).toMatchObject({ name: COMMISSION_CATEGORY, branch_id: 'branch_001' });
  });

  it('uses figures recomputed at posting time, not the stale draft', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue(ledgerRows([['att-1', 'branch_001', 'SALE', 300000]]));
    await BarCommissionService.post(manager, 'run-1');
    expect(mockPrisma.expense.create.mock.calls[0][0].data.amount).toBe(15000);
  });

  it('a ₦0 line is posted without an expense', async () => {
    mockPrisma.cashierLedgerEntry.groupBy.mockResolvedValue([]);
    await BarCommissionService.post(manager, 'run-1');
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
    expect(mockPrisma.commissionRunLine.update.mock.calls[0][0].data).toMatchObject({ status: 'posted', expense_id: null, commission_amount: 0 });
  });

  it('refuses when another posted run already covers part of the period (checked under the lock)', async () => {
    mockPrisma.commissionRunLine.findMany.mockResolvedValue([{ cashier_user_id: 'att-1', period_start: new Date(), period_end: new Date(), commission_run_id: 'run-0' }]);
    await expectError(BarCommissionService.post(manager, 'run-1'), 409, 'ALREADY_POSTED');
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });

  it('only drafts can be posted, once', async () => {
    mockPrisma.commissionRun.findUnique.mockResolvedValue(runRow({ status: 'posted' }));
    await expectError(BarCommissionService.post(manager, 'run-1'), 409);
    mockPrisma.commissionRun.findUnique.mockResolvedValue(runRow());
    mockPrisma.commissionRun.updateMany.mockResolvedValue({ count: 0 });
    await expectError(BarCommissionService.post(manager, 'run-1'), 409);
  });
});

describe('pay / cancel', () => {
  const postedLine = { id: 'line-1', commission_run_id: 'run-1', store_id: 'store_001', branch_id: 'branch_001', cashier_user_id: 'att-1', status: 'posted', commission_amount: D(10000), expense_id: 'exp-1', payment_status: 'unpaid' };

  it('mark paid: line + expense payment method follow; only once', async () => {
    mockPrisma.commissionRunLine.findUnique.mockResolvedValue(postedLine);
    mockPrisma.commissionRunLine.updateMany.mockResolvedValue({ count: 1 });
    await BarCommissionService.markPaid(manager, 'line-1', { method: 'transfer', reference: 'GTB-9' });
    expect(mockPrisma.expense.update).toHaveBeenCalledWith({ where: { id: 'exp-1' }, data: { paymentMethod: 'transfer', referenceNumber: 'GTB-9' } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('COMMISSION_PAID');
    mockPrisma.commissionRunLine.updateMany.mockResolvedValue({ count: 0 });
    await expectError(BarCommissionService.markPaid(manager, 'line-1', { method: 'cash' }), 409);
  });

  it('cannot pay a draft or a ₦0 line', async () => {
    mockPrisma.commissionRunLine.findUnique.mockResolvedValue({ ...postedLine, status: 'draft' });
    await expectError(BarCommissionService.markPaid(manager, 'line-1', { method: 'cash' }), 409);
    mockPrisma.commissionRunLine.findUnique.mockResolvedValue({ ...postedLine, commission_amount: D(0) });
    await expectError(BarCommissionService.markPaid(manager, 'line-1', { method: 'cash' }), 400);
  });

  it('cancelling a posted, unpaid run voids its expenses; a paid run cannot be cancelled', async () => {
    mockPrisma.commissionRun.findUnique.mockResolvedValue(runRow({ status: 'posted', lines: [{ ...runRow().lines[0], status: 'posted', expense_id: 'exp-1' }] }));
    await BarCommissionService.cancel(manager, 'run-1', 'Wrong period');
    expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['exp-1'] } }, data: { status: 'voided' } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('COMMISSION_RUN_UNPOSTED');
    mockPrisma.commissionRun.findUnique.mockResolvedValue(runRow({ status: 'posted', lines: [{ ...runRow().lines[0], payment_status: 'paid' }] }));
    await expectError(BarCommissionService.cancel(manager, 'run-1', 'too late'), 409, /paid/);
  });
});

describe('reports — ranges, CSV, ageing', () => {
  it('controllers are clamped to the last few days; future “to” is pulled back to today', () => {
    const r = BarReportService.resolveRange({ from: daysAgo(40), to: '2999-01-01' }, TODAY, { controller: true });
    expect(r.to).toBe(TODAY);
    expect(r.from).toBe(daysAgo(CONTROLLER_MAX_DAYS_BACK));
    const m = BarReportService.resolveRange({ from: daysAgo(40), to: TODAY }, TODAY, { controller: false });
    expect(m.from).toBe(daysAgo(40));
    expect(() => BarReportService.resolveRange({ from: TODAY, to: daysAgo(1) }, TODAY, { controller: false })).toThrow(AppError);
  });

  it('a controller asking for years is clamped, not refused (clamp before the length check)', () => {
    const r = BarReportService.resolveRange({ from: '2020-01-01', to: TODAY }, TODAY, { controller: true });
    expect(r).toEqual({ from: daysAgo(CONTROLLER_MAX_DAYS_BACK), to: TODAY });
    expect(() => BarReportService.resolveRange({ from: '2020-01-01', to: TODAY }, TODAY, { controller: false })).toThrow(/at most/);
  });

  it('controllers cannot open manager-only reports', async () => {
    mockPrisma.storeSetting.findUnique.mockResolvedValue(null);
    await expectError(BarReportService.run('commission', 'store_001', ['branch_001'], {}, { controller: true }), 403);
  });

  it('CSV escapes quotes/commas and neutralises spreadsheet formulas', () => {
    const csv = BarReportService.toCsv({
      report: 'remittances', title: 'Money handed over', description: '', from: TODAY, to: TODAY,
      columns: [{ key: 'a', label: 'Attendant', type: 'text' }, { key: 'n', label: 'Note', type: 'text' }, { key: 'v', label: 'Amount', type: 'money' }],
      rows: [{ a: 'Okafor, John', n: '=HYPERLINK("x")', v: -500 }],
      totals: { a: 'Total', n: null, v: -500 },
    });
    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('Attendant,Note,Amount');
    expect(lines[2]).toBe(`"Okafor, John","'=HYPERLINK(""x"")","-500"`);
    expect(lines[3]).toBe(`Total,,"-500"`);
  });

  it('outstanding: hand-overs pay the OLDEST sales first (FIFO ageing)', async () => {
    mockPrisma.storeSetting.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id ? [{ id: 'att-1', first_name: 'John', last_name: null, is_active: true }] : [{ id: 'att-1' }])
    );
    mockPrisma.cashierLedgerEntry.findMany.mockImplementation(({ distinct }: any) =>
      Promise.resolve(
        distinct
          ? [{ cashier_user_id: 'att-1' }]
          : [
              { cashier_user_id: 'att-1', amount: D(5000), business_date: new Date(`${daysAgo(40)}T00:00:00Z`) }, // old sale
              { cashier_user_id: 'att-1', amount: D(3000), business_date: new Date(`${daysAgo(5)}T00:00:00Z`) },
              { cashier_user_id: 'att-1', amount: D(2000), business_date: new Date(`${TODAY}T00:00:00Z`) },
              { cashier_user_id: 'att-1', amount: D(-6000), business_date: new Date(`${daysAgo(1)}T00:00:00Z`) }, // hand-over
            ]
      )
    );
    const t = await BarReportService.run('outstanding', 'store_001', ['branch_001'], {}, { controller: false });
    // 6,000 clears the 40-day-old 5,000 and 1,000 of the 5-day-old 3,000.
    expect(t.rows[0]).toMatchObject({ outstanding: 4000, d31: 0, d8_30: 0, d2_7: 2000, d0_1: 2000, credit: 0 });
  });
});
