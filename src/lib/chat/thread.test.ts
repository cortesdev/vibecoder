import { describe, expect, it } from "vitest";
import { forgetThread, recallThread, rememberThread, threadTarget, THREAD_KEY } from "./thread";

// A conversation must accumulate in ONE thread. The old home page created a
// new project per message and then navigated away, so it could never chat.

function storage(seed?: string) {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(THREAD_KEY, seed);
  return {
    setItem: (k: string, v: string) => void map.set(k, v),
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("threadTarget", () => {
  it("opens a thread only when there is none", () => {
    expect(threadTarget(null)).toEqual({ projectId: null, creates: true });
  });

  it("reuses the existing thread instead of creating a second project", () => {
    expect(threadTarget("p1")).toEqual({ projectId: "p1", creates: false });
  });

  it("treats a blank stored id as no thread", () => {
    expect(threadTarget("   ")).toEqual({ projectId: null, creates: true });
  });

  it("only the first turn of a sequence creates a project", () => {
    let current: string | null = null;
    const creates: boolean[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const target = threadTarget(current);
      creates.push(target.creates);
      if (target.creates) current = "p1";
    }
    expect(creates).toEqual([true, false, false, false]);
  });
});

describe("thread persistence", () => {
  it("remembers and recalls the active thread", () => {
    const s = storage();
    rememberThread(s, "p1");
    expect(recallThread(s)).toBe("p1");
  });

  it("forgetting clears it so the next message starts fresh", () => {
    const s = storage("p1");
    forgetThread(s);
    expect(recallThread(s)).toBeNull();
    expect(threadTarget(recallThread(s)).creates).toBe(true);
  });

  it("survives storage being unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(recallThread(broken)).toBeNull();
    expect(() => forgetThread(broken)).not.toThrow();
  });
});
