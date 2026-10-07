import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/client";

export { Prisma };
export type { PrismaClient };
export type TxClient = Prisma.TransactionClient;
/** Either the root client or a transaction client — lets repositories work in both contexts. */
export type Db = PrismaClient | TxClient;

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

/** One pooled client per process (survives Next.js dev hot-reloads). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__prisma) globalForPrisma.__prisma = create();
  return globalForPrisma.__prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_t, prop) => Reflect.get(getDb(), prop),
});

/**
 * Run `fn` in a SERIALIZABLE-safe transaction with automatic retry on serialization failures / deadlocks.
 * Critical money & stock flows should go through this helper.
 */
export async function withTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  opts: { isolation?: Prisma.TransactionIsolationLevel; maxWaitMs?: number; timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().$transaction(fn, {
        isolationLevel: opts.isolation ?? Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: opts.maxWaitMs ?? 5_000,
        timeout: opts.timeoutMs ?? 15_000,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code === "P2034" || code === "40001" || code === "40P01") && attempt < retries) {
        await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 20));
        continue;
      }
      throw e;
    }
  }
}

export async function disconnectDb() {
  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
    globalForPrisma.__prisma = undefined;
  }
}
