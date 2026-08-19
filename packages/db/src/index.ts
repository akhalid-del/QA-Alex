import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client. Reuse across the process (and survive hot-reload in
 * dev) so we don't exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { Prisma } from '@prisma/client';
export type * from '@prisma/client';
