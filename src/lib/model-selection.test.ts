import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, getModel } from "./models";
import type { ModelReadiness, ReadinessStatus } from "./readiness";
import { effectiveStatement, resolveEffectiveModel, rowKind } from "./model-selection";

function state(modelId: string, status: ReadinessStatus): ModelReadiness {
  const model = getModel(modelId)!;
  return {
    modelId,
    label: model.label,
    provider: model.provider,
    providerLabel: model.provider,
    model: model.model,
    source: status === "no_key" ? "none" : "platform",
    status,
    message: status,
    checkedAt: Date.now(),
  };
}

describe("rowKind — three states, not one blanket disabled", () => {
  it("treats unchecked and live models as runnable", () => {
    expect(rowKind(undefined)).toBe("runnable");
    expect(rowKind("live")).toBe("runnable");
  });

  it("treats key/model problems as not-set-up-yet", () => {
    expect(rowKind("no_key")).toBe("setup");
    expect(rowKind("rejected")).toBe("setup");
    expect(rowKind("model_missing")).toBe("setup");
  });

  it("treats rate limits and outages as temporary", () => {
    expect(rowKind("rate_limited")).toBe("temporary");
    expect(rowKind("unreachable")).toBe("temporary");
  });
});

describe("resolveEffectiveModel — never lie about which model runs", () => {
  it("runs the selected model when it is ready", () => {
    const eff = resolveEffectiveModel("gemini-flash", [state("gemini-flash", "live")]);
    expect(eff).toMatchObject({ id: "gemini-flash", reason: "none", substituted: false });
    expect(effectiveStatement(eff)).toBeNull();
  });

  it("skips a model that needs a key for the next ready model", () => {
    const eff = resolveEffectiveModel("groq-gpt-oss", [
      state("groq-gpt-oss", "no_key"),
      state("gemini-flash", "live"),
    ]);
    expect(eff.id).toBe("gemini-flash");
    expect(eff.reason).toBe("needs_setup");
    expect(eff.substituted).toBe(true);
  });

  it("keeps a needs-setup model honest when nothing else is ready", () => {
    const eff = resolveEffectiveModel("groq-gpt-oss", [state("groq-gpt-oss", "no_key")]);
    expect(eff.id).toBe("groq-gpt-oss");
    expect(eff.substituted).toBe(false);
    expect(effectiveStatement(eff)).toContain("once a key is added");
  });

  it("tries a temporarily-unavailable model first and names the fallback", () => {
    const eff = resolveEffectiveModel("openrouter-free", [
      state("openrouter-free", "rate_limited"),
      state("gemini-flash", "live"),
    ]);
    expect(eff.id).toBe("openrouter-free");
    expect(eff.reason).toBe("unavailable");
    expect(eff.substituted).toBe(false);
    expect(eff.fallbackLabel).toBe("Gemini Flash");
    expect(effectiveStatement(eff)).toContain("fall back to Gemini Flash");
  });

  it("falls back to the default model for an unknown selection", () => {
    expect(resolveEffectiveModel("nope", []).id).toBe(DEFAULT_MODEL_ID);
  });

  it("is deterministic for the same inputs", () => {
    const readiness = [state("groq-gpt-oss", "no_key"), state("gemini-flash", "live")];
    expect(resolveEffectiveModel("groq-gpt-oss", readiness)).toEqual(
      resolveEffectiveModel("groq-gpt-oss", readiness),
    );
  });
});
