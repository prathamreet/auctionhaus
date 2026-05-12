

// npx ts-node src/scripts/add-custom-user.ts


import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

async function main() {
  // CONFIGURATION
  const email = 'hoster@x.com';
  const name = 'Hoster';
  const password = '123123';
  const role = 'USER';
  const balance = 100000;

  console.log(`🌱 Adding user: ${email}...`);
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: role as Role,
    },
    create: {
      email,
      name,
      password: hashedPassword,
      role: role as Role,
      wallet: { create: { balance } }
    }
  });

  console.log(`✅ User ${user.email} is ready. (ID: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
