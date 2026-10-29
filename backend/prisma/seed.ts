import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

// Dev-only login credentials for local scenario testing (NOT production).
// store_001 is subscription-exempt by default (see SubscriptionService), so
// these logins can run the full POS flow without seeding a subscription.
const DEV_PASSWORD = 'Password123';

async function main() {
  const passwordHash = await bcryptjs.hash(DEV_PASSWORD, 10);

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

  // Create branches (branch_002 lets the admin branch-selector be exercised)
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
  await prisma.branch.upsert({
    where: { id: 'branch_002' },
    update: {},
    create: {
      id: 'branch_002',
      name: 'Second Branch',
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

  // ── Dev login users (admin / manager / cashier) ──────────────────
  // username + password_hash are set on BOTH create and update so re-seeding an
  // existing DB (e.g. one seeded before logins existed) repairs the credentials.
  const adminId = 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'; // matches token in integration tests
  await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: { username: 'admin', password_hash: passwordHash, is_active: true, role: 'admin' },
    create: {
      id: adminId,
      email: 'admin@store.com',
      username: 'admin',
      password_hash: passwordHash,
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      store_id: 'store_001',
      branch_id: 'branch_001',
      is_active: true
    }
  });

  const managerId = 'a1111111-1111-4111-8111-111111111111';
  await prisma.user.upsert({
    where: { email: 'manager@store.com' },
    update: { username: 'manager', password_hash: passwordHash, is_active: true, role: 'manager' },
    create: {
      id: managerId,
      email: 'manager@store.com',
      username: 'manager',
      password_hash: passwordHash,
      first_name: 'Manager',
      last_name: 'User',
      role: 'manager',
      store_id: 'store_001',
      branch_id: 'branch_001',
      is_active: true
    }
  });

  const cashierId = 'c2222222-2222-4222-8222-222222222222';
  await prisma.user.upsert({
    where: { email: 'cashier@store.com' },
    update: { username: 'cashier', password_hash: passwordHash, is_active: true, role: 'cashier' },
    create: {
      id: cashierId,
      email: 'cashier@store.com',
      username: 'cashier',
      password_hash: passwordHash,
      first_name: 'Cashier',
      last_name: 'User',
      role: 'cashier',
      store_id: 'store_001',
      branch_id: 'branch_001',
      is_active: true
    }
  });

  // Give the manager an assigned branch (branch_002) so manager branch-scoping
  // (home branch_001 + assigned branch_002) can be exercised.
  await prisma.managerBranch.upsert({
    where: { user_id_branch_id: { user_id: managerId, branch_id: 'branch_002' } },
    update: {},
    create: {
      id: uuidv4(),
      user_id: managerId,
      branch_id: 'branch_002'
    }
  });

  console.log('✅ Seed data created successfully');
  console.log(`   Logins (password "${DEV_PASSWORD}"): admin / manager / cashier`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
