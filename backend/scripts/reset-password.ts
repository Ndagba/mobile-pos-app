import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

/**
 * Reset ONLY a user's password — no role / is_super_admin / email changes.
 *
 * Usage:
 *   npx ts-node scripts/reset-password.ts [username] [newPassword]
 *   npx ts-node scripts/reset-password.ts admin 'NewPass123!'
 *
 * Defaults: username "admin", password "Password123!".
 */
const prisma = new PrismaClient();

async function main() {
  const username = (process.argv[2] || 'admin').toLowerCase().trim();
  const password = process.argv[3] || 'Password123!';

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`❌ No user found with username "${username}".`);
    process.exit(1);
  }

  const password_hash = await bcryptjs.hash(password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash } });

  console.log(`\n======================================================`);
  console.log(`✅ Password reset (no other fields changed)`);
  console.log(`- Username: ${user.username}`);
  console.log(`- Email:    ${user.email}`);
  console.log(`- Role:     ${user.role} (is_super_admin: ${user.is_super_admin})`);
  console.log(`- Password: ${password}`);
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
