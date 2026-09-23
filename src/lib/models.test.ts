import { describe, expect, it } from "vitest";
import {
  BYO_PROVIDERS,
  DEFAULT_MODEL_ID,
  FREE_FALLBACK_ID,
  MODELS,
  PROVIDER_META,
  freeModels,
  getModel,
} from "./models";

// The registry is the single source of truth for the picker, the billing
// engine and the keys endpoint, so its invariants are worth locking down:
// every one of these has broken silently at least once.
describe("model registry", () => {
  it("accepts a BYO key for every provider a BYO model needs one from", () => {
    for (const model of MODELS.filter((m) => m.byok)) {
      expect(BYO_PROVIDERS, `${model.id} needs a ${model.provider} key`).toContain(model.provider);
    }
  });

  it("keeps the hosted tier out of the BYO provider list", () => {
    expect(BYO_PROVIDERS).not.toContain("vibecoder");
    expect(BYO_PROVIDERS).toHaveLength(Object.keys(PROVIDER_META).length - 1);
  });

  it("never routes a free model through the app-gated OpenCode free tier", () => {
    // Zen answers 403 FreeTierError for every free model called from a server,
    // so a free model on that provider can only ever fail.
    for (const model of freeModels()) expect(model.provider).not.toBe("opencode");
  });

  it("ships a default and a fallback model that are both free and cost nothing", () => {
    for (const id of [DEFAULT_MODEL_ID, FREE_FALLBACK_ID]) {
      const model = getModel(id);
      expect(model, id).not.toBeNull();
      expect(model!.tier).toBe("free");
      expect(model!.cost).toBe(0);
    }
  });

  it("starts the free chain at the default model and includes every free model once", () => {
    const chain = freeModels();
    expect(chain[0].id).toBe(DEFAULT_MODEL_ID);
    expect(chain.map((m) => m.id).sort()).toEqual(
      MODELS.filter((m) => m.tier === "free")
        .map((m) => m.id)
        .sort(),
    );
    expect(new Set(chain.map((m) => m.id)).size).toBe(chain.length);
  });

  it("bills every credits-tier model at a positive price", () => {
    for (const model of MODELS.filter((m) => m.tier === "credits")) {
      expect(model.cost, model.id).toBeGreaterThan(0);
    }
  });
});
