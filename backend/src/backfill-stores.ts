/**
 * One-time backfill: insert a Store row for every distinct store_id that
 * already exists on Users/Branches/Transactions but doesn't yet have a Store
 * record. Safe to re-run — uses upsert semantics.
 *
 * Run this once after `prisma db push` adds the Store table, so the new
 * Stores list in the app shows your existing demo store.
 *
 * Usage:
 *   npx ts-node src/backfill-stores.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Collect every distinct store_id mentioned anywhere in the schema.
  const [userStores, branchStores, txStores] = await Promise.all([
    prisma.user.findMany({ select: { store_id: true }, distinct: ['store_id'] }),
    prisma.branch.findMany({ select: { store_id: true }, distinct: ['store_id'] }),
    prisma.transaction.findMany({ select: { store_id: true }, distinct: ['store_id'] }),
  ]);

  const ids = new Set<string>();
  for (const r of [...userStores, ...branchStores, ...txStores]) {
    if (r.store_id) ids.add(r.store_id);
  }

  if (ids.size === 0) {
    console.log('No store_id values found anywhere. Nothing to backfill.');
    process.exit(0);
  }

  let created = 0;
  let skipped = 0;
  for (const id of ids) {
    const existing = await prisma.store.findUnique({ where: { id } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.store.create({
      data: {
        id,
        name: id === 'store_001' ? 'Demo Store' : id,
        currency: 'NGN',
      },
    });
    created++;
    console.log(`  + ${id}`);
  }

  console.log(`\n✓ Backfill complete — ${created} created, ${skipped} already existed.`);
  console.log('Open Settings → Platform → Stores to see them.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
