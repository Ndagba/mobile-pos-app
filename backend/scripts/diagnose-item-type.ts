import { PrismaClient } from '@prisma/client';

/**
 * Diagnose the Product-vs-Service split for the DB this backend points at.
 *
 * Run:  npx ts-node scripts/diagnose-item-type.ts
 *
 * It answers the three questions behind "my services show as products":
 *   1. Are products actually stored with item_type = 'SERVICE'?
 *   2. Does any SERVICE wrongly carry an Inventory row (would make it look like stock)?
 *   3. What do the most-recent rows look like exactly as GET /products returns them?
 *
 * If (1) shows zero services but the app displays some, the app is rendering STALE
 * OFFLINE CACHE (or was created while offline) — refresh/re-login on the device.
 * If services exist here but the app still mislabels them, the running server is
 * older than the item_type change — rebuild (npm run build) and restart it.
 */
const prisma = new PrismaClient();

async function main() {
  const byType = await prisma.$queryRaw<Array<{ item_type: string | null; n: bigint }>>`
    SELECT item_type, COUNT(*)::bigint AS n
    FROM "Product" WHERE is_active = true
    GROUP BY item_type ORDER BY item_type
  `;
  console.log('\n=== active products by item_type ===');
  console.table(byType.map(r => ({ item_type: r.item_type, count: Number(r.n) })));

  const svcWithInv = await prisma.$queryRaw<Array<{ id: string; name: string; qoh: any }>>`
    SELECT p.id, p.name, i.quantity_on_hand AS qoh
    FROM "Product" p JOIN "Inventory" i ON i.product_id = p.id
    WHERE p.item_type = 'SERVICE'
  `;
  console.log('\n=== SERVICE rows that wrongly have an Inventory row (should be empty) ===');
  console.log(svcWithInv.length ? svcWithInv : '(none — good)');

  const recent = await prisma.product.findMany({
    where: { is_active: true },
    select: { name: true, item_type: true, unit: true, inventory: { select: { quantity_on_hand: true } } },
    orderBy: { created_at: 'desc' },
    take: 15,
  });
  console.log('\n=== 15 most recent products (as GET /products returns them) ===');
  console.table(recent.map(p => ({ name: p.name, item_type: p.item_type, unit: p.unit, qoh: p.inventory?.quantity_on_hand ?? null })));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
