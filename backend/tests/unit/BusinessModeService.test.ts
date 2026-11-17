/**
 * BusinessModeService — mode lock, mode changes, profile assignment (Bar/Lounge Phase 1).
 * Hermetic: Prisma is mocked.
 */
jest.mock('../../src/lib/prisma', () => {
  const { createMockPrisma } = require('../helpers/mockPrisma');
  const m = createMockPrisma();
  return { __esModule: true, prisma: m, default: m };
});

import { prisma } from '../../src/lib/prisma';
import { BusinessModeService } from '../../src/services/BusinessModeService';
import { AppError } from '../../src/utils/errorHandler';
import { MockPrisma, primeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = prisma as unknown as MockPrisma;

const admin = { userId: 'a1', role: 'admin', storeId: 'store_001' };
const manager = { userId: 'm1', role: 'manager', storeId: 'store_001' };
const superAdmin = { userId: 's1', role: 'admin', storeId: 'store_999', is_super_admin: true };

beforeEach(() => {
  jest.resetAllMocks();
  primeMockPrisma(mockPrisma);
  mockPrisma.store.findUnique.mockResolvedValue({ id: 'store_001', business_mode: 'retail' });
  mockPrisma.transaction.count.mockResolvedValue(0);
});

const expectError = async (p: Promise<unknown>, status: number, msg?: RegExp) => {
  const err: any = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err.statusCode).toBe(status);
  if (msg) expect(err.message).toMatch(msg);
};

describe('getStoreMode / lock', () => {
  it('missing store or unknown value reads as retail', async () => {
    mockPrisma.store.findUnique.mockResolvedValue(null);
    expect(await BusinessModeService.getStoreMode('store_x')).toBe('retail');
    mockPrisma.store.findUnique.mockResolvedValue({ business_mode: 'weird' });
    expect(await BusinessModeService.getStoreMode('store_x')).toBe('retail');
    expect(await BusinessModeService.getStoreMode(null)).toBe('retail');
  });

  it('locks once the store has any sale', async () => {
    mockPrisma.transaction.count.mockResolvedValue(0);
    expect(await BusinessModeService.isModeLocked('store_001')).toBe(false);
    mockPrisma.transaction.count.mockResolvedValue(1);
    expect(await BusinessModeService.isModeLocked('store_001')).toBe(true);
    expect(mockPrisma.transaction.count).toHaveBeenLastCalledWith({ where: { store_id: 'store_001' } });
  });
});

describe('setStoreMode', () => {
  it('admin switches an unlocked store to bar, audited in the same DB transaction', async () => {
    const r = await BusinessModeService.setStoreMode('store_001', 'bar', admin);
    expect(r).toEqual({ business_mode: 'bar', business_mode_locked: false, changed: true });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store_001' },
      data: { business_mode: 'bar', business_mode_set_at: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      store_id: 'store_001',
      user_id: 'a1',
      action: 'CHANGE_BUSINESS_MODE',
      changes: { from: 'retail', to: 'bar', locked_at_change: false },
    });
  });

  it('admin is refused once the store has sales (D3)', async () => {
    mockPrisma.transaction.count.mockResolvedValue(5);
    await expectError(BusinessModeService.setStoreMode('store_001', 'bar', admin), 403, /locked/i);
    expect(mockPrisma.store.update).not.toHaveBeenCalled();
  });

  it('super-admin may change a locked store of any tenant, and it is recorded as such', async () => {
    mockPrisma.transaction.count.mockResolvedValue(5);
    await BusinessModeService.setStoreMode('store_001', 'bar', superAdmin);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.changes).toMatchObject({
      locked_at_change: true,
      by_super_admin: true,
    });
  });

  it('managers cannot change the mode', async () => {
    await expectError(BusinessModeService.setStoreMode('store_001', 'bar', manager), 403);
  });

  it('an admin cannot change another store', async () => {
    await expectError(BusinessModeService.setStoreMode('store_002', 'bar', admin), 403);
  });

  it('rejects invalid modes and no-ops when unchanged', async () => {
    await expectError(BusinessModeService.setStoreMode('store_001', 'Bar', admin), 400);
    const r = await BusinessModeService.setStoreMode('store_001', 'retail', admin);
    expect(r.changed).toBe(false);
    expect(mockPrisma.store.update).not.toHaveBeenCalled();
  });
});

describe('setUserProfile', () => {
  const cashier = { id: 'c1', store_id: 'store_001', role: 'cashier', operational_profile: null, is_active: true };

  beforeEach(() => {
    mockPrisma.store.findUnique.mockResolvedValue({ id: 'store_001', business_mode: 'bar' });
    mockPrisma.user.findUnique.mockResolvedValue(cashier);
  });

  it('admin assigns Attendant to a cashier in a bar store, audited', async () => {
    const r = await BusinessModeService.setUserProfile('c1', 'bar_attendant', admin);
    expect(r).toEqual({ id: 'c1', operational_profile: 'bar_attendant', changed: true });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { operational_profile: 'bar_attendant' } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'SET_OPERATIONAL_PROFILE',
      store_id: 'store_001',
      changes: { from: null, to: 'bar_attendant' },
    });
  });

  it('only admins may assign (D16)', async () => {
    await expectError(BusinessModeService.setUserProfile('c1', 'bar_attendant', manager), 403);
  });

  it('other-store targets look missing (404)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...cashier, store_id: 'store_002' });
    await expectError(BusinessModeService.setUserProfile('c1', 'bar_attendant', admin), 404);
  });

  it('only cashiers can hold a profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...cashier, role: 'manager' });
    await expectError(BusinessModeService.setUserProfile('c1', 'bar_controller', admin), 400, /cashiers/i);
  });

  it('profiles cannot be assigned in a retail store, but can always be cleared', async () => {
    mockPrisma.store.findUnique.mockResolvedValue({ id: 'store_001', business_mode: 'retail' });
    await expectError(BusinessModeService.setUserProfile('c1', 'bar_controller', admin), 400, /Bar \/ Lounge/);
    mockPrisma.user.findUnique.mockResolvedValue({ ...cashier, operational_profile: 'bar_controller' });
    const r = await BusinessModeService.setUserProfile('c1', null, admin);
    expect(r.operational_profile).toBeNull();
  });

  it('rejects unknown profile values', async () => {
    await expectError(BusinessModeService.setUserProfile('c1', 'waiter', admin), 400);
  });
});
