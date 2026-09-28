import { describe, expect, it } from "vitest";
import {
  BRIDGE_SOURCE,
  acceptBridgeEvent,
  bridgeListenerSnippet,
  type BridgeEvent,
} from "./bridge";

function evt(over: Partial<MessageEventInit & { data: unknown }> = {}): MessageEvent {
  return {
    origin: "null",
    source: "iframe-window",
    data: { source: BRIDGE_SOURCE, nonce: "n1", type: "runtime-error", message: "boom" },
    ...over,
  } as unknown as MessageEvent;
}

describe("preview bridge", () => {
  it("accepts well-formed error events from the preview", () => {
    const got = acceptBridgeEvent(evt(), "n1", "iframe-window");
    expect(got).toEqual({ type: "runtime-error", message: "boom" } satisfies BridgeEvent);
  });

  it("accepts console-error events", () => {
    const got = acceptBridgeEvent(
      evt({ data: { source: BRIDGE_SOURCE, nonce: "n1", type: "console-error", message: "x is not defined" } }),
      "n1",
      "iframe-window",
    );
    expect(got?.type).toBe("console-error");
  });

  it("rejects wrong nonces, foreign sources, and malformed payloads", () => {
    expect(acceptBridgeEvent(evt(), "other", "iframe-window")).toBeNull();
    expect(acceptBridgeEvent(evt(), "n1", "somewhere-else")).toBeNull();
    expect(acceptBridgeEvent(evt({ data: null }), "n1", "iframe-window")).toBeNull();
    expect(acceptBridgeEvent(evt({ data: { source: BRIDGE_SOURCE } }), "n1", "iframe-window")).toBeNull();
    expect(
      acceptBridgeEvent(
        evt({ data: { source: BRIDGE_SOURCE, nonce: "n1", type: "run-arbitrary", message: "x" } }),
        "n1",
        "iframe-window",
      ),
    ).toBeNull();
    expect(acceptBridgeEvent(evt({ data: "run " + "x".repeat(9000) }), "n1", "iframe-window")).toBeNull();
  });

  it("emits a narrow in-preview snippet that only reports errors outward", () => {
    const snippet = bridgeListenerSnippet("n1");
    expect(snippet).toContain("n1");
    expect(snippet).toContain(BRIDGE_SOURCE);
    expect(snippet).not.toContain("eval");
    expect(snippet).not.toContain("Function(");
  });
});
