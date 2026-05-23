/**
 * One-time backfill for the username + password auth migration.
 * - Sets `username` from the email prefix for any user missing one.
 * - Sets a temporary password for the admin account so it can bootstrap.
 * Run once after `prisma db push`:  npx ts-node src/backfill-auth.ts
 */
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_TEMP_PASSWORD = 'Admin@123';

async function main() {
  const users = await prisma.user.findMany();
  const taken = new Set(
    users.map((u) => u.username).filter((u): u is string => !!u)
  );

  for (const user of users) {
    const data: { username?: string; password_hash?: string } = {};

    if (!user.username) {
      const base = (user.email.split('@')[0] || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      let candidate = base || 'user';
      let n = 1;
      while (taken.has(candidate)) candidate = `${base}${n++}`;
      taken.add(candidate);
      data.username = candidate;
    }

    if (user.role === 'admin' && !user.password_hash) {
      data.password_hash = await bcryptjs.hash(ADMIN_TEMP_PASSWORD, 10);
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data });
      console.log(
        `Updated ${user.email}: username=${data.username ?? user.username}` +
          (data.password_hash ? ` (temp password set: ${ADMIN_TEMP_PASSWORD})` : '')
      );
    }
  }

  console.log('\nBackfill complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
