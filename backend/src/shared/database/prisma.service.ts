import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import { Pool } from 'pg';
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
function createDatabase() {
  const max = Number(process.env.DATABASE_POOL_SIZE || 1);
  if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error('DATABASE_POOL_SIZE must be an integer from 1 to 50');
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 30000, idleTimeoutMillis: 180000, keepAlive: true });
  const client = postgres<Contract>({ pg: pool, contractJson });
  // Prisma only closes pools it created itself. Preserve the shared client's close API
  // and own this supplied pool's lifecycle, including repeated shutdown calls.
  const closeRuntime = client.close.bind(client);
  let closing: Promise<void> | undefined;
  const close = () => closing ??= closeRuntime().finally(() => pool.end());
  return Object.assign(client, { close, [Symbol.asyncDispose]: close });
}
export const prisma = globalForPrisma.prisma ?? createDatabase();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  await prisma.connect();
  // The pool is lazy; a transaction verifies a real connection before logging.
  for (let attempt = 1; ; attempt++) {
    try { await prisma.transaction(async () => {}); break; }
    catch (error) {
      if (attempt === 3 || !(error instanceof Error) || !/connection.*(timeout|terminated|reset|closed)|ECONNRESET|ETIMEDOUT/i.test(error.message)) throw error;
      console.warn(`Database connection attempt ${attempt} failed; retrying…`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  console.log('Database connection established.');
}
