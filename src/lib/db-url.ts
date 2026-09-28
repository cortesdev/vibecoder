export type LibsqlConnection = {
  url: string;
  authToken?: string;
};

export function libsqlConnection(): LibsqlConnection {
  // Empty strings count as unset (orchestrators hand "" for empty values).
  const host = process.env.TURSO_DATABASE_URL || undefined;
  const token = process.env.TURSO_DATABASE_TOKEN || process.env.TURSO_API_KEY || undefined;

  if (host && token) {
    return { url: host, authToken: token };
  }

  const full = host || token || process.env.LICENSE_DB_URL || "";

  if (full.startsWith("file:")) return { url: full };

  if (full.startsWith("libsql://") || full.startsWith("https://")) {
    const u = new URL(full);
    const authToken = u.searchParams.get("authToken") ?? undefined;
    if (authToken) u.searchParams.delete("authToken");
    if (authToken) {
      return { url: u.toString(), authToken };
    }
    return { url: u.toString() };
  }

  if (token) {
    throw new Error(
      "A Turso token is set but is not a URL. Set TURSO_DATABASE_URL to the " +
        "database host (e.g. libsql://<db>.<org>-<slug>.turso.io).",
    );
  }

  return { url: "file:./licenses.db" };
}