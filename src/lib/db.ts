import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaLibSql({ url: process.env.LICENSE_DB_URL ?? "file:./licenses.db" }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
