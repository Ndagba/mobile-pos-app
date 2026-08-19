import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.managerBranch.findMany({
    include: {
      user: {
        select: {
          username: true,
          email: true,
          role: true
        }
      },
      branch: {
        select: {
          name: true
        }
      }
    }
  });

  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      name: true,
      store_id: true
    }
  });

  const users = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'manager'] }
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      branch_id: true
    }
  });

  console.log(`\n======================================================`);
  console.log(`📊 MANAGER BRANCH ASSIGNMENTS DIAGNOSTIC REPORT`);
  console.log(`======================================================`);
  console.log(`\n--- ALL BRANCHES (${branches.length}) ---`);
  console.log(JSON.stringify(branches, null, 2));

  console.log(`\n--- ADMIN/MANAGER USERS (${users.length}) ---`);
  console.log(JSON.stringify(users, null, 2));

  console.log(`\n--- MANAGER BRANCH JOIN TABLE (${assignments.length}) ---`);
  console.log(JSON.stringify(assignments, null, 2));
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
