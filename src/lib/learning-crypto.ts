import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedLearning {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function learningKeyFromEnv(env: Record<string, string | undefined> = process.env): Buffer | null {
  const encoded = env.VIBECODER_LEARNING_KEY?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  return key.length === KEY_BYTES ? key : null;
}

export function encryptLearning(
  payload: unknown,
  key: Buffer,
  keyVersion = "v1",
): EncryptedLearning {
  if (key.length !== KEY_BYTES) throw new Error("Invalid learning encryption key");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(keyVersion, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptLearning(
  encrypted: EncryptedLearning,
  key: Buffer,
): unknown {
  if (key.length !== KEY_BYTES) throw new Error("Invalid learning encryption key");
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid learning ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(encrypted.keyVersion, "utf8"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}
