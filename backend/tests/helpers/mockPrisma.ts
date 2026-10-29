/**
 * Hermetic Prisma mock for unit tests — no real database connection.
 *
 * Every model method is a `jest.fn()`. `$transaction(cb)` invokes `cb` with the
 * same mock object (so `tx.<model>` === `prisma.<model>` and side-effects are
 * observable), and `Promise.all`s the array form. Shared by the TransactionService
 * and InventoryService unit tests.
 *
 * Usage (note: the `jest.mock` factory is hoisted, so create the mock *inside* it
 * and read it back through the mocked import):
 *
 *   jest.mock('../../src/lib/prisma', () => {
 *     const { createMockPrisma } = require('../helpers/mockPrisma');
 *     const m = createMockPrisma();
 *     return { __esModule: true, prisma: m, default: m };
 *   });
 *   import { prisma } from '../../src/lib/prisma';
 *   const mockPrisma = prisma as unknown as MockPrisma;
 *
 *   beforeEach(() => { jest.resetAllMocks(); primeMockPrisma(mockPrisma); });
 */

export interface MockModel {
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  groupBy: jest.Mock;
}

function mockModel(): MockModel {
  return {
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
  };
}

export interface MockPrisma {
  transaction: MockModel;
  transactionItem: MockModel;
  product: MockModel;
  inventory: MockModel;
  inventoryMovement: MockModel;
  customer: MockModel;
  auditLog: MockModel;
  batchTracking: MockModel;
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
  [key: string]: any;
}

/**
 * Wire `$transaction` to run its callback against the mock itself. Called after
 * `jest.resetAllMocks()` (which strips implementations) to restore the passthrough.
 */
export function primeMockPrisma(mock: MockPrisma): void {
  mock.$transaction.mockImplementation((arg: any) => {
    if (typeof arg === 'function') return Promise.resolve(arg(mock));
    if (Array.isArray(arg)) return Promise.all(arg);
    return Promise.resolve(undefined);
  });
}

export function createMockPrisma(): MockPrisma {
  const mock: any = {
    transaction: mockModel(),
    transactionItem: mockModel(),
    product: mockModel(),
    inventory: mockModel(),
    inventoryMovement: mockModel(),
    customer: mockModel(),
    auditLog: mockModel(),
    batchTracking: mockModel(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  primeMockPrisma(mock as MockPrisma);
  return mock as MockPrisma;
}
