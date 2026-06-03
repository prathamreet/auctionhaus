import { prisma } from '../lib/prisma';

async function main() {
  console.log('[clear] Clearing all auction data...');

  try {
    // Delete in order to satisfy foreign key constraints
    const ratings = await prisma.rating.deleteMany();
    console.log(`[del] ${ratings.count} ratings`);

    const bids = await prisma.bid.deleteMany();
    console.log(`[del] ${bids.count} bids`);

    const autoBids = await prisma.autoBid.deleteMany();
    console.log(`[del] ${autoBids.count} auto-bids`);

    const watchlist = await prisma.watchlistItem.deleteMany();
    console.log(`[del] ${watchlist.count} watchlist items`);

    const notifications = await prisma.notification.deleteMany({
      where: {
        type: {
          in: ['OUTBID', 'AUCTION_WON', 'AUCTION_LOST', 'AUCTION_STARTED', 'AUCTION_ENDED', 'AUTO_BID_PLACED', 'PAYMENT_RECEIVED']
        }
      }
    });
    console.log(`[del] ${notifications.count} auction-related notifications`);

    const transactions = await prisma.transaction.deleteMany({
      where: {
        type: {
          in: ['BID_HOLD', 'BID_RELEASE', 'PAYMENT', 'REFUND']
        }
      }
    });
    console.log(`[del] ${transactions.count} auction-related transactions`);

    const auctions = await prisma.auction.deleteMany();
    console.log(`[del] ${auctions.count} auctions`);

    console.log('[done] All auction data cleared.');
  } catch (error) {
    console.error('[fail] Error clearing auctions:', error);
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
