import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, FREE_FALLBACK_ID, getModel } from "./models";
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
  it("runs the selected free model when it is ready", () => {
    const eff = resolveEffectiveModel("gemini-flash", [state("gemini-flash", "live")], 0);
    expect(eff).toMatchObject({ id: "gemini-flash", reason: "none", substituted: false });
  });

  it("names the free fallback when a paid model cannot be covered", () => {
    const eff = resolveEffectiveModel("sonnet", [], 0);
    expect(eff.id).toBe(FREE_FALLBACK_ID);
    expect(eff.reason).toBe("no_credits");
    expect(eff.substituted).toBe(true);
    expect(effectiveStatement(eff)).toContain(`Will run: ${eff.label}`);
  });

  it("runs the selected paid model when the wallet covers it", () => {
    const eff = resolveEffectiveModel("haiku", [], 5);
    expect(eff).toMatchObject({ id: "haiku", reason: "none", substituted: false });
    expect(effectiveStatement(eff)).toBeNull();
  });

  it("skips a model that needs setup for the next ready free model", () => {
    const eff = resolveEffectiveModel(
      "groq-gpt-oss",
      [state("groq-gpt-oss", "no_key"), state("gemini-flash", "live")],
      0,
    );
    expect(eff.id).toBe("gemini-flash");
    expect(eff.reason).toBe("needs_setup");
    expect(eff.substituted).toBe(true);
  });

  it("keeps a needs-setup model honest when nothing else is ready", () => {
    const eff = resolveEffectiveModel("groq-gpt-oss", [state("groq-gpt-oss", "no_key")], 0);
    expect(eff.id).toBe("groq-gpt-oss");
    expect(eff.substituted).toBe(false);
    expect(effectiveStatement(eff)).toContain("once it is set up");
  });

  it("tries a temporarily-unavailable model first and names the fallback", () => {
    const eff = resolveEffectiveModel(
      "openrouter-free",
      [state("openrouter-free", "rate_limited"), state("gemini-flash", "live")],
      0,
    );
    expect(eff.id).toBe("openrouter-free");
    expect(eff.reason).toBe("unavailable");
    expect(eff.substituted).toBe(false);
    expect(eff.fallbackLabel).toBe("Gemini Flash");
    expect(effectiveStatement(eff)).toContain("fall back to Gemini Flash");
  });

  it("falls back to the default free model for an unknown selection", () => {
    expect(resolveEffectiveModel("nope", [], 0).id).toBe(DEFAULT_MODEL_ID);
  });

  it("is deterministic for the same inputs", () => {
    const readiness = [state("groq-gpt-oss", "no_key"), state("gemini-flash", "live")];
    expect(resolveEffectiveModel("groq-gpt-oss", readiness, 0)).toEqual(
      resolveEffectiveModel("groq-gpt-oss", readiness, 0),
    );
  });
});
