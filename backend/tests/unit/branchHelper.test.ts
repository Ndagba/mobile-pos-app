/**
 * assertBranchAccess — used by the P&L routes (/v1/financials/*), which take a camelCase
 * `branchId` the other branch helpers don't read. Hermetic: Prisma is mocked.
 */
jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  m.branch = { findUnique: jest.fn(), findMany: jest.fn() };
  m.managerBranch = { findUnique: jest.fn(), findMany: jest.fn() };
  return { __esModule: true, prisma: m, default: m };
});

import { prisma } from '../../src/lib/prisma';
import { assertBranchAccess } from '../../src/utils/branchHelper';
import { AppError } from '../../src/utils/errorHandler';

const mockPrisma = prisma as any;
const REPORT_ROLES = ['admin', 'manager'];

const req = (user: Record<string, any> | null) => ({ user, query: {}, body: {} }) as any;
const admin = { userId: 'a1', role: 'admin', storeId: 'store_001', branchId: 'b1' };
const manager = { userId: 'm1', role: 'manager', storeId: 'store_001', branchId: 'b1' };
const cashier = { userId: 'c1', role: 'cashier', storeId: 'store_001', branchId: 'b1' };

const expectStatus = async (p: Promise<unknown>, status: number) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
};

beforeEach(() => {
  jest.clearAllMocks();
  // Admin: every active branch of the store.
  mockPrisma.branch.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
  // Manager: home b1 + assigned b3.
  mockPrisma.managerBranch.findMany.mockResolvedValue([{ branch_id: 'b3' }]);
});

describe('assertBranchAccess', () => {
  it('admin: any branch of their store, not another store’s', async () => {
    await expect(assertBranchAccess(req(admin), 'b2', REPORT_ROLES)).resolves.toBeUndefined();
    await expectStatus(assertBranchAccess(req(admin), 'other-store-branch', REPORT_ROLES), 403);
  });

  it('manager: home and assigned branches only', async () => {
    await expect(assertBranchAccess(req(manager), 'b1', REPORT_ROLES)).resolves.toBeUndefined();
    await expect(assertBranchAccess(req(manager), 'b3', REPORT_ROLES)).resolves.toBeUndefined();
    await expectStatus(assertBranchAccess(req(manager), 'b2', REPORT_ROLES), 403);
  });

  it('cashiers are refused by role before any branch lookup', async () => {
    await expectStatus(assertBranchAccess(req(cashier), 'b1', REPORT_ROLES), 403);
    expect(mockPrisma.branch.findMany).not.toHaveBeenCalled();
  });

  it('without a role list, a cashier may reach only their home branch', async () => {
    await expect(assertBranchAccess(req(cashier), 'b1')).resolves.toBeUndefined();
    await expectStatus(assertBranchAccess(req(cashier), 'b2'), 403);
  });

  it('no authenticated user → 401', async () => {
    await expectStatus(assertBranchAccess(req(null), 'b1', REPORT_ROLES), 401);
  });
});
