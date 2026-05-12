

// npx ts-node src/scripts/add-custom-user.ts


import { prisma } from '../lib/prisma';
import { AuctionType, AuctionStatus } from '@prisma/client';

async function main() {
  // CONFIGURATION
  const title = 'Smart Modular Synthesizer System';
  const description = 'Full Eurorack setup including oscillators, filters, and sequencers. Housed in a custom walnut travel case.';
  const startPrice = 100;
  const increment = 100;
  const durationHours = 0.1;

  const sellerEmail = 'hoster@x.com';
  const seller = await prisma.user.findUnique({ where: { email: sellerEmail } });
  if (!seller) {
    console.error(`❌ Error: User ${sellerEmail} not found. Please run add-custom-user.ts first.`);
    return;
  }

  const now = new Date();
  const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  const auction = await prisma.auction.create({
    data: {
      sellerId: seller.id,
      title,
      description,
      type: AuctionType.ENGLISH,
      status: AuctionStatus.ACTIVE,
      startingPrice: startPrice,
      currentPrice: startPrice,
      minIncrement: increment,
      startTime: now,
      endTime: endTime,
    }
  });

  console.log(`✅ Created English Auction: "${auction.title}" (ID: ${auction.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
