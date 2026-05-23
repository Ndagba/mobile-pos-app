import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.user.update({
  where: { id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d' },
  data: { biometric_token_hash: 'test_hash', device_id: 'test_device_setup' }
}).then(() => {
  console.log('done');
  return prisma.$disconnect();
});