import dotenv from 'dotenv';
import path from 'path';
// Load environment variables from the back/.env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuctionStatus, AuctionType } from '@prisma/client';

async function main() {
  console.log('🏁 Setting up Benchmark state in database...');

  const secret = process.env.JWT_SECRET || 'auctionhaus_super_secret_jwt_key_for_dev_only';

  // 1. Ensure/create benchmark user
  const email = 'bench@auctionhaus.com';
  const name = 'k6 Benchmark Runner';
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        password: 'not-needed-for-token', // we bypass direct login
        wallet: { create: { balance: 100000000 } }, // ₹100,000,000 balance
      },
    });
    console.log(`+ Created new benchmark user: ${email}`);
  } else {
    // Top-up wallet balance to make sure the VUs never hit insufficient balance error
    await prisma.wallet.update({
      where: { userId: user.id },
      data: { balance: 100000000, heldAmount: 0 },
    });
    console.log(`+ Balanced benchmark user wallet to ₹100,000,000`);
  }

  // 2. Generate signed token
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: '7d' }
  );

  // 3. Create a clean ACTIVE benchmark auction
  const endTime = new Date(Date.now() + 4 * 3600 * 1000); // 4 hours in future
  const auction = await prisma.auction.create({
    data: {
      title: 'k6 Throughput Benchmark',
      description: 'System load-test auction endpoint for active VUs.',
      type: AuctionType.ENGLISH,
      status: AuctionStatus.ACTIVE,
      startingPrice: 1000,
      currentPrice: 1000,
      minIncrement: 10,
      antiSnipingMins: 0,
      startTime: new Date(),
      endTime,
      sellerId: user.id, // the bench runner can bid on their own if needed, or we use a separate seller
    },
  });

  // Since a user cannot bid on their own auction (Express validation: req.user!.id === auction.sellerId raises 403),
  // let's ensure we assign a different seller for this auction!
  // Let's find another user in the system (e.g. Admin or standard seeded user)
  let alternativeSeller = await prisma.user.findFirst({
    where: { NOT: { id: user.id } },
  });

  if (!alternativeSeller) {
    alternativeSeller = await prisma.user.create({
      data: {
        email: 'seller@auctionhaus.com',
        name: 'Benchmark Seller',
        password: 'not-needed-for-token',
        wallet: { create: { balance: 1000 } },
      },
    });
  }

  // Update auction to have this alternative seller so bids from benchmark user are valid!
  await prisma.auction.update({
    where: { id: auction.id },
    data: { sellerId: alternativeSeller.id },
  });

  console.log(`+ Created active ENGLISH auction (ID: ${auction.id})`);
  console.log(`\n======================================================================`);
  console.log(`🚀 READY FOR BENCHMARK!`);
  console.log(`======================================================================`);
  console.log(`Run the following k6 commands in your terminal to collect the metrics:`);
  console.log(`\n--- 1. Direct mode (PostgreSQL locked transaction) ---`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=1 -e DURATION="15s" -e MODE="direct"`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=10 -e DURATION="15s" -e MODE="direct"`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=100 -e DURATION="15s" -e MODE="direct"`);

  console.log(`\n--- 2. Redis Stream mode (Sequencer enqueuer) ---`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=1 -e DURATION="15s" -e MODE="stream"`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=10 -e DURATION="15s" -e MODE="stream"`);
  console.log(`k6 run packages/simulator/k6/bid-throughput.js -e SIM_TOKEN="${token}" -e AUCTION_ID="${auction.id}" -e VUS=100 -e DURATION="15s" -e MODE="stream"`);
  console.log(`======================================================================\n`);
}

main()
  .catch((e) => {
    console.error('❌ Setup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
