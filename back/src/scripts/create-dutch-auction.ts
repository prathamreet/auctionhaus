

// npx ts-node src/scripts/add-custom-user.ts


import { prisma } from '../lib/prisma';
import { AuctionType, AuctionStatus } from '@prisma/client';

async function main() {
  // CONFIGURATION
  const title = 'Luxury Sports Car (Dutch)';
  const description = 'Excellent condition, limited edition. Price drops every 30 minutes until sold or reserve met.';
  const startPrice = 85000;
  const reservePrice = 45000;
  const priceStep = 2000;
  const intervalSeconds = 60; // 30 mins
  const durationHours = 48;

  const sellerEmail = 'hoster@x.com';
  const seller = await prisma.user.findUnique({ where: { email: sellerEmail } });
  if (!seller) {
    console.error(`[fail] User ${sellerEmail} not found. Run npm run db:seed-users first.`);
    return;
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  const auction = await prisma.auction.create({
    data: {
      sellerId: seller.id,
      title,
      description,
      type: AuctionType.DUTCH,
      status: AuctionStatus.ACTIVE,
      startingPrice: startPrice,
      currentPrice: startPrice,
      reservePrice: reservePrice,
      dutchPriceStep: priceStep,
      dutchInterval: intervalSeconds,
      startTime: now,
      endTime: endTime,
    }
  });

  console.log(`[ok] Created Dutch Auction: "${auction.title}" (ID: ${auction.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
