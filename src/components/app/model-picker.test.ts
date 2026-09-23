// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// The readiness check is only useful if it reaches the user, so this pins the
// picker's half of the contract: a free model's state, and the provider's own
// sentence, are visible before a prompt is typed.

import ModelPicker from "./model-picker";
import type { ModelReadiness } from "@/lib/readiness";

afterEach(() => cleanup());

function state(over: Partial<ModelReadiness> & Pick<ModelReadiness, "modelId" | "status">): ModelReadiness {
  return {
    label: over.modelId === "glm-flash" ? "GLM Flash" : "Gemini Flash",
    provider: over.modelId === "glm-flash" ? "zai" : "google",
    providerLabel: over.modelId === "glm-flash" ? "Z.ai" : "Google",
    model: over.modelId === "glm-flash" ? "glm-4.7-flash" : "gemini-3.8-flash",
    source: "platform",
    message: "checked",
    checkedAt: Date.now(),
    ...over,
  };
}

function mount(readiness: ModelReadiness[]) {
  const onChange = vi.fn();
  render(
    createElement(ModelPicker, { value: "glm-flash", onChange, balance: 0, readiness }),
  );
  return onChange;
}

describe("model picker readiness", () => {
  it("says the free tier is ready, and which model is answering", () => {
    mount([
      state({
        modelId: "glm-flash",
        status: "live",
        answeredModel: "glm-4.7-flash",
        catalogSize: 42,
        message: 'Z.ai accepted the platform key — GLM Flash answered on "glm-4.7-flash" (42 models listed).',
      }),
      state({ modelId: "gemini-flash", status: "no_key", source: "none", message: "Gemini Flash needs a Google API key." }),
    ]);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const menu = within(screen.getByRole("listbox"));

    expect(menu.getByText("Free — ready now (GLM Flash)")).toBeTruthy();
    expect(menu.getByText("ready")).toBeTruthy();
    expect(menu.getByText("needs key")).toBeTruthy();
  });

  it("shows the provider's refusal, in its own words, on the selected model", () => {
    mount([
      state({
        modelId: "glm-flash",
        status: "rejected",
        message:
          'Z.ai refused the "glm-flash" model — HTTP 401, provider said: "Authentication parameter not received in Header". Z.ai did not accept the key. Add a working Z.ai key in Settings → API keys.',
      }),
    ]);

    // The chip itself carries the state, before anything is opened.
    expect(screen.getByRole("button", { expanded: false }).textContent).toContain("key refused");

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const line = within(screen.getByRole("listbox")).getByText(
      /Authentication parameter not received in Header/,
    );
    expect(line.getAttribute("data-readiness")).toBe("rejected");
  });

  it("warns when the configured model id is not one the provider serves", () => {
    mount([
      state({
        modelId: "glm-flash",
        status: "model_missing",
        notInCatalog: true,
        message:
          'Z.ai refused the "glm-flash" model — HTTP 404. Z.ai does not serve this model id. Set VIBECODER_MODEL_GLM_FLASH to the id from Z.ai\'s console — no deploy needed.',
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const menu = within(screen.getByRole("listbox"));

    expect(menu.getByText("model id")).toBeTruthy();
    expect(menu.getByText(/VIBECODER_MODEL_GLM_FLASH/)).toBeTruthy();
  });

  it("still selects a model, and shows no state when nothing has been checked", () => {
    const onChange = mount([]);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(within(screen.getByRole("listbox")).queryByText("ready")).toBeNull();

    fireEvent.click(screen.getByText("Gemini Flash"));
    expect(onChange).toHaveBeenCalledWith("gemini-flash");
  });
});
