import postgres from '@prisma/orm-postgres/runtime';
// Adjust these relative paths to point exactly to your emitted contract files
import contractJson from '../../prisma/contract.json' with { type: 'json' };
import { Contract } from '../../prisma/contract.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

// 1. Reference the globalThis scope to prevent connection duplication during hot-reloads
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof postgres<Contract>> };

// 2. Initialize the client using the Prisma 8 runtime factory
export const prisma = globalForPrisma.prisma ?? postgres<Contract>({
  url: connectionString,
  contractJson,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
