import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

export const E2E_DB = "/tmp/e2e-v2.db";

// Fresh isolated database per run: apply every migration in order, newest last.
export default async function setup(): Promise<void> {
  try {
    rmSync(E2E_DB);
  } catch {
    // first run — nothing to remove
  }
  const db = createClient({ url: `file:${E2E_DB}` });
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of folders) {
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    await db.executeMultiple(sql);
  }
  await db.close();
}
