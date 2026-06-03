
// npx ts-node src/scripts/add-custom-user.ts

import { prisma } from '../lib/prisma';

async function main() {
  console.log('[clear] Clearing ALL users and EVERYTHING else...');

  try {
    // Delete everything in reverse order of dependency
    await prisma.rating.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.autoBid.deleteMany();
    await prisma.watchlistItem.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.wallet.deleteMany();

    const users = await prisma.user.deleteMany();
    console.log(`[done] Deleted ${users.count} users and all associated data.`);
  } catch (error) {
    console.error('[fail] Error clearing users:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
