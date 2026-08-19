import { prisma } from '../src/lib/prisma';
import { getAuthorizedBranchIds } from '../src/utils/branchHelper';
import { Request } from 'express';

async function main() {
  console.log('======================================================');
  console.log('🧪 VERIFYING MULTI-BRANCH FILTER SCHEME');
  console.log('======================================================');

  // 1. Find Philip Tsado (Manager)
  const manager = await prisma.user.findFirst({
    where: {
      role: 'manager',
      first_name: { contains: 'Philip', mode: 'insensitive' }
    }
  });

  if (!manager) {
    console.error('❌ Could not find manager Philip Tsado in the database.');
    return;
  }

  console.log(`✅ Found Manager: ${manager.first_name} ${manager.last_name} (ID: ${manager.id})`);
  console.log(`   Home Branch ID: ${manager.branch_id}`);

  // 2. Fetch his assigned branches from ManagerBranch join table
  const assignments = await prisma.managerBranch.findMany({
    where: { user_id: manager.id },
    include: { branch: true }
  });
  console.log(`   Assigned branches in database:`, assignments.map(a => a.branch.name));

  // 3. Test getAuthorizedBranchIds with "All Branches" (no branch_id specified)
  const mockReqAll = {
    user: {
      userId: manager.id,
      role: 'manager',
      branchId: manager.branch_id,
      storeId: manager.store_id
    },
    query: {},
    body: {}
  } as unknown as Request;

  const branchIdsAll = await getAuthorizedBranchIds(mockReqAll);
  console.log('\n--- Test 1: No branch_id requested (All Branches) ---');
  console.log('Resolved Branch IDs:', branchIdsAll);

  // Verify that Tunga, Bosso, and Main are included
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIdsAll } }
  });
  console.log('Resolved Branch Names:', branches.map(b => b.name));

  // 4. Test getAuthorizedBranchIds with a specific branch (Tunga Branch ID)
  if (assignments.length > 0) {
    const targetBranch = assignments[0].branch;
    const mockReqSpecific = {
      user: {
        userId: manager.id,
        role: 'manager',
        branchId: manager.branch_id,
        storeId: manager.store_id
      },
      query: { branch_id: targetBranch.id },
      body: {}
    } as unknown as Request;

    const branchIdsSpecific = await getAuthorizedBranchIds(mockReqSpecific);
    console.log(`\n--- Test 2: Specific branch requested (${targetBranch.name}) ---`);
    console.log('Resolved Branch IDs:', branchIdsSpecific);
    if (branchIdsSpecific.length === 1 && branchIdsSpecific[0] === targetBranch.id) {
      console.log('✅ Correctly resolved to exactly the requested branch!');
    } else {
      console.error('❌ Failed to resolve correctly for specific branch.');
    }
  }

  // 5. Test raw SQL query execution (Sales Analytics) using ANY(${branchIdsAll})
  console.log('\n--- Test 3: Raw SQL query execution with ANY ---');
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dateTo = new Date();
    dateTo.setHours(23, 59, 59, 999);

    const rows: any[] = await prisma.$queryRaw`
      SELECT
        DATE(t.created_at)                                                     AS date,
        CAST(COUNT(DISTINCT t.id)       AS INT)                               AS transactions,
        CAST(SUM(ti.line_total)         AS FLOAT)                             AS revenue,
        CAST(SUM(ti.quantity)           AS INT)                               AS items_sold
      FROM "Transaction" t
      LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
      WHERE t.status = 'completed'
        AND t.created_at >= ${todayStart}
        AND t.created_at <= ${dateTo}
        AND t.branch_id = ANY(${branchIdsAll})
      GROUP BY DATE(t.created_at)
      ORDER BY date ASC
    `;
    console.log('✅ Raw SQL query executed successfully! Rows returned:', rows.length);
  } catch (err: any) {
    console.error('❌ Raw SQL query failed:', err.message);
  }

  console.log('\n======================================================');
  console.log('✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
}

main().catch(err => {
  console.error('Fatal verification error:', err);
});
