// THROWAWAY. Seeds a user + session into the scratch DB so the real
// authenticated prompt routes can be driven with a cookie. Deleted after.
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";

const url = process.env.LICENSE_DB_URL ?? "file:./tmp-e2e.db";
const token = process.env.E2E_TOKEN ?? "e2e-session-token";
const format = process.env.E2E_DATETIME ?? "ms"; // ms | iso

const client = createClient({ url });
const now = Date.now();
const stamp = (value) => (format === "iso" ? new Date(value).toISOString() : value);
const tokenHash = createHash("sha256").update(token).digest("hex");

await client.execute("delete from Session");
await client.execute("delete from User");
await client.execute({
  sql: "insert into User (id, googleSub, email, name, image, createdAt) values (?, ?, ?, ?, ?, ?)",
  args: ["e2e_user", "e2e-google-sub", "e2e@example.com", "E2E", "", stamp(now)],
});
await client.execute({
  sql: "insert into Session (id, tokenHash, userId, expiresAt) values (?, ?, ?, ?)",
  args: ["e2e_session", tokenHash, "e2e_user", stamp(now + 86_400_000)],
});

const check = await client.execute("select id, expiresAt from Session");
console.log(`seeded ${url} (datetime=${format}) session=${JSON.stringify(check.rows[0])}`);
