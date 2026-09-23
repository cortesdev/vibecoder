import "temporal-polyfill/global";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../prisma/contract";
import contractJson from "../prisma/contract.json" with { type: "json" };

// Prisma ORM 8 has no generated PrismaClient: the client is built from the
// emitted contract (contract.json + contract.d.ts, committed). It connects
// lazily on the first query, so importing this module at build time is safe.
// DATABASE_URL is provisioned on the deploy platform; locally it lives in .env.

function createDb() {
  return postgres<Contract>({
    contractJson,
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/vibecoder",
  });
}

const globalForDb = globalThis as unknown as {
  vibecoderDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.vibecoderDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.vibecoderDb = db;
}
