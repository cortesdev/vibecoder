import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptLearning, encryptLearning, learningKeyFromEnv } from "./learning-crypto";

describe("learning encryption", () => {
  it("round-trips a payload without exposing plaintext", () => {
    const key = randomBytes(32);
    const payload = { summary: "Keep the approved plan small", skillIds: ["context-engineering"] };
    const encrypted = encryptLearning(payload, key);
    expect(encrypted.ciphertext).not.toContain(payload.summary);
    expect(decryptLearning(encrypted, key)).toEqual(payload);
  });

  it("rejects an invalid key and tampered ciphertext", () => {
    const key = randomBytes(32);
    const encrypted = encryptLearning({ summary: "safe" }, key);
    expect(() => encryptLearning({ summary: "safe" }, randomBytes(16))).toThrow(/key/i);
    expect(() => decryptLearning({ ...encrypted, authTag: randomBytes(16).toString("base64") }, key)).toThrow();
  });

  it("requires a base64-encoded 32-byte environment key", () => {
    expect(learningKeyFromEnv({})).toBeNull();
    expect(learningKeyFromEnv({ VIBECODER_LEARNING_KEY: randomBytes(16).toString("base64") })).toBeNull();
    const key = randomBytes(32);
    expect(learningKeyFromEnv({ VIBECODER_LEARNING_KEY: key.toString("base64") })).toEqual(key);
  });
});
