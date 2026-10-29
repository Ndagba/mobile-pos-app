/**
 * Phase-1 DB-backed integration test — runs against the real (migrated) dev Postgres.
 *
 * Unlike the hermetic unit tests, this exercises TransactionService end-to-end against
 * live rows to prove the migration + service logic hold together:
 *   - a mixed cart decrements the PRODUCT's real Decimal(15,4) quantity_on_hand
 *     untruncated and writes exactly one InventoryMovement, while the SERVICE line
 *     never gets an inventory row or movement;
 *   - voidTransaction restores the PRODUCT quantity only;
 *   - a duplicate offline_session_hash is idempotent (no double decrement).
 *
 * It seeds a throwaway store/branch/user + one PRODUCT (with Inventory) + one SERVICE
 * under recognizable `p1itest_*` ids and deletes them afterwards, so it never pollutes
 * the shared dev DB. Gated on Postgres being reachable — if it is not, the suite skips
 * cleanly rather than failing.
 */

import { prisma } from '../../src/lib/prisma';
import { TransactionService } from '../../src/services/TransactionService';

// Silence real logging so the pino-pretty transport worker doesn't keep the process
// alive after the run. The DB is the thing under test here, not logging.
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Deterministic ids so a crashed run leaves nothing that a later run can't reclaim.
const STORE_ID = 'p1itest_store';
const BRANCH_ID = 'p1itest_branch';
const USER_ID = 'p1itest_user';
const CATEGORY_ID = 'p1itest_category';
const PRODUCT_ID = 'p1itest_product';
const SERVICE_ID = 'p1itest_service';

const START_QTY = 100;

let dbUp = false;

/** Remove all rows this suite creates, in FK-safe order. Safe to run repeatedly. */
async function cleanupAll() {
  await prisma.inventoryMovement.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.auditLog.deleteMany({ where: { user_id: USER_ID } });
  await prisma.transaction.deleteMany({ where: { branch_id: BRANCH_ID } }); // cascades transaction_items
  await prisma.product.deleteMany({ where: { branch_id: BRANCH_ID } }); // cascades inventory + batches
  await prisma.category.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.branch.deleteMany({ where: { id: BRANCH_ID } });
}

async function seed() {
  await prisma.branch.create({
    data: { id: BRANCH_ID, name: 'P1ITEST Branch', store_id: STORE_ID },
  });
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: 'p1itest_user@example.com',
      first_name: 'Phase1',
      role: 'admin',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
    },
  });
  await prisma.category.create({
    data: { id: CATEGORY_ID, name: 'P1ITEST Category', branch_id: BRANCH_ID },
  });
  await prisma.product.create({
    data: {
      id: PRODUCT_ID,
      category_id: CATEGORY_ID,
      branch_id: BRANCH_ID,
      sku: 'P1ITEST-PROD',
      name: 'P1ITEST Product',
      marked_price: 100,
      effective_price: 100,
      item_type: 'PRODUCT',
      inventory: { create: { quantity_on_hand: START_QTY } },
    },
  });
  await prisma.product.create({
    data: {
      id: SERVICE_ID,
      category_id: CATEGORY_ID,
      branch_id: BRANCH_ID,
      sku: 'P1ITEST-SVC',
      name: 'P1ITEST Service',
      marked_price: 50,
      effective_price: 50,
      item_type: 'SERVICE',
      // No inventory row — services hold no physical stock.
    },
  });
}

/** Reset per-test mutable state without tearing down the seeded catalog. */
async function resetState() {
  await prisma.inventoryMovement.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.auditLog.deleteMany({ where: { user_id: USER_ID } });
  await prisma.transaction.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.inventory.update({
    where: { product_id: PRODUCT_ID },
    data: { quantity_on_hand: START_QTY, quantity_reserved: 0 },
  });
}

function baseTx(over: Record<string, any> = {}): any {
  return {
    store_id: STORE_ID,
    branch_id: BRANCH_ID,
    user_id: USER_ID,
    subtotal: 0,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: 0,
    payment_method: 'cash' as const,
    items: [],
    ...over,
  };
}

async function onHand(productId: string): Promise<number | null> {
  const inv = await prisma.inventory.findUnique({ where: { product_id: productId } });
  return inv ? Number(inv.quantity_on_hand) : null;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[phase1-mixed-sale] Postgres not reachable — skipping DB-backed integration tests.');
    return;
  }
  await cleanupAll();
  await seed();
});

afterAll(async () => {
  if (dbUp) await cleanupAll();
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!dbUp) return;
  await resetState();
});

describe('Phase 1 — mixed product/service sale (DB-backed)', () => {
  it('decrements the product by a decimal quantity and writes one movement; the service is untouched', async () => {
    if (!dbUp) return;

    const created: any = await TransactionService.createTransaction(
      baseTx({
        offline_session_hash: 'p1itest_hash_mixed',
        subtotal: 300,
        total_amount: 300,
        items: [
          { product_id: PRODUCT_ID, quantity: 2.5, unit_price: 100, tax_amount: 0, line_total: 250 },
          { product_id: SERVICE_ID, quantity: 1, unit_price: 50, tax_amount: 0, line_total: 50 },
        ],
      })
    );

    // Product stock dropped by exactly 2.5 (Decimal untruncated).
    expect(await onHand(PRODUCT_ID)).toBe(97.5);
    // Service never had an inventory row.
    expect(await onHand(SERVICE_ID)).toBeNull();

    // Exactly one movement, for the product, of -2.5.
    const movements = await prisma.inventoryMovement.findMany({ where: { branch_id: BRANCH_ID } });
    expect(movements).toHaveLength(1);
    expect(movements[0].product_id).toBe(PRODUCT_ID);
    expect(Number(movements[0].quantity)).toBe(-2.5);
    expect(movements[0].movement_type).toBe('sale');

    // Both lines recorded on the transaction.
    const items = await prisma.transactionItem.findMany({ where: { transaction_id: created.id } });
    expect(items).toHaveLength(2);
  });

  it('void restores the product quantity only (service line is a no-op)', async () => {
    if (!dbUp) return;

    const created: any = await TransactionService.createTransaction(
      baseTx({
        offline_session_hash: 'p1itest_hash_void',
        subtotal: 350,
        total_amount: 350,
        items: [
          { product_id: PRODUCT_ID, quantity: 3, unit_price: 100, tax_amount: 0, line_total: 300 },
          { product_id: SERVICE_ID, quantity: 1, unit_price: 50, tax_amount: 0, line_total: 50 },
        ],
      })
    );

    expect(await onHand(PRODUCT_ID)).toBe(START_QTY - 3); // 97

    await TransactionService.voidTransaction(created.id, 'integration void', USER_ID);

    // Restored to the starting quantity.
    expect(await onHand(PRODUCT_ID)).toBe(START_QTY);
    expect(await onHand(SERVICE_ID)).toBeNull();

    // Two product movements: the sale (-3) and the void adjustment (+3); none for the service.
    const movements = await prisma.inventoryMovement.findMany({ where: { branch_id: BRANCH_ID } });
    expect(movements.every((m) => m.product_id === PRODUCT_ID)).toBe(true);
    expect(movements.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([-3, 3]);

    const tx = await prisma.transaction.findUnique({ where: { id: created.id } });
    expect(tx?.status).toBe('voided');
  });

  it('is idempotent: a duplicate offline_session_hash does not decrement stock twice', async () => {
    if (!dbUp) return;

    const input = baseTx({
      offline_session_hash: 'p1itest_hash_dup',
      subtotal: 500,
      total_amount: 500,
      items: [{ product_id: PRODUCT_ID, quantity: 5, unit_price: 100, tax_amount: 0, line_total: 500 }],
    });

    const first: any = await TransactionService.createTransaction(input);
    const second: any = await TransactionService.createTransaction(input);

    // Same transaction returned; stock decremented once.
    expect(second.id).toBe(first.id);
    expect(await onHand(PRODUCT_ID)).toBe(START_QTY - 5); // 95, not 90

    const txCount = await prisma.transaction.count({
      where: { offline_session_hash: 'p1itest_hash_dup' },
    });
    expect(txCount).toBe(1);

    const movements = await prisma.inventoryMovement.findMany({ where: { branch_id: BRANCH_ID } });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-5);
  });
});
