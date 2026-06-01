const path = require('path');
const fs = require('fs');

// Inject backend node_modules path to support sibling workspace module resolution
module.paths.push(path.resolve(__dirname, '../back/node_modules'));

// Load environment variables from back/.env
const dotenvPath = path.resolve(__dirname, '../back/.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding with realistic production-grade data...');

  const password = '123123';
  const hashedPassword = await bcrypt.hash(password, 12);

  // 1. Seed Users
  console.log('- Creating Users & Wallets...');
  const userData = [
    {
      email: 'admin@auctionhaus.com',
      name: 'Supreme Moderator',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'ADMIN',
      balance: 1000000,
    },
    {
      email: 'rolex_collector@x.com',
      name: 'Alistair Vance',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 8500000,
    },
    {
      email: 'synth_wizard@x.com',
      name: 'Elian Thorne',
      avatar: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 4500000,
    },
    {
      email: 'leica_purist@x.com',
      name: 'Clara Oswald',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 3200000,
    },
    {
      email: 'design_aficionado@x.com',
      name: 'Julian Balthazar',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 6000000,
    },
    {
      email: 'shill_bot_99@x.com',
      name: 'Lucas Vance (Bot)',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 200000,
    },
    {
      email: 'collusive_buddy@x.com',
      name: 'Marcus Thorne (Bot)',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      role: 'USER',
      balance: 150000,
    },
  ];

  const users = {};
  for (const item of userData) {
    const user = await prisma.user.create({
      data: {
        email: item.email,
        name: item.name,
        password: hashedPassword,
        avatar: item.avatar,
        role: item.role,
        rating: 4.8,
        ratingCount: 12,
        wallet: {
          create: {
            balance: item.balance,
            heldAmount: 0,
          },
        },
      },
      include: { wallet: true },
    });
    users[item.email] = user;

    // Create a seed deposit transaction
    await prisma.transaction.create({
      data: {
        walletId: user.wallet.id,
        userId: user.id,
        type: 'DEPOSIT',
        amount: item.balance,
        description: 'Starter wallet funding allocation',
        status: 'COMPLETED',
      },
    });
  }

  console.log('✅ Users and wallets created.');

  // 2. Seed Auctions
  console.log('- Creating Auctions...');
  const now = new Date();
  const pastDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const futureDate = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  // --- Active English Auction ---
  const leicaAuction = await prisma.auction.create({
    data: {
      sellerId: users['leica_purist@x.com'].id,
      title: 'Leica M6 TTL Rangefinder Camera',
      description: 'Classic 35mm rangefinder camera in black chrome finish. Mechanical shutter working perfectly across all speeds. Viewfinder bright and clear.',
      imageUrl: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'ACTIVE',
      startingPrice: 200000,
      currentPrice: 265000,
      minIncrement: 5000,
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Ended English Auction ---
  const rolexAuction = await prisma.auction.create({
    data: {
      sellerId: users['rolex_collector@x.com'].id,
      title: 'Rolex Submariner Date 126610LN',
      description: 'Oystersteel classic diver watch with Cerachrom ceramic bezel. Unworn 2024 model. Comes with complete set box, warranty card, and tags.',
      imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'ENDED',
      startingPrice: 800000,
      currentPrice: 950000,
      reservePrice: 900000,
      startTime: new Date(now.getTime() - 72 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      actualEndTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      winnerId: users['design_aficionado@x.com'].id,
    },
  });

  // --- Active Dutch Auction ---
  const moogAuction = await prisma.auction.create({
    data: {
      sellerId: users['synth_wizard@x.com'].id,
      title: 'Vintage Moog Minimoog Model D (1974)',
      description: 'Legendary analog synthesizer case in walnut. Fully serviced recently, calibrated oscillators, and perfectly functioning custom keys.',
      imageUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=600&auto=format&fit=crop&q=80',
      type: 'DUTCH',
      status: 'ACTIVE',
      startingPrice: 600000,
      currentPrice: 480000,
      reservePrice: 400000,
      dutchPriceStep: 30000,
      dutchInterval: 600, // 10 minutes
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Active Sealed Bid Auction ---
  const eamesAuction = await prisma.auction.create({
    data: {
      sellerId: users['design_aficionado@x.com'].id,
      title: 'Herman Miller Eames Lounge Chair & Ottoman',
      description: 'Rosewood ply veneer shell with black premium leather cushions. Original production stamp from 1978. In stunning vintage condition.',
      imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&auto=format&fit=crop&q=80',
      type: 'SEALED_BID',
      status: 'ACTIVE',
      startingPrice: 300000,
      reservePrice: 450000,
      currentPrice: 300000,
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Ended Sealed Bid Auction ---
  const banksyAuction = await prisma.auction.create({
    data: {
      sellerId: users['design_aficionado@x.com'].id,
      title: 'Banksy "Flower Thrower" Signed Screenprint',
      description: 'Official screenprint on board from the Pest Control collection. Numbered and stamped. Certificate of authenticity included.',
      imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80',
      type: 'SEALED_BID',
      status: 'ENDED',
      startingPrice: 1200000,
      currentPrice: 1500000,
      startTime: new Date(now.getTime() - 96 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      actualEndTime: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      winnerId: users['rolex_collector@x.com'].id,
    },
  });

  // --- Cancelled Auction ---
  const synthCaseAuction = await prisma.auction.create({
    data: {
      sellerId: users['synth_wizard@x.com'].id,
      title: 'Defective Eurorack Walnut Synthesizer Case',
      description: 'Minor damage in transit. Power supply unit needs replacement.',
      imageUrl: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'CANCELLED',
      startingPrice: 50000,
      currentPrice: 50000,
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Pending Auction ---
  const duneAuction = await prisma.auction.create({
    data: {
      sellerId: users['leica_purist@x.com'].id,
      title: 'Rare First Edition Dune Novel (1965)',
      description: 'Chilton first edition, first printing. Hardcover in original blue cloth binding. Highly preserved dust jacket.',
      imageUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'PENDING',
      startingPrice: 50000,
      currentPrice: 50000,
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 96 * 60 * 60 * 1000),
    },
  });

  // --- Shill Target Auction (For Fraud Logs) ---
  const rolexPrecisionAuction = await prisma.auction.create({
    data: {
      sellerId: users['synth_wizard@x.com'].id, // Seller
      title: 'Vintage Rolex Oyster Precision (1960)',
      description: 'Stunning silver dial manual mechanical wind watch. Fully original steel case and crown.',
      imageUrl: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'ACTIVE',
      startingPrice: 100000,
      currentPrice: 145000,
      minIncrement: 5000,
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Extra Active English Auction ---
  const stratAuction = await prisma.auction.create({
    data: {
      sellerId: users['synth_wizard@x.com'].id,
      title: '1962 Fender Stratocaster Sunburst',
      description: 'All original 1962 pre-CBS Fender Stratocaster. Slab board rosewood neck. Spaghetti logo intact. Minor checking on the nitro finish.',
      imageUrl: 'https://images.unsplash.com/photo-1541689592655-f5f52825a3b8?w=600&auto=format&fit=crop&q=80',
      type: 'ENGLISH',
      status: 'ACTIVE',
      startingPrice: 1500000,
      currentPrice: 1850000,
      minIncrement: 50000,
      startTime: pastDate,
      endTime: futureDate,
    },
  });

  // --- Extra Ended Dutch Auction ---
  const charizardAuction = await prisma.auction.create({
    data: {
      sellerId: users['design_aficionado@x.com'].id,
      title: 'PSA 10 1st Edition Charizard Holo',
      description: 'Perfect gem mint condition. Thick stamp, shadowless. The holy grail of trading card collections.',
      imageUrl: 'https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?w=600&auto=format&fit=crop&q=80',
      type: 'DUTCH',
      status: 'ENDED',
      startingPrice: 3000000,
      currentPrice: 2200000,
      reservePrice: 1000000,
      dutchPriceStep: 100000,
      dutchInterval: 3600,
      startTime: new Date(now.getTime() - 120 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      actualEndTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      winnerId: users['rolex_collector@x.com'].id,
    },
  });

  console.log('✅ Auctions populated.');

  // 3. Seed Bids
  console.log('- Creating Bids...');

  // --- Leica English Auction Bids ---
  const leicaBids = [
    { bidder: 'rolex_collector@x.com', amount: 205000, status: 'OUTBID', auto: false },
    { bidder: 'design_aficionado@x.com', amount: 210000, status: 'OUTBID', auto: true },
    { bidder: 'rolex_collector@x.com', amount: 220000, status: 'OUTBID', auto: false },
    { bidder: 'synth_wizard@x.com', amount: 230000, status: 'OUTBID', auto: true },
    { bidder: 'rolex_collector@x.com', amount: 245000, status: 'OUTBID', auto: false },
    { bidder: 'design_aficionado@x.com', amount: 250000, status: 'OUTBID', auto: true },
    { bidder: 'synth_wizard@x.com', amount: 260000, status: 'OUTBID', auto: true },
    { bidder: 'rolex_collector@x.com', amount: 265000, status: 'WINNING', auto: false },
  ];

  let stepCount = 0;
  for (const item of leicaBids) {
    const bidDate = new Date(pastDate.getTime() + (++stepCount) * 4 * 60 * 60 * 1000);
    const bid = await prisma.bid.create({
      data: {
        auctionId: leicaAuction.id,
        bidderId: users[item.bidder].id,
        amount: item.amount,
        status: item.status,
        isAutoBid: item.auto,
        createdAt: bidDate,
      },
    });

    if (item.status === 'WINNING') {
      // Hold wallet funds for winning bidder
      await prisma.wallet.update({
        where: { userId: users[item.bidder].id },
        data: { heldAmount: item.amount },
      });
      await prisma.transaction.create({
        data: {
          walletId: users[item.bidder].wallet.id,
          userId: users[item.bidder].id,
          type: 'BID_HOLD',
          amount: -item.amount,
          description: `Hold for active bid on Leica M6`,
          referenceId: leicaAuction.id,
          status: 'COMPLETED',
        },
      });
    }
  }

  // --- Rolex Ended Auction Bids ---
  const rolexBids = [
    { bidder: 'leica_purist@x.com', amount: 810000, status: 'OUTBID' },
    { bidder: 'design_aficionado@x.com', amount: 850000, status: 'OUTBID' },
    { bidder: 'leica_purist@x.com', amount: 900000, status: 'OUTBID' },
    { bidder: 'design_aficionado@x.com', amount: 950000, status: 'WON' },
  ];

  const rolexEndTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let rolexBidId = null;
  stepCount = 0;
  for (const item of rolexBids) {
    const bidDate = new Date(pastDate.getTime() + (++stepCount) * 10 * 60 * 60 * 1000);
    const bid = await prisma.bid.create({
      data: {
        auctionId: rolexAuction.id,
        bidderId: users[item.bidder].id,
        amount: item.amount,
        status: item.status,
        createdAt: bidDate,
      },
    });

    if (item.status === 'WON') {
      rolexBidId = bid.id;
      // Mark winner bid on Auction row
      await prisma.auction.update({
        where: { id: rolexAuction.id },
        data: { winnerBidId: bid.id },
      });

      // Debit winner balance, settle payment
      await prisma.wallet.update({
        where: { userId: users[item.bidder].id },
        data: { balance: { decrement: item.amount } },
      });

      await prisma.transaction.create({
        data: {
          walletId: users[item.bidder].wallet.id,
          userId: users[item.bidder].id,
          type: 'PAYMENT',
          amount: -item.amount,
          description: `Payment for auction win: Rolex Submariner`,
          referenceId: rolexAuction.id,
          status: 'COMPLETED',
        },
      });

      // Credit seller balance
      await prisma.wallet.update({
        where: { userId: users['rolex_collector@x.com'].id },
        data: { balance: { increment: item.amount } },
      });

      await prisma.transaction.create({
        data: {
          walletId: users['rolex_collector@x.com'].wallet.id,
          userId: users['rolex_collector@x.com'].id,
          type: 'PAYMENT',
          amount: item.amount,
          description: `Payment received for Rolex Submariner sale`,
          referenceId: rolexAuction.id,
          status: 'COMPLETED',
        },
      });

      // Write Settlement record
      await prisma.settlement.create({
        data: {
          auctionId: rolexAuction.id,
          sellerId: users['rolex_collector@x.com'].id,
          partyId: users[item.bidder].id,
          amount: item.amount,
          kind: 'WON_AUCTION',
        },
      });
    }
  }

  // --- Banksy Ended Sealed Bid Auction ---
  const banksyWinnerBid = await prisma.bid.create({
    data: {
      auctionId: banksyAuction.id,
      bidderId: users['rolex_collector@x.com'].id,
      amount: 1500000,
      status: 'WON',
      refundedAt: new Date(),
    },
  });

  const banksyLoserBid = await prisma.bid.create({
    data: {
      auctionId: banksyAuction.id,
      bidderId: users['leica_purist@x.com'].id,
      amount: 1300000,
      status: 'LOST',
      refundedAt: new Date(),
    },
  });

  await prisma.auction.update({
    where: { id: banksyAuction.id },
    data: { winnerBidId: banksyWinnerBid.id },
  });

  // Deduct winner wallet and credit seller
  await prisma.wallet.update({
    where: { userId: users['rolex_collector@x.com'].id },
    data: { balance: { decrement: 1500000 } },
  });

  await prisma.transaction.create({
    data: {
      walletId: users['rolex_collector@x.com'].wallet.id,
      userId: users['rolex_collector@x.com'].id,
      type: 'PAYMENT',
      amount: -1500000,
      description: `Payment for Banksy Screenprint win`,
      referenceId: banksyAuction.id,
    },
  });

  await prisma.wallet.update({
    where: { userId: users['design_aficionado@x.com'].id },
    data: { balance: { increment: 1500000 } },
  });

  await prisma.transaction.create({
    data: {
      walletId: users['design_aficionado@x.com'].wallet.id,
      userId: users['design_aficionado@x.com'].id,
      type: 'PAYMENT',
      amount: 1500000,
      description: `Payment received for Banksy Screenprint`,
      referenceId: banksyAuction.id,
    },
  });

  await prisma.settlement.create({
    data: {
      auctionId: banksyAuction.id,
      sellerId: users['design_aficionado@x.com'].id,
      partyId: users['rolex_collector@x.com'].id,
      amount: 1500000,
      kind: 'WON_AUCTION',
    },
  });

  // --- Shill Target Bids (For Admin Fraud Dashboard) ---
  const shillBids = [
    { bidder: 'leica_purist@x.com', amount: 105000, status: 'OUTBID', resTimeMs: 12000 },
    { bidder: 'shill_bot_99@x.com', amount: 110000, status: 'OUTBID', resTimeMs: 140 }, // Instant outbid!
    { bidder: 'leica_purist@x.com', amount: 120000, status: 'OUTBID', resTimeMs: 25000 },
    { bidder: 'collusive_buddy@x.com', amount: 125000, status: 'OUTBID', resTimeMs: 190 }, // Instant outbid!
    { bidder: 'leica_purist@x.com', amount: 135000, status: 'OUTBID', resTimeMs: 19000 },
    { bidder: 'shill_bot_99@x.com', amount: 140000, status: 'OUTBID', resTimeMs: 110 }, // Instant outbid!
    { bidder: 'leica_purist@x.com', amount: 145000, status: 'OUTBID', resTimeMs: 14000 },
    { bidder: 'collusive_buddy@x.com', amount: 150000, status: 'WINNING', resTimeMs: 150 }, // Instant outbid!
  ];

  let currentShillTime = new Date(pastDate.getTime() + 15 * 60 * 60 * 1000);
  const seededShillBids = [];
  for (const item of shillBids) {
    currentShillTime = new Date(currentShillTime.getTime() + item.resTimeMs);
    const bid = await prisma.bid.create({
      data: {
        auctionId: rolexPrecisionAuction.id,
        bidderId: users[item.bidder].id,
        amount: item.amount,
        status: item.status,
        createdAt: currentShillTime,
      },
    });
    seededShillBids.push({ ...item, id: bid.id });

    if (item.status === 'WINNING') {
      // Hold wallet funds
      await prisma.wallet.update({
        where: { userId: users[item.bidder].id },
        data: { heldAmount: item.amount },
      });
      await prisma.transaction.create({
        data: {
          walletId: users[item.bidder].wallet.id,
          userId: users[item.bidder].id,
          type: 'BID_HOLD',
          amount: -item.amount,
          description: `Hold for active bid on Vintage Rolex oyster`,
          referenceId: rolexPrecisionAuction.id,
        },
      });
    }
  }

  // --- Stratocaster Active Bids ---
  const stratBids = [
    { bidder: 'leica_purist@x.com', amount: 1550000, status: 'OUTBID', auto: false },
    { bidder: 'rolex_collector@x.com', amount: 1650000, status: 'OUTBID', auto: true },
    { bidder: 'leica_purist@x.com', amount: 1850000, status: 'WINNING', auto: false },
  ];

  let stratStep = 0;
  for (const item of stratBids) {
    const bidDate = new Date(pastDate.getTime() + (++stratStep) * 12 * 60 * 60 * 1000);
    const bid = await prisma.bid.create({
      data: {
        auctionId: stratAuction.id,
        bidderId: users[item.bidder].id,
        amount: item.amount,
        status: item.status,
        isAutoBid: item.auto,
        createdAt: bidDate,
      },
    });

    if (item.status === 'WINNING') {
      await prisma.wallet.update({
        where: { userId: users[item.bidder].id },
        data: { heldAmount: item.amount },
      });
      await prisma.transaction.create({
        data: {
          walletId: users[item.bidder].wallet.id,
          userId: users[item.bidder].id,
          type: 'BID_HOLD',
          amount: -item.amount,
          description: `Hold for active bid on 1962 Stratocaster`,
          referenceId: stratAuction.id,
        },
      });
    }
  }

  // --- Charizard Ended Dutch Auction Win ---
  const charBid = await prisma.bid.create({
    data: {
      auctionId: charizardAuction.id,
      bidderId: users['rolex_collector@x.com'].id,
      amount: 2200000,
      status: 'WON',
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auction.update({
    where: { id: charizardAuction.id },
    data: { winnerBidId: charBid.id },
  });

  await prisma.wallet.update({
    where: { userId: users['rolex_collector@x.com'].id },
    data: { balance: { decrement: 2200000 } },
  });
  await prisma.transaction.create({
    data: {
      walletId: users['rolex_collector@x.com'].wallet.id,
      userId: users['rolex_collector@x.com'].id,
      type: 'PAYMENT',
      amount: -2200000,
      description: `Payment for Charizard Holo Win`,
      referenceId: charizardAuction.id,
      status: 'COMPLETED',
    },
  });

  await prisma.wallet.update({
    where: { userId: users['design_aficionado@x.com'].id },
    data: { balance: { increment: 2200000 } },
  });
  await prisma.transaction.create({
    data: {
      walletId: users['design_aficionado@x.com'].wallet.id,
      userId: users['design_aficionado@x.com'].id,
      type: 'PAYMENT',
      amount: 2200000,
      description: `Payment received for Charizard Holo`,
      referenceId: charizardAuction.id,
      status: 'COMPLETED',
    },
  });
  await prisma.settlement.create({
    data: {
      auctionId: charizardAuction.id,
      sellerId: users['design_aficionado@x.com'].id,
      partyId: users['rolex_collector@x.com'].id,
      amount: 2200000,
      kind: 'WON_AUCTION',
    },
  });

  console.log('✅ Bids populated.');

  // 4. Seed AutoBids
  console.log('- Creating AutoBids...');
  await prisma.autoBid.create({
    data: {
      auctionId: leicaAuction.id,
      bidderId: users['design_aficionado@x.com'].id,
      maxAmount: 300000,
      currentBid: 250000,
      isActive: true,
    },
  });

  await prisma.autoBid.create({
    data: {
      auctionId: leicaAuction.id,
      bidderId: users['synth_wizard@x.com'].id,
      maxAmount: 280000,
      currentBid: 260000,
      isActive: true,
    },
  });

  console.log('✅ AutoBids populated.');

  // 5. Seed Sealed Commitments
  console.log('- Creating Sealed-Bid Commitments...');
  
  // commitments for active Eames auction
  await prisma.bidCommitment.create({
    data: {
      auctionId: eamesAuction.id,
      bidderId: users['rolex_collector@x.com'].id,
      commitHash: 'd2cf1d11ebf40f0efc03be93c9d2427a14e9abfe219c63de0f0d2c69d82a1f11',
    },
  });

  await prisma.bidCommitment.create({
    data: {
      auctionId: eamesAuction.id,
      bidderId: users['leica_purist@x.com'].id,
      commitHash: 'a1d0d9f82639a0efc03be93c9d2427a14e9abfe219c63de0f0d2c69d82a1f88',
    },
  });

  await prisma.bidCommitment.create({
    data: {
      auctionId: eamesAuction.id,
      bidderId: users['synth_wizard@x.com'].id,
      commitHash: '12c3f8f94d930f0efc03be93c9d2427a14e9abfe219c63de0f0d2c69d82a1f99',
    },
  });

  // commitments for ended Banksy auction (revealed)
  await prisma.bidCommitment.create({
    data: {
      auctionId: banksyAuction.id,
      bidderId: users['rolex_collector@x.com'].id,
      commitHash: 'e69888ffac366da074041d01918a22bc73cf58e0a1d3bc01b5042a9bcf8a89ee',
      nonce: 'banksy_secret_123',
      revealedAt: new Date(now.getTime() - 47 * 60 * 60 * 1000),
      revealedAmount: 1500000,
      revealedNonce: 'banksy_secret_123',
      isValid: true,
    },
  });

  await prisma.bidCommitment.create({
    data: {
      auctionId: banksyAuction.id,
      bidderId: users['leica_purist@x.com'].id,
      commitHash: 'cf9f0d1a4bb31a0e88029c782b13be2ea8a11cf87a2ab5d4eefd89bcf281a8dd',
      nonce: 'leica_secret_456',
      revealedAt: new Date(now.getTime() - 47 * 60 * 60 * 1000),
      revealedAmount: 1300000,
      revealedNonce: 'leica_secret_456',
      isValid: true,
    },
  });

  console.log('✅ Sealed Commitments populated.');

  // 6. Seed Ratings
  console.log('- Creating Ratings...');
  await prisma.rating.create({
    data: {
      raterId: users['design_aficionado@x.com'].id,
      rateeId: users['rolex_collector@x.com'].id,
      auctionId: rolexAuction.id,
      score: 5,
      comment: 'Exceptional watches! Pristine packaging and prompt answers.',
    },
  });
  console.log('✅ Ratings populated.');

  // 7. Seed Watchlist Items
  console.log('- Creating Watchlist Items...');
  await prisma.watchlistItem.create({
    data: {
      userId: users['rolex_collector@x.com'].id,
      auctionId: leicaAuction.id,
    },
  });

  await prisma.watchlistItem.create({
    data: {
      userId: users['design_aficionado@x.com'].id,
      auctionId: moogAuction.id,
    },
  });
  await prisma.watchlistItem.create({
    data: {
      userId: users['admin@auctionhaus.com'].id,
      auctionId: rolexPrecisionAuction.id,
    },
  });

  await prisma.watchlistItem.create({
    data: {
      userId: users['rolex_collector@x.com'].id,
      auctionId: eamesAuction.id,
    },
  });

  await prisma.watchlistItem.create({
    data: {
      userId: users['leica_purist@x.com'].id,
      auctionId: stratAuction.id,
    },
  });

  console.log('✅ Watchlist Items populated.');

  // 8. Seed Notifications
  console.log('- Creating Notifications...');
  await prisma.notification.create({
    data: {
      userId: users['leica_purist@x.com'].id,
      type: 'OUTBID',
      title: 'You have been outbid!',
      message: `Someone just placed a higher bid of ₹220,000 on your Leica M6 listing.`,
      isRead: false,
      data: { auctionId: leicaAuction.id, amount: 220000 },
    },
  });

  await prisma.notification.create({
    data: {
      userId: users['design_aficionado@x.com'].id,
      type: 'AUCTION_WON',
      title: 'Congratulations!',
      message: `You won the Rolex Submariner for ₹950,000!`,
      isRead: true,
      data: { auctionId: rolexAuction.id, amount: 950000 },
    },
  });
  await prisma.notification.create({
    data: {
      userId: users['rolex_collector@x.com'].id,
      type: 'AUCTION_WON',
      title: 'Grail Acquired!',
      message: `You successfully bought the Charizard Holo at ₹2,200,000.`,
      isRead: true,
      data: { auctionId: charizardAuction.id, amount: 2200000 },
    },
  });

  await prisma.notification.create({
    data: {
      userId: users['admin@auctionhaus.com'].id,
      type: 'GENERAL',
      title: 'Fraud Alert Warning',
      message: `Shill bidding pattern detected on 'Vintage Rolex Oyster Precision (1960)'.`,
      isRead: false,
      data: { auctionId: rolexPrecisionAuction.id, flagLevel: 'HIGH' },
    },
  });

  await prisma.notification.create({
    data: {
      userId: users['leica_purist@x.com'].id,
      type: 'AUCTION_ENDED',
      title: 'Sealed Bid Results',
      message: `The Banksy Screenprint auction has concluded. You did not win this item.`,
      isRead: true,
      data: { auctionId: banksyAuction.id },
    },
  });

  console.log('✅ Notifications populated.');

  // 9. Seed Fraud Flags
  console.log('- Creating Fraud Flags (Shill Bidding alerts)...');
  
  const shillBid1 = seededShillBids.find(b => b.amount === 110000);
  const shillBid2 = seededShillBids.find(b => b.amount === 125000);
  const shillBid3 = seededShillBids.find(b => b.amount === 140000);

  if (shillBid1 && shillBid2 && shillBid3) {
    await prisma.fraudFlag.create({
      data: {
        bidderId: users['shill_bot_99@x.com'].id,
        auctionId: rolexPrecisionAuction.id,
        bidId: shillBid1.id,
        score: 0.98,
        features: {
          responseTime: 0.14,
          reciprocity: 0.88,
          bidIncrementRatio: 0.05,
          centrality: 0.75,
          sellerCoOccurrence: 0.90,
        },
        reason: 'Extremely rapid sub-second bid response time (140ms) detected. Highly predictive of automated proxy shill bidding.',
        dismissed: false,
      },
    });

    await prisma.fraudFlag.create({
      data: {
        bidderId: users['collusive_buddy@x.com'].id,
        auctionId: rolexPrecisionAuction.id,
        bidId: shillBid2.id,
        score: 0.92,
        features: {
          responseTime: 0.19,
          reciprocity: 0.92,
          bidIncrementRatio: 0.05,
          centrality: 0.84,
          sellerCoOccurrence: 0.85,
        },
        reason: 'High bid-reciprocity co-occurrence pattern (92%) detected between Lucas Vance and Marcus Thorne across multiple listings hosted by Elian Thorne.',
        dismissed: false,
      },
    });

    await prisma.fraudFlag.create({
      data: {
        bidderId: users['shill_bot_99@x.com'].id,
        auctionId: rolexPrecisionAuction.id,
        bidId: shillBid3.id,
        score: 0.96,
        features: {
          responseTime: 0.11,
          reciprocity: 0.89,
          bidIncrementRatio: 0.05,
          centrality: 0.78,
          sellerCoOccurrence: 0.92,
        },
        reason: 'Coordinated bid spacing pattern detected. Bid response occurred immediately (110ms) following a legitimate user bid, forcing price escalation while protecting seller reserve margin.',
        dismissed: false,
      },
    });
  }

  console.log('✅ Fraud Flags populated.');

  console.log('\n🌟 Seeding complete! The database now represents a vibrant live auction system with beautiful, active data, complete transaction history, auto-bid states, sealed-bid cryptographic commitments, completed settlements, and active shill-bidding alerts for your fraud graph and dashboard screenshots.');
}

main()
  .catch((e) => {
    console.error('❌ Populate script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
