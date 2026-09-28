import { describe, expect, it } from "vitest";
import { hashToken, mintToken, verifyShare, type StoredShare } from "./share";

function stored(over: Partial<StoredShare> = {}): StoredShare {
  return {
    tokenHash: hashToken("tok"),
    createdAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    ...over,
  };
}

describe("preview shares", () => {
  it("mints random tokens and hashes them irreversibly", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).not.toContain(a);
    expect(hashToken(a)).toHaveLength(64);
  });

  it("verifies a live share", () => {
    expect(verifyShare(stored(), "tok")).toBe(true);
  });

  it("rejects wrong tokens uniformly", () => {
    expect(verifyShare(stored(), "other")).toBe(false);
  });

  it("rejects expired and revoked shares the same way", () => {
    expect(verifyShare(stored({ expiresAt: new Date(Date.now() - 1) }), "tok")).toBe(false);
    expect(verifyShare(stored({ revokedAt: new Date() }), "tok")).toBe(false);
  });
});
