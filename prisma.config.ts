import path from "node:path";
import { defineConfig } from "prisma/config";

function dataSourceUrl(): string {
  const host = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_DATABASE_TOKEN ?? process.env.TURSO_API_KEY;

  if (host && token) {
    return `${host}?authToken=${encodeURIComponent(token)}`;
  }

  const full = host ?? token ?? process.env.LICENSE_DB_URL ?? "";

  if (full.startsWith("libsql://") || full.startsWith("https://")) {
    return full;
  }

  return "file:./licenses.db";
}

// Prisma 7: connection URLs live here, not in schema.prisma.
export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: dataSourceUrl(),
  },
});