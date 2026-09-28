import { describe, expect, it, vi } from "vitest";
import { measure } from "./instrument";

describe("measure", () => {
  it("reports duration, outcome, and code without touching payloads", async () => {
    const log = vi.fn();
    const result = await measure("agent.run", () => Promise.resolve("secret-bytes"), { log });
    expect(result).toBe("secret-bytes");
    expect(log).toHaveBeenCalledOnce();
    const evt = log.mock.calls[0][0] as Record<string, unknown>;
    expect(evt.event).toBe("agent.run");
    expect(typeof evt.ms).toBe("number");
    expect(evt.ok).toBe(true);
    expect(JSON.stringify(evt)).not.toContain("secret-bytes");
  });

  it("reports failures with a stable code", async () => {
    const log = vi.fn();
    const err = Object.assign(new Error("nope"), { code: "E_LIMIT" });
    await expect(measure("export.zip", () => Promise.reject(err), { log })).rejects.toThrow("nope");
    const evt = log.mock.calls[0][0] as Record<string, unknown>;
    expect(evt.ok).toBe(false);
    expect(evt.code).toBe("E_LIMIT");
  });

  it("falls back to unknown codes and never throws from logging", async () => {
    const log = vi.fn(() => {
      throw new Error("logger down");
    });
    await expect(measure("x", () => Promise.reject(new Error("y")), { log })).rejects.toThrow("y");
  });
});
