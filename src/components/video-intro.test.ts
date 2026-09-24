// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The intro mask gates the whole homepage, so its contract matters: it must be
// up on load with the promo autoplaying (landscape source on desktop), it must
// dismiss through the ~950ms lift animation (never unmounting instantly), and
// it must get out of the way when the video ends, the visitor skips, or 10
// seconds pass — whichever comes first.

import VideoIntro from "./video-intro";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function runOut() {
  // Drive the full exit: the panel lifts for ~950ms before unmounting.
  act(() => {
    vi.advanceTimersByTime(1500);
  });
}

function mountIntro() {
  vi.useFakeTimers();
  const utils = render(createElement(VideoIntro));
  expect(document.body.style.overflow).toBe("hidden");
  return utils;
}

describe("video intro mask", () => {
  it("plays the promo from the native video element, above the page on load", () => {
    render(createElement(VideoIntro));

    const dialog = screen.getByRole("dialog", { name: "Vibecoder intro video" });
    expect(dialog).toBeTruthy();

    const video = dialog.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("autoplay")).not.toBeNull();
    expect(video!.getAttribute("muted")).not.toBeNull();
    expect(video!.getAttribute("playsinline")).not.toBeNull();
    // Landscape on desktop; the portrait source exists for mobile.
    const sources = Array.from(video!.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.getAttribute("media"))).toEqual([
      "(min-width: 769px)",
      "(max-width: 768px)",
    ]);
  });

  it("stays up until the site visitor clicks anywhere on the mask", () => {
    mountIntro();

    fireEvent.click(screen.getByRole("dialog"));
    runOut();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the mask mounted through the exit animation, not just instantly", () => {
    mountIntro();

    fireEvent.click(screen.getByRole("dialog"));
    // Halfway through the ~950ms lift the mask must still be on screen.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    runOut();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("skips on Escape", () => {
    mountIntro();

    fireEvent.keyDown(window, { key: "Escape" });
    runOut();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reveals the site when the video ends", () => {
    mountIntro();
    const video = screen.getByRole("dialog").querySelector("video")!;

    act(() => {
      fireEvent.ended(video);
    });
    runOut();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses itself after 10 seconds even if the video never ends", () => {
    mountIntro();

    // No end event, no click — the hard cap fires on its own.
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    runOut();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores unrelated window messages", () => {
    mountIntro();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: "random-not-json" }));
      window.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify({ event: "infoDelivery" }) }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Still up: the 10s cap has not been reached, and nothing dismissed it.
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
