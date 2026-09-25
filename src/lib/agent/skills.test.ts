import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fetchRemoteSkillManifest } from "./skill-catalog";
import { DEFAULT_SKILLS, parseSkillManifest, selectSkillIds } from "./skills";

const manifest = {
  schemaVersion: 1,
  version: "2026.09.25",
  skills: [
    {
      id: "remote-review",
      name: "Remote review",
      description: "Review a change before editing.",
      instructions: "Check the requested behavior and identify the smallest safe change.",
      version: "1.0.0",
      tags: ["review"],
    },
  ],
};

function signedResponse(body: string, signature: Buffer) {
  return new Response(body, {
    headers: { "x-vibecoder-signature": signature.toString("base64") },
  });
}

describe("skill catalog", () => {
  it("ships the five approved defaults", () => {
    expect(DEFAULT_SKILLS.map((skill) => skill.id)).toEqual([
      "context-engineering",
      "incremental-implementation",
      "test-driven-development",
      "debugging-and-error-recovery",
      "security-and-hardening",
    ]);
    expect(DEFAULT_SKILLS.every((skill) => skill.source === "builtin")).toBe(true);
  });

  it("parses a bounded remote manifest", () => {
    const parsed = parseSkillManifest(manifest);
    expect(parsed.skills[0]).toMatchObject({ id: "remote-review", source: "remote" });
  });

  it("rejects malformed or duplicate remote skills", () => {
    expect(() => parseSkillManifest({ ...manifest, skills: [{ id: "bad id" }] })).toThrow(/skill/i);
    expect(() => parseSkillManifest({ ...manifest, skills: [manifest.skills[0], manifest.skills[0]] })).toThrow(/duplicate/i);
  });

  it("selects at most three known skills and falls back to relevant defaults", () => {
    const selected = selectSkillIds(DEFAULT_SKILLS, ["security-and-hardening", "unknown", "context-engineering", "test-driven-development"], "secure this app");
    expect(selected).toEqual(["security-and-hardening", "context-engineering", "test-driven-development"]);

    const fallback = selectSkillIds(DEFAULT_SKILLS, [], "make the interface accessible");
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.length).toBeLessThanOrEqual(3);
  });

  it("accepts only a correctly signed HTTPS manifest", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const body = JSON.stringify(manifest);
    const signature = sign(null, Buffer.from(body), privateKey);
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const fetcher = vi.fn(async () => signedResponse(body, signature));

    await expect(fetchRemoteSkillManifest("https://skills.example/manifest.json", publicKeyPem, fetcher)).resolves.toMatchObject({
      version: manifest.version,
      skills: [{ id: "remote-review" }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://skills.example/manifest.json",
      expect.objectContaining({ redirect: "error" }),
    );

    await expect(
      fetchRemoteSkillManifest("http://skills.example/manifest.json", publicKeyPem, fetcher),
    ).rejects.toThrow(/https/i);
    await expect(
      fetchRemoteSkillManifest("https://skills.example/manifest.json", publicKeyPem, async () => signedResponse(body, Buffer.from("bad"))),
    ).rejects.toThrow(/signature/i);
  });
});
