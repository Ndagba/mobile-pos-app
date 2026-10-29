/**
 * DB-backed integration test for the /analytics/sales `item_type` filter (Section 5).
 *
 * The route (`backend/src/api/routes/analytics.routes.ts`) slices every per-day sales
 * metric by an optional `item_type` param using a composed `Prisma.sql` fragment:
 *
 *     const itemTypeClause = itemType ? Prisma.sql`AND p.item_type = ${itemType}` : Prisma.empty;
 *     ... WHERE ... AND t.branch_id = ANY(${branchIds}) ${itemTypeClause} ...
 *
 * This test builds that exact clause and runs the same WHERE against real Postgres to
 * prove the slicing contract end-to-end:
 *   - a mixed transaction (product + service line) counts under BOTH PRODUCT and SERVICE;
 *   - revenue / items_sold reflect only the filtered type;
 *   - a service-only transaction is invisible to the PRODUCT filter.
 *
 * It seeds a throwaway store/branch/user + one PRODUCT (with Inventory) + one SERVICE
 * under `anitest_*` ids and cleans up afterwards. Gated on Postgres being reachable —
 * skips cleanly if not (mirrors phase1-mixed-sale).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { TransactionService } from '../../src/services/TransactionService';

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const STORE_ID = 'anitest_store';
const BRANCH_ID = 'anitest_branch';
const USER_ID = 'anitest_user';
const CATEGORY_ID = 'anitest_category';
const PRODUCT_ID = 'anitest_product';
const SERVICE_ID = 'anitest_service';

let dbUp = false;

async function cleanupAll() {
  await prisma.inventoryMovement.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.auditLog.deleteMany({ where: { user_id: USER_ID } });
  await prisma.transaction.deleteMany({ where: { branch_id: BRANCH_ID } }); // cascades transaction_items
  await prisma.product.deleteMany({ where: { branch_id: BRANCH_ID } }); // cascades inventory
  await prisma.category.deleteMany({ where: { branch_id: BRANCH_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.branch.deleteMany({ where: { id: BRANCH_ID } });
}

async function seed() {
  await prisma.branch.create({ data: { id: BRANCH_ID, name: 'ANITEST Branch', store_id: STORE_ID } });
  await prisma.user.create({
    data: { id: USER_ID, email: 'anitest_user@example.com', first_name: 'Analytics', role: 'admin', store_id: STORE_ID, branch_id: BRANCH_ID },
  });
  await prisma.category.create({ data: { id: CATEGORY_ID, name: 'ANITEST Category', branch_id: BRANCH_ID } });
  await prisma.product.create({
    data: {
      id: PRODUCT_ID, category_id: CATEGORY_ID, branch_id: BRANCH_ID, sku: 'ANITEST-PROD', name: 'ANITEST Product',
      marked_price: 100, effective_price: 100, cost_price: 40, item_type: 'PRODUCT',
      inventory: { create: { quantity_on_hand: 1000 } },
    },
  });
  await prisma.product.create({
    data: {
      id: SERVICE_ID, category_id: CATEGORY_ID, branch_id: BRANCH_ID, sku: 'ANITEST-SVC', name: 'ANITEST Service',
      marked_price: 50, effective_price: 50, item_type: 'SERVICE', // no inventory row
    },
  });
}

function baseTx(over: Record<string, any> = {}): any {
  return {
    store_id: STORE_ID, branch_id: BRANCH_ID, user_id: USER_ID,
    subtotal: 0, tax_amount: 0, discount_amount: 0, total_amount: 0,
    payment_method: 'cash' as const, items: [], ...over,
  };
}

// Window comfortably bracketing "now" so both transactions fall inside it.
const from = new Date(Date.now() - 60 * 60 * 1000);
const to = new Date(Date.now() + 60 * 60 * 1000);

/**
 * Runs the SAME WHERE + composed item_type clause the /analytics/sales route uses,
 * aggregated over the window (no GROUP BY — the clause behaves identically, and this
 * yields single totals regardless of the day boundary).
 */
async function salesTotals(itemType: 'PRODUCT' | 'SERVICE' | null) {
  const itemTypeClause = itemType ? Prisma.sql`AND p.item_type = ${itemType}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ transactions: number; revenue: number; items_sold: number }>>`
    SELECT
      CAST(COUNT(DISTINCT t.id) AS INT)              AS transactions,
      CAST(COALESCE(SUM(ti.line_total), 0) AS FLOAT) AS revenue,
      CAST(COALESCE(SUM(ti.quantity), 0)   AS FLOAT) AS items_sold
    FROM "Transaction" t
    LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
    LEFT JOIN "Product" p ON p.id = ti.product_id
    WHERE t.status = 'completed'
      AND t.created_at >= ${from}
      AND t.created_at <= ${to}
      AND t.branch_id = ANY(${[BRANCH_ID]})
      ${itemTypeClause}
  `;
  const r = rows[0] ?? { transactions: 0, revenue: 0, items_sold: 0 };
  return { transactions: Number(r.transactions), revenue: Number(r.revenue), items_sold: Number(r.items_sold) };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[analytics-sales-itemtype] Postgres not reachable — skipping DB-backed integration tests.');
    return;
  }
  await cleanupAll();
  await seed();

  // Mixed transaction: product qty 2 (@100 = 200) + service qty 1 (@50 = 50).
  await TransactionService.createTransaction(
    baseTx({
      offline_session_hash: 'anitest_hash_mixed', subtotal: 250, total_amount: 250,
      items: [
        { product_id: PRODUCT_ID, quantity: 2, unit_price: 100, tax_amount: 0, line_total: 200 },
        { product_id: SERVICE_ID, quantity: 1, unit_price: 50, tax_amount: 0, line_total: 50 },
      ],
    })
  );
  // Service-only transaction: service qty 3 (@50 = 150).
  await TransactionService.createTransaction(
    baseTx({
      offline_session_hash: 'anitest_hash_svc', subtotal: 150, total_amount: 150,
      items: [{ product_id: SERVICE_ID, quantity: 3, unit_price: 50, tax_amount: 0, line_total: 150 }],
    })
  );
});

afterAll(async () => {
  if (dbUp) await cleanupAll();
  await prisma.$disconnect();
});

describe('Analytics /sales — item_type filter (DB-backed)', () => {
  it('ALL (no filter): combines products and services across both transactions', async () => {
    if (!dbUp) return;
    const all = await salesTotals(null);
    expect(all.transactions).toBe(2);      // both transactions
    expect(all.revenue).toBe(400);         // 200 + 50 + 150
    expect(all.items_sold).toBe(6);        // 2 + 1 + 3
  });

  it('PRODUCT: only the product line of the mixed transaction', async () => {
    if (!dbUp) return;
    const prod = await salesTotals('PRODUCT');
    expect(prod.transactions).toBe(1);     // only the mixed tx has a product line
    expect(prod.revenue).toBe(200);        // product line only
    expect(prod.items_sold).toBe(2);       // service qty excluded
  });

  it('SERVICE: both transactions have a service line (mixed counts under SERVICE too)', async () => {
    if (!dbUp) return;
    const svc = await salesTotals('SERVICE');
    expect(svc.transactions).toBe(2);      // mixed + service-only
    expect(svc.revenue).toBe(200);         // 50 + 150
    expect(svc.items_sold).toBe(4);        // 1 + 3
  });

  it('the mixed transaction is counted under BOTH PRODUCT and SERVICE (revenue splits, not double-counts)', async () => {
    if (!dbUp) return;
    const [all, prod, svc] = await Promise.all([salesTotals(null), salesTotals('PRODUCT'), salesTotals('SERVICE')]);
    // Product + service revenue reconstructs the combined total exactly.
    expect(prod.revenue + svc.revenue).toBe(all.revenue);
    expect(prod.items_sold + svc.items_sold).toBe(all.items_sold);
  });
});
