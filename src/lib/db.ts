import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { libsqlConnection } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaLibSql(libsqlConnection()),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
