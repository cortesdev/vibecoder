// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The intro mask gates the whole homepage, so its contract matters: it must be
// up on load with the promo autoplaying in an iframe, and it must only let the
// site through when the video ends, or the visitor skips (click / Esc).

import VideoIntro, { VIDEO_INTRO_ID } from "./video-intro";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function finishIntro() {
  // Drive the exit: the panel lifts for EXIT_MS (~950ms) before unmounting.
  act(() => {
    vi.advanceTimersByTime(1500);
  });
}

describe("video intro mask", () => {
  it("plays the promo, autoplaying in an iframe, above the page on load", () => {
    render(createElement(VideoIntro));

    const dialog = screen.getByRole("dialog", { name: "Vibecoder intro video" });
    expect(dialog).toBeTruthy();

    const frame = screen.getByTitle("Vibecoder intro video");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("src")).toContain(`/embed/${VIDEO_INTRO_ID}`);
    expect(frame.getAttribute("src")).toContain("autoplay=1");
    expect(frame.getAttribute("src")).toContain("mute=1");
    expect(frame.getAttribute("src")).toContain("enablejsapi=1");
  });

  it("stays up until the site visitor clicks anywhere on the mask", () => {
    vi.useFakeTimers();
    render(createElement(VideoIntro));

    fireEvent.click(screen.getByRole("dialog"));
    finishIntro();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("skips on Escape", () => {
    vi.useFakeTimers();
    render(createElement(VideoIntro));

    fireEvent.keyDown(window, { key: "Escape" });
    finishIntro();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reveals the site when the embedded video ends", () => {
    vi.useFakeTimers();
    render(createElement(VideoIntro));

    // YouTube posts JSON messages; onStateChange info 0 == video ended.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify({ event: "onStateChange", info: 0 }) }),
      );
    });
    finishIntro();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores unrelated window messages", () => {
    vi.useFakeTimers();
    render(createElement(VideoIntro));

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: "random-not-json" }));
      window.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify({ event: "infoDelivery" }) }),
      );
    });
    finishIntro();

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("re-locks nothing after it unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = render(createElement(VideoIntro));

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});