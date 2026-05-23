"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Promote an existing user to super admin.
 *
 * A super admin can create new stores from inside the JayPOS app. They keep
 * whatever role they already had on their home store, so you can promote your
 * existing `admin` login to also gain platform-level powers — no need for a
 * second account.
 *
 * Usage:
 *   npx ts-node src/make-super-admin.ts <username>
 *
 * Example:
 *   npx ts-node src/make-super-admin.ts admin
 */
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const [usernameArg] = process.argv.slice(2);
    if (!usernameArg) {
        console.error('Usage: npx ts-node src/make-super-admin.ts <username>');
        process.exit(1);
    }
    const username = usernameArg.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
        console.error(`No user found with username "${username}".`);
        process.exit(1);
    }
    if (user.is_super_admin) {
        console.log(`"${user.username}" is already a super admin. Nothing to do.`);
        process.exit(0);
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { is_super_admin: true },
    });
    console.log(`\n✓ ${user.username} is now a super admin.`);
    console.log('Log out and back in on the device so the new JWT carries the flag.\n');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=make-super-admin.js.map