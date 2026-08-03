import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting stock count history...');
  const deleted = await prisma.stockCount.deleteMany({});
  console.log(`Success! Deleted ${deleted.count} stock counts and their items.`);
}

main()
  .catch((e) => {
    console.error('Failed to reset stock counts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
