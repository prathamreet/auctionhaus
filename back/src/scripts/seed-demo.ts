// One-shot demo seeder.
//
// Creates the standard demo accounts (admin/one/two/three/hoster, all with
// password 123123 and a funded wallet) and one ACTIVE auction of each type
// (English, Dutch, Sealed-bid) owned by hoster@x.com so the other accounts
// can bid immediately. Idempotent: existing users are skipped, and auctions
// are only created if hoster has no ACTIVE auction of that type already.
//
// Run from the repo root:  npm run db:seed-demo
// or from back/:           npm run db:seed-demo

import bcrypt from 'bcryptjs';
import { Role, AuctionType, AuctionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createAuction } from '../modules/auctions/auction.service';

const PASSWORD = '123123';
const STARTER_BALANCE = 1000000;

const USERS = [
  { email: 'admin@x.com', name: 'Admin', role: 'ADMIN' as const },
  { email: 'one@x.com', name: 'One', role: 'USER' as const },
  { email: 'two@x.com', name: 'Two', role: 'USER' as const },
  { email: 'three@x.com', name: 'Three', role: 'USER' as const },
  { email: 'hoster@x.com', name: 'Hoster', role: 'USER' as const },
];

async function seedUsers(): Promise<void> {
  const hashed = await bcrypt.hash(PASSWORD, 12);
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`[skip] User ${u.email} already exists.`);
      continue;
    }
    await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        password: hashed,
        role: u.role as Role,
        wallet: { create: { balance: STARTER_BALANCE } },
      },
    });
    console.log(`[add]  ${u.email} (${u.role})`);
  }
}

async function seedAuctions(): Promise<void> {
  const seller = await prisma.user.findUnique({ where: { email: 'hoster@x.com' } });
  if (!seller) {
    console.error('[fail] hoster@x.com missing after user seed. Aborting auction seed.');
    return;
  }

  const now = new Date();
  const hours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  const specs = [
    {
      type: AuctionType.ENGLISH,
      title: 'Smart Modular Synthesizer System',
      description:
        'Full Eurorack setup including oscillators, filters, and sequencers. Housed in a custom walnut travel case.',
      startingPrice: 1000,
      minIncrement: 100,
      endTime: hours(24),
      extra: {},
    },
    {
      type: AuctionType.DUTCH,
      title: 'Limited-Edition Sports Coupe (Dutch)',
      description:
        'Excellent condition, limited edition. Price drops on a fixed interval until sold or the reserve is met.',
      startingPrice: 85000,
      minIncrement: 100,
      endTime: hours(48),
      extra: { reservePrice: 45000, dutchPriceStep: 2000, dutchInterval: 60 },
    },
    {
      type: AuctionType.SEALED_BID,
      title: 'Ultra-Rare Collectible Card (Sealed Bid)',
      description:
        'Mint-condition collectible. Submit your maximum secret bid. The winner is announced at close.',
      startingPrice: 5000,
      minIncrement: 100,
      endTime: hours(72),
      extra: {},
    },
  ];

  for (const s of specs) {
    const already = await prisma.auction.findFirst({
      where: { sellerId: seller.id, type: s.type, status: AuctionStatus.ACTIVE },
    });
    if (already) {
      console.log(`[skip] hoster already has an ACTIVE ${s.type} auction (${already.id}).`);
      continue;
    }
    const auction = await createAuction(seller.id, {
      title: s.title,
      description: s.description,
      type: s.type,
      startingPrice: s.startingPrice,
      minIncrement: s.minIncrement,
      startTime: now,
      endTime: s.endTime,
      ...s.extra,
    });
    console.log(`[add]  ${s.type} auction "${auction.title}" (${auction.id})`);
  }
}

async function main(): Promise<void> {
  console.log('[seed] Demo seed starting...');
  await seedUsers();
  await seedAuctions();
  console.log('[done] Demo seed complete.');
  console.log(`[info] All accounts share password: ${PASSWORD}`);
  console.log('[info] Sign in as one@x.com / two@x.com / three@x.com to bid; hoster owns the lots.');
}

main()
  .catch((e) => {
    console.error('[fail] Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
