const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    console.log('🗑️  Starting database cleanup...\n');

    // Delete in reverse dependency order
    const deletions = [
      { model: 'OfflineSyncQueue', action: async () => prisma.offlineSyncQueue.deleteMany({}) },
      { model: 'AuditLog', action: async () => prisma.auditLog.deleteMany({}) },
      { model: 'TransactionItem', action: async () => prisma.transactionItem.deleteMany({}) },
      { model: 'Transaction', action: async () => prisma.transaction.deleteMany({}) },
      { model: 'Payment', action: async () => prisma.payment.deleteMany({}) },
      { model: 'BatchTracking', action: async () => prisma.batchTracking.deleteMany({}) },
      { model: 'Inventory', action: async () => prisma.inventory.deleteMany({}) },
      { model: 'Product', action: async () => prisma.product.deleteMany({}) },
      { model: 'Category', action: async () => prisma.category.deleteMany({}) },
      { model: 'DailyAnalytics', action: async () => prisma.dailyAnalytics.deleteMany({}) },
      { model: 'Customer', action: async () => prisma.customer.deleteMany({}) },
      { model: 'User', action: async () => prisma.user.deleteMany({}) },
      { model: 'Branch', action: async () => prisma.branch.deleteMany({}) },
    ];

    for (const { model, action } of deletions) {
      const result = await action();
      console.log(`✓ ${model}: ${result.count} records deleted`);
    }

    console.log('\n✅ Database cleared successfully!');
    console.log('All tables are now empty. Ready for testing.');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
