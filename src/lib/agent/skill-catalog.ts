import { createPublicKey, verify, type KeyObject } from "node:crypto";
import {
  mergeSkillCatalog,
  parseSkillManifest,
  type SkillDefinition,
} from "./skills";

const MAX_MANIFEST_BYTES = 1_000_000;
const MANIFEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;

export type SkillCatalogSource = "builtin" | "remote";

export interface SkillCatalog {
  version: string;
  source: SkillCatalogSource;
  skills: SkillDefinition[];
  remoteError?: string;
}

export type ManifestFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

let cachedCatalog: { expiresAt: number; catalog: SkillCatalog } | undefined;

function parsePublicKey(value: string): KeyObject {
  try {
    return createPublicKey(value);
  } catch {
    throw new Error("Invalid skill manifest public key");
  }
}

export function verifySkillManifestSignature(
  body: string,
  signature: string,
  publicKey: string,
): void {
  if (!signature.trim()) throw new Error("Missing skill manifest signature");
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length === 0) throw new Error("Invalid skill manifest signature");
  const valid = verify(null, Buffer.from(body, "utf8"), parsePublicKey(publicKey), signatureBytes);
  if (!valid) throw new Error("Invalid skill manifest signature");
}

export async function fetchRemoteSkillManifest(
  url: string,
  publicKey: string,
  fetcher: ManifestFetcher = fetch,
): Promise<ReturnType<typeof parseSkillManifest>> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid skill manifest URL");
  }
  if (parsedUrl.protocol !== "https:") throw new Error("Skill manifest URL must use HTTPS");
  if (!publicKey.trim()) throw new Error("Skill manifest public key is not configured");

  const response = await fetcher(parsedUrl.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Skill manifest request failed with ${response.status}`);

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) {
    throw new Error("Skill manifest is too large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("Skill manifest is too large");
  const body = new TextDecoder().decode(bytes);
  const signature = response.headers.get("x-vibecoder-signature") ?? "";
  verifySkillManifestSignature(body, signature, publicKey);

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("Invalid skill manifest JSON");
  }
  return parseSkillManifest(value);
}

export async function getSkillCatalog(
  options: { env?: NodeJS.ProcessEnv; now?: number; fetcher?: ManifestFetcher } = {},
): Promise<SkillCatalog> {
  const now = options.now ?? Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) return cachedCatalog.catalog;

  const env = options.env ?? process.env;
  const manifestUrl = env.VIBECODER_SKILL_MANIFEST_URL?.trim();
  const publicKey = env.VIBECODER_SKILL_MANIFEST_PUBLIC_KEY?.trim();
  let remoteManifest: ReturnType<typeof parseSkillManifest> | undefined;
  let remoteError: string | undefined;

  if (manifestUrl || publicKey) {
    if (!manifestUrl || !publicKey) {
      remoteError = "Remote skill manifest is not configured";
    } else {
      try {
        remoteManifest = await fetchRemoteSkillManifest(manifestUrl, publicKey, options.fetcher);
      } catch {
        remoteError = "Remote skill manifest unavailable";
      }
    }
  }

  const skills = mergeSkillCatalog(remoteManifest?.skills ?? []);
  const catalog: SkillCatalog = {
    version: remoteManifest?.version ?? "builtin-2026.09.25",
    source: remoteManifest ? "remote" : "builtin",
    skills,
    ...(remoteError ? { remoteError } : {}),
  };
  cachedCatalog = { expiresAt: now + CACHE_TTL_MS, catalog };
  return catalog;
}

export function resetSkillCatalogCache(): void {
  cachedCatalog = undefined;
}
