import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Create store
  await prisma.store.upsert({
    where: { id: 'store_001' },
    update: {},
    create: {
      id: 'store_001',
      name: 'Main Store',
      currency: 'NGN',
      is_active: true
    }
  });

  // Create branch
  await prisma.branch.upsert({
    where: { id: 'branch_001' },
    update: {},
    create: {
      id: 'branch_001',
      name: 'Main Branch',
      store_id: 'store_001',
      is_active: true
    }
  });

  // Create category
  const electronicsId = 'electronics_cat_001';
  await prisma.category.upsert({
    where: { name_branch_id: { name: 'Electronics', branch_id: 'branch_001' } },
    update: {},
    create: {
      id: electronicsId,
      name: 'Electronics',
      display_order: 1,
      branch_id: 'branch_001'
    }
  });

  // Create products
  const productId1 = 'dbbfaed9-ba23-4e29-9d42-529b03cd5e3e';
  await prisma.product.upsert({
    where: { id: productId1 },
    update: {},
    create: {
      id: productId1,
      category_id: electronicsId,
      sku: 'PHONE-001',
      name: 'Smartphone Pro',
      description: 'Latest smartphone model',
      marked_price: 50000,
      effective_price: 45000,
      cost_price: 35000,
      tax_rate: 18,
      barcode: '8901012345678',
      branch_id: 'branch_001'
    }
  });

  // Create inventory for product
  await prisma.inventory.upsert({
    where: { product_id: productId1 },
    update: {},
    create: {
      id: uuidv4(),
      product_id: productId1,
      quantity_on_hand: 100,
      quantity_reserved: 0,
      low_stock_threshold: 10,
      reorder_point: 20
    }
  });

  // Create admin user
  await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {},
    create: {
      id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d', // matches token in integration tests
      email: 'admin@store.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      store_id: 'store_001',
      branch_id: 'branch_001',
      is_active: true
    }
  });

  console.log('✅ Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });