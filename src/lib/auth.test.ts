import { afterEach, describe, expect, it } from "vitest";
import { isAdmin } from "./auth";

const originalAdminEmail = process.env.VIBECODER_ADMIN_EMAIL;

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.VIBECODER_ADMIN_EMAIL;
  else process.env.VIBECODER_ADMIN_EMAIL = originalAdminEmail;
});

describe("admin authorization", () => {
  it("accepts an explicit admin role", () => {
    delete process.env.VIBECODER_ADMIN_EMAIL;
    expect(isAdmin({ email: "person@example.com", role: "admin" })).toBe(true);
  });

  it("accepts only the configured email fallback", () => {
    process.env.VIBECODER_ADMIN_EMAIL = "admin@example.com";
    expect(isAdmin({ email: "ADMIN@EXAMPLE.COM", role: "user" })).toBe(true);
    expect(isAdmin({ email: "other@example.com", role: "user" })).toBe(false);
  });

  it("rejects missing users", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
