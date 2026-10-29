import { prisma } from '../lib/prisma';

async function debug() {
  console.log('--- Debugging Admin Transactions ---');
  
  const users = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true, first_name: true, last_name: true }
  });
  
  console.log('Admin Users found:');
  console.table(users);

  for (const admin of users) {
    console.log(`\nChecking transactions for ${admin.first_name} (ID: ${admin.id})...`);
    
    const txs = await prisma.transaction.findMany({
      where: { user_id: admin.id },
      select: { id: true, branch_id: true, store_id: true, total_amount: true, created_at: true },
      take: 5
    });
    
    if (txs.length === 0) {
      console.log('No transactions found for this admin user.');
    } else {
      console.log(`Found ${txs.length} transactions. First 5:`);
      console.table(txs);
    }
  }
}

debug().catch(console.error);
