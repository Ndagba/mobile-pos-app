import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'superadmin@store.com';
  const password = process.argv[3] || 'Password123!';
  const username = process.argv[4] || 'superadmin';

  if (!email || !password) {
    console.error('Usage: npx ts-node scripts/reset-super-admin.ts [email] [password] [username]');
    process.exit(1);
  }

  const passwordHash = await bcryptjs.hash(password, 10);

  // Check if store exists
  let store = await prisma.store.findFirst();
  if (!store) {
    // create a default store if none exists
    store = await prisma.store.create({
      data: {
        id: 'store_001',
        name: 'Main Store',
        currency: 'NGN',
        is_active: true
      }
    });
  }

  // Find user by email or username to avoid duplicates / constraints
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase().trim() },
        { username: username.toLowerCase().trim() }
      ]
    }
  });

  let user;

  if (existingUser) {
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        email: email.toLowerCase().trim(),
        username: username.toLowerCase().trim(),
        password_hash: passwordHash,
        role: 'admin',
        is_super_admin: true,
        is_active: true,
      }
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        username: username.toLowerCase().trim(),
        password_hash: passwordHash,
        first_name: 'Super',
        last_name: 'Admin',
        role: 'admin',
        is_super_admin: true,
        store_id: store.id,
        is_active: true
      }
    });
  }

  console.log(`\n======================================================`);
  console.log(`✅ Super Admin Account Set Successfully!`);
  console.log(`- Email: ${user.email}`);
  console.log(`- Username: ${user.username}`);
  console.log(`- Password: ${password}`);
  console.log(`- Role: ${user.role} (is_super_admin: true)`);
  console.log(`======================================================\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
