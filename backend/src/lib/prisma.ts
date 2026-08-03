import { PrismaClient } from '@prisma/client';

// Shared Prisma client.
//
// Every `new PrismaClient()` opens its own connection pool (default ~5-10).
// With ~22 modules each instantiating one, we hit Postgres's per-role
// connection limit on shared hosts (Opalstack ≈ 20). Reusing this single
// instance across the process keeps total connections bounded to one pool.
//
// In dev with hot-reload (ts-node-dev / nodemon), module re-import would
// otherwise leak clients on every reload — stash on `globalThis` to survive.

declare global {
  // eslint-disable-next-line no-var
  var __jaypos_prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__jaypos_prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__jaypos_prisma = prisma;
}

export default prisma;
