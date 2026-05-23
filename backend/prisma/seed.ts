import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Create categories
  const electronics = await prisma.category.create({
    data: {
      id: uuidv4(),
      name: 'Electronics',
      display_order: 1
    }
  });

  // Create products
  const product1 = await prisma.product.create({
    data: {
      id: uuidv4(),
      category_id: electronics.id,
      sku: 'PHONE-001',
      name: 'Smartphone Pro',
      description: 'Latest smartphone model',
      marked_price: 50000,
      effective_price: 45000,
      cost_price: 35000,
      tax_rate: 18,
      barcode: '8901012345678'
    }
  });

  // Create inventory
  await prisma.inventory.create({
    data: {
      id: uuidv4(),
      product_id: product1.id,
      quantity_on_hand: 100,
      quantity_reserved: 0,
      low_stock_threshold: 10,
      reorder_point: 20
    }
  });

  // Create admin user
  await prisma.user.create({
    data: {
      id: uuidv4(),
      email: 'admin@store.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      store_id: 'store_001',
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