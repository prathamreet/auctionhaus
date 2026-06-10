import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('[seed] Seeding specific users...');

  const password = '123123';
  const hashedPassword = await bcrypt.hash(password, 12);

  const users = [
    { email: 'admin@x.com', name: 'Admin', role: 'ADMIN' },
    { email: 'one@x.com', name: 'One', role: 'USER' },
    { email: 'two@x.com', name: 'Two', role: 'USER' },
    { email: 'three@x.com', name: 'Three', role: 'USER' },
    { email: 'hoster@x.com', name: 'Hoster', role: 'USER' },
  ];

  for (const u of users) {
    try {
      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      if (existing) {
        console.log(`[skip] User ${u.email} already exists.`);
        continue;
      }

      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          password: hashedPassword,
          role: u.role as Role,
          wallet: { create: { balance: 1000000 } }, // Starter balance
        },
      });
      console.log(`[add]  ${u.email} (${u.role})`);
    } catch (error) {
      console.error(`[fail] Error creating user ${u.email}:`, error);
    }
  }

  console.log('[done] Seeding complete.');
  console.log('[info] All users password: 123123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
