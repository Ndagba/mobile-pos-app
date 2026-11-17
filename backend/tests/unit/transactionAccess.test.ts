/**
 * Phase 0 access rules for sales (risks R1, R2, R3; decision D1 — all stores).
 * Pure functions: no Prisma, no Express.
 */
import {
  canAccessTransaction,
  canVoidTransaction,
  isSameStore,
  scopedListUserId,
} from '../../src/utils/transactionAccess';

const cashier = { userId: 'c1', role: 'cashier', storeId: 'store_001' };
const manager = { userId: 'm1', role: 'manager', storeId: 'store_001' };
const admin = { userId: 'a1', role: 'admin', storeId: 'store_001' };
const superAdmin = { userId: 's1', role: 'admin', storeId: 'store_999', is_super_admin: true };
// A non-standard role string must be treated like a cashier (least privilege).
const unknownRole = { userId: 'x1', role: 'bar_attendant', storeId: 'store_001' };

const ownSale = { store_id: 'store_001', user_id: 'c1' };
const colleagueSale = { store_id: 'store_001', user_id: 'c2' };
const otherStoreSale = { store_id: 'store_002', user_id: 'c9' };

describe('scopedListUserId (R1)', () => {
  it('forces a cashier to their own id, ignoring any requested userId', () => {
    expect(scopedListUserId(cashier)).toBe('c1');
    expect(scopedListUserId(cashier, 'c2')).toBe('c1');
  });

  it('treats unknown roles like a cashier', () => {
    expect(scopedListUserId(unknownRole, 'c2')).toBe('x1');
  });

  it('leaves supervisors unrestricted, honouring an explicit filter', () => {
    expect(scopedListUserId(manager)).toBeUndefined();
    expect(scopedListUserId(admin, 'c2')).toBe('c2');
    expect(scopedListUserId(superAdmin)).toBeUndefined();
  });
});

describe('canAccessTransaction (R2)', () => {
  it('cashier: own sale yes, colleague no, other store no', () => {
    expect(canAccessTransaction(cashier, ownSale)).toBe(true);
    expect(canAccessTransaction(cashier, colleagueSale)).toBe(false);
    expect(canAccessTransaction(cashier, otherStoreSale)).toBe(false);
  });

  it('manager/admin: any sale in their store, none in another store', () => {
    expect(canAccessTransaction(manager, colleagueSale)).toBe(true);
    expect(canAccessTransaction(admin, colleagueSale)).toBe(true);
    expect(canAccessTransaction(admin, otherStoreSale)).toBe(false);
  });

  it('super-admin: any store', () => {
    expect(canAccessTransaction(superAdmin, otherStoreSale)).toBe(true);
  });

  it('a user with no store in the token sees nothing (unless super-admin)', () => {
    expect(canAccessTransaction({ userId: 'm1', role: 'manager', storeId: null }, colleagueSale)).toBe(false);
  });
});

describe('isSameStore (refund tenant check)', () => {
  it('lets a cashier act on a colleague sale in the same store, not another store', () => {
    expect(isSameStore(cashier, colleagueSale)).toBe(true);
    expect(isSameStore(cashier, otherStoreSale)).toBe(false);
    expect(isSameStore(superAdmin, ownSale)).toBe(true);
  });
});

describe('canVoidTransaction (R3)', () => {
  it('admin, manager and super-admin only', () => {
    expect(canVoidTransaction(admin)).toBe(true);
    expect(canVoidTransaction(manager)).toBe(true);
    expect(canVoidTransaction(superAdmin)).toBe(true);
    expect(canVoidTransaction(cashier)).toBe(false);
    expect(canVoidTransaction(unknownRole)).toBe(false);
  });
});
