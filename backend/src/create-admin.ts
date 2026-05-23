/**
 * Create an admin user for a store. Use this to onboard a new tenant: pass a
 * fresh store id and the first admin's credentials. The admin can then log in
 * and create branches/staff through the app.
 *
 * Usage:
 *   npx ts-node src/create-admin.ts <username> <password> <email> [firstName] [storeId]
 *
 * Examples:
 *   # First admin for the default demo store
 *   npx ts-node src/create-admin.ts admin 'Admin@123' admin@demo.com Gana
 *
 *   # Onboard a new store
 *   npx ts-node src/create-admin.ts ade 'StrongPass123' ade@acme.com Ade store_002
 */
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_STORE_ID = 'store_001';

async function main() {
  const [username, password, email, firstName, storeIdArg] = process.argv.slice(2);
  const STORE_ID = (storeIdArg || DEFAULT_STORE_ID).trim();

  if (!username || !password || !email) {
    console.error(
      'Usage: npx ts-node src/create-admin.ts <username> <password> <email> [firstName] [storeId]'
    );
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const uname = username.toLowerCase().trim();
  const mail = email.toLowerCase().trim();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: uname }, { email: mail }] },
  });
  if (existing) {
    console.error('A user with that username or email already exists. Aborting.');
    process.exit(1);
  }

  const password_hash = await bcryptjs.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      username: uname,
      email: mail,
      password_hash,
      first_name: firstName || 'Admin',
      role: 'admin',
      store_id: STORE_ID,
      is_active: true,
    },
  });

  console.log(
    `\nAdmin created — username: "${user.username}", store: "${user.store_id}"`
  );
  console.log('You can now log in to the app with that username and password.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
