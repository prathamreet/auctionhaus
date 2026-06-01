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
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing database tables...');

  // Delete in order to satisfy foreign key constraints
  const deleteOrder = [
    'settlement',
    'bidCommitment',
    'fraudFlag',
    'rating',
    'notification',
    'watchlistItem',
    'autoBid',
    'bid',
    'transaction',
    'wallet',
    'auction',
    'user',
  ];

  for (const model of deleteOrder) {
    try {
      console.log(`- Deleting all records from ${model}...`);
      await prisma[model].deleteMany({});
    } catch (err) {
      console.error(`❌ Error clearing model ${model}:`, err.message);
    }
  }

  console.log('✨ Database clean complete.');
}

main()
  .catch((e) => {
    console.error('❌ Clear script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
