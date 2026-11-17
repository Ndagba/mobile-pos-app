/**
 * Backfill the Attendant ledger for bar orders released before Phase 3 existed.
 *
 *   npx ts-node src/scripts/backfillBarLedger.ts            # dry run (default)
 *   npx ts-node src/scripts/backfillBarLedger.ts --apply    # write entries
 *
 * Idempotent: the ledger's @@unique(entry_type, source_type, source_id) means a
 * second run creates nothing. For every released (fulfilled / reversal_requested)
 * or reversed order without a SALE entry it adds the SALE entry on the order's
 * business date; for reversed orders it also adds the matching SALE_REVERSAL on the
 * date the order was reversed. Each order is written in its own DB transaction.
 */
import { prisma } from '../lib/prisma';
import { businessDateToDbDate, getBusinessDate } from '../utils/businessDate';

async function main() {
  const apply = process.argv.includes('--apply');
  const orders = await prisma.barOrder.findMany({
    where: { status: { in: ['fulfilled', 'reversal_requested', 'reversed'] }, fulfilled_at: { not: null } },
    select: {
      id: true, store_id: true, branch_id: true, status: true, initiated_by_user_id: true,
      fulfilled_by_user_id: true, closed_by_user_id: true, fulfilled_total: true, total_amount: true,
      business_date: true, fulfilled_at: true, closed_at: true, closed_reason: true,
    },
  });

  let sales = 0, reversals = 0, skipped = 0;
  for (const o of orders) {
    const existing = await prisma.cashierLedgerEntry.findMany({
      where: { source_type: 'bar_order', source_id: o.id },
      select: { id: true, entry_type: true },
    });
    const hasSale = existing.find((e) => e.entry_type === 'SALE');
    const hasRev = existing.some((e) => e.entry_type === 'SALE_REVERSAL');
    const needRev = o.status === 'reversed' && !hasRev;
    if (hasSale && !needRev) { skipped++; continue; }

    const amount = Number(o.fulfilled_total ?? o.total_amount);
    const saleDate = o.business_date ?? businessDateToDbDate(getBusinessDate(o.fulfilled_at!));
    const revDate = businessDateToDbDate(getBusinessDate(o.closed_at ?? new Date()));
    console.log(`${apply ? 'APPLY' : 'DRY  '} ${o.id} ${o.status} ₦${amount}${hasSale ? '' : ' +SALE'}${needRev ? ' +SALE_REVERSAL' : ''}`);
    if (!apply) { if (!hasSale) sales++; if (needRev) reversals++; continue; }

    await prisma.$transaction(async (tx) => {
      const sale = hasSale
        ? hasSale
        : await tx.cashierLedgerEntry.create({
            data: {
              store_id: o.store_id, branch_id: o.branch_id, cashier_user_id: o.initiated_by_user_id,
              entry_type: 'SALE', amount, business_date: saleDate, source_type: 'bar_order', source_id: o.id,
              reason: 'Backfilled (Phase 3)', recorded_by_user_id: o.fulfilled_by_user_id ?? o.initiated_by_user_id,
            },
          });
      if (!hasSale) sales++;
      if (needRev) {
        await tx.cashierLedgerEntry.create({
          data: {
            store_id: o.store_id, branch_id: o.branch_id, cashier_user_id: o.initiated_by_user_id,
            entry_type: 'SALE_REVERSAL', amount: -amount, business_date: revDate, source_type: 'bar_order',
            source_id: o.id, reverses_entry_id: sale.id, reason: `Backfilled (Phase 3): ${o.closed_reason ?? ''}`.trim(),
            recorded_by_user_id: o.closed_by_user_id ?? o.initiated_by_user_id,
          },
        });
        reversals++;
      }
    });
  }
  console.log(`${apply ? 'Applied' : 'Would apply'}: ${sales} SALE, ${reversals} SALE_REVERSAL; ${skipped} already complete.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
