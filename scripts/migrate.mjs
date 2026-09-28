import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client");

function connection() {
  const host = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_DATABASE_TOKEN ?? process.env.TURSO_API_KEY;

  if (host && token) {
    return { url: host, authToken: token };
  }

  const full = host ?? token ?? process.env.LICENSE_DB_URL ?? "";

  if (full.startsWith("libsql://") || full.startsWith("https://")) {
    const u = new URL(full);
    const authToken = u.searchParams.get("authToken") ?? undefined;
    if (authToken) u.searchParams.delete("authToken");
    return authToken ? { url: u.toString(), authToken } : { url: u.toString() };
  }

  if (token) {
    throw new Error(
      "A Turso token is set but is not a URL. Set TURSO_DATABASE_URL to the " +
        "database host (e.g. libsql://<db>.<org>-<slug>.turso.io).",
    );
  }

  return { url: full };
}

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

function objectNames(sql) {
  const names = [];
  const re =
    /CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/gi;
  let m;
  while ((m = re.exec(sql))) names.push(m[1]);
  return names;
}

async function probeTurso(conn) {
  if (!conn.authToken) return;
  const endpoint = `${conn.url.replace(/^libsql:/, "https:")}/v2/pipeline`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: "SELECT 1" } }] }),
  });
  console.log(`probe ${res.status}: ${(await res.text()).slice(0, 500)}`);
}

async function main() {
  const conn = connection();

  if (!conn.url) {
    console.log("migrate: no remote database configured, skipping");
    return;
  }
  if (conn.url.startsWith("file:") && process.env.MIGRATE_ALLOW_FILE !== "1") {
    console.log("migrate: no remote database configured, skipping");
    return;
  }

  console.log(
    `migrate: applying migrations to ${conn.url.startsWith("file:") ? conn.url : new URL(conn.url).host || conn.url}`,
  );
  const client = createClient(conn);

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  const appliedRes = await client.execute('SELECT "migration_name" FROM "_prisma_migrations"');
  const applied = new Set(appliedRes.rows.map((r) => r.migration_name));

  if (!applied.has("init")) {
    const existingRes = await client.execute(
      `SELECT "name" FROM "sqlite_master" WHERE "type" IN ('table','index')`,
    );
    const existing = new Set(existingRes.rows.map((r) => r.name));
    const folders = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => name !== "migration_lock.toml")
      .sort();

    // Adopt migrations whose objects already exist in the DB (e.g. set up via
    // `prisma db push` instead of `migrate`) so we only run what's actually new.
    const adoptable = new Set();
    for (const name of folders) {
      if (applied.has(name)) continue;
      const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const objs = objectNames(sql);
      if (objs.length > 0 && objs.every((o) => existing.has(o))) adoptable.add(name);
    }
    for (const name of folders) {
      if (!adoptable.has(name)) continue;
      const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const now = new Date().toISOString();
      console.log(`migrate: reconciling (already present) ${name}`);
      await client.execute(
        `INSERT INTO "_prisma_migrations"
          ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count", "logs")
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [randomUUID(), checksum, now, name, now, "reconciled: objects already present"],
      );
      applied.add(name);
    }
  }

  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name !== "migration_lock.toml")
    .sort();

  if (folders.length === 0) {
    console.log("migrate: no migrations found");
    return;
  }

  let ran = 0;
  for (const name of folders) {
    if (applied.has(name)) continue;
    const sqlPath = path.join(migrationsDir, name, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const now = new Date().toISOString();

    console.log(`migrate: applying ${name}`);
    // Statement-by-statement so drifted databases (columns/tables created via
    // `db push` instead of a migration) survive: "already exists" steps are
    // skipped, anything else still fails the deploy loudly.
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      try {
        await client.execute(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate column name|already exists/i.test(msg)) {
          console.log(`migrate: skipping present object in ${name} (${msg.slice(0, 90)})`);
          continue;
        }
        throw err;
      }
    }
    await client.execute(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
       VALUES (?, ?, ?, ?, ?, 1)`,
      [randomUUID(), checksum, now, name, now],
    );
    ran += 1;
  }

  console.log(`migrate: done, ${ran} migration(s) applied`);
  await client.close();
}

main().catch(async (err) => {
  console.error("migrate failed:", err);
  try {
    await probeTurso(connection());
  } catch (e) {
    console.error("probe also failed:", e.message);
  }
  process.exit(1);
});