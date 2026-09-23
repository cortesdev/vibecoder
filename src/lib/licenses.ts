import { createHash } from "node:crypto";
import { db } from "./db";

// The Pro license allows activation on up to this many machines. Generous on
// purpose: the point is convenience for the buyer, not copy protection.
export const MAX_MACHINES = 10;

/**
 * Deterministic, readable license key derived from the Stripe session id so
 * webhook retries always produce the same key: VBC-XXXXX-XXXXX-XXXXX-XXXXX
 * (unambiguous alphabet: no 0/O/1/I).
 */
export function generateLicenseKey(sessionId: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const digest = createHash("sha256").update(`vibecoder-pro:${sessionId}`).digest();
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let c = 0; c < 5; c++) {
      group += alphabet[digest[g * 5 + c] % alphabet.length];
    }
    groups.push(group);
  }
  return `VBC-${groups.join("-")}`;
}

export interface FulfillmentResult {
  licenseKey: string;
  created: boolean;
}

/**
 * Fulfill a completed checkout: mint and store the license. Idempotent —
 * if a license already exists for this Stripe session, return it unchanged.
 * Test-mode purchases produce real rows (key prefixed TEST-) so the whole
 * flow is exercisable without money; validation treats them as valid but
 * the success page labels them clearly.
 */
export async function fulfillLicense(input: {
  sessionId: string;
  email: string;
  paymentIntent?: string;
  testMode?: boolean;
}): Promise<FulfillmentResult> {
  const existing = await db.license.findUnique({
    where: { stripeSessionId: input.sessionId },
  });
  if (existing) {
    return { licenseKey: existing.key, created: false };
  }
  const key = input.testMode
    ? `TEST-${generateLicenseKey(input.sessionId)}`
    : generateLicenseKey(input.sessionId);
  await db.license.create({
    data: {
      key,
      email: input.email,
      stripeSessionId: input.sessionId,
      stripePaymentIntent: input.paymentIntent ?? "",
    },
  });
  return { licenseKey: key, created: true };
}

export async function revokeByPaymentIntent(paymentIntent: string): Promise<void> {
  if (!paymentIntent) return;
  await db.license.updateMany({
    where: { stripePaymentIntent: paymentIntent },
    data: { status: "revoked" },
  });
}

/** Hash the client-provided machine id; we never store raw fingerprints. */
export function hashMachineId(machineId: string): string {
  return createHash("sha256").update(`machine:${machineId}`).digest("hex").slice(0, 32);
}

export type ValidateResult =
  | { ok: true; email: string; machines: number }
  | { ok: false; reason: "not_found" | "revoked" | "limit_reached" };

/**
 * Validate a license key and (when machineId is provided) activate the
 * machine. Validation without activation happens on every app start;
 * activation happens when the machine id is new.
 */
export async function validateLicense(
  key: string,
  machineId?: string,
  label?: string,
): Promise<ValidateResult> {
  const license = await db.license.findUnique({
    where: { key: key.trim().toUpperCase() },
    include: { activations: true },
  });
  if (!license) return { ok: false, reason: "not_found" };
  if (license.status === "revoked") return { ok: false, reason: "revoked" };

  if (machineId) {
    const hashed = hashMachineId(machineId);
    const known = license.activations.some((a) => a.machineId === hashed);
    if (!known) {
      if (license.activations.length >= MAX_MACHINES) {
        return { ok: false, reason: "limit_reached" };
      }
      await db.licenseActivation.create({
        data: { licenseId: license.id, machineId: hashed, label: (label ?? "").slice(0, 80) },
      });
      return { ok: true, email: license.email, machines: license.activations.length + 1 };
    }
    return { ok: true, email: license.email, machines: license.activations.length };
  }

  return { ok: true, email: license.email, machines: license.activations.length };
}
