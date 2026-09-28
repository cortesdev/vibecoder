import { createHash, randomBytes } from "node:crypto";

// Read-only preview shares. The bearer token is cryptographically random and
// shown once; only its sha256 is stored. Invalid, expired, and revoked shares
// all verify identically false so the page can answer uniformly.

export const SHARE_TTL_MS = 7 * 24 * 3600_000;
export const SHARE_SNAPSHOT_MAX_BYTES = 1_000_000;

export interface StoredShare {
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** A URL-safe bearer token (256 bits). */
export function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyShare(share: StoredShare, token: string, now = Date.now()): boolean {
  if (share.revokedAt !== null) return false;
  if (share.expiresAt.getTime() <= now) return false;
  const candidate = hashToken(token);
  if (candidate.length !== share.tokenHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ share.tokenHash.charCodeAt(i);
  return diff === 0;
}
