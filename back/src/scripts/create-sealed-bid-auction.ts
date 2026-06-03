

// npx ts-node src/scripts/add-custom-user.ts


import { prisma } from '../lib/prisma';
import { AuctionType, AuctionStatus } from '@prisma/client';

async function main() {
  // CONFIGURATION
  const title = 'Ultra-Rare Baseball Card (Sealed Bid)';
  const description = 'Mint condition 1952 collectible. Submit your maximum secret bid. Winner announced at end time.';
  const startPrice = 5000;
  const durationHours = 72;

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
      type: AuctionType.SEALED_BID,
      status: AuctionStatus.ACTIVE,
      startingPrice: startPrice,
      currentPrice: startPrice,
      startTime: now,
      endTime: endTime,
    }
  });

  console.log(`[ok] Created Sealed Bid Auction: "${auction.title}" (ID: ${auction.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
