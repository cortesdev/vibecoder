// Thread target resolution for the chat-first home. Pure, so the regression
// that matters — one message must not create a second project — is testable
// without a DOM.
//
// The rule: a conversation reuses its thread. Only the very first message of
// a thread opens one. This is the bug that made the old home page create a new
// project per message and navigate away, so it can never accumulate like a
// chat.

export interface ThreadTarget {
  /** The project id the next turn must post to, or null to create one. */
  projectId: string | null;
  /** True when this turn is the one that opens the thread. */
  creates: boolean;
}

export function threadTarget(current: string | null | undefined): ThreadTarget {
  const id = typeof current === "string" ? current.trim() : "";
  return id ? { projectId: id, creates: false } : { projectId: null, creates: true };
}

/** Persist the active thread so a reload or a new tab continues the same
 *  conversation instead of silently starting a third project. */
export function rememberThread(storage: Pick<Storage, "setItem">, projectId: string): void {
  if (projectId) storage.setItem(THREAD_KEY, projectId);
}

export function recallThread(storage: Pick<Storage, "getItem">): string | null {
  try {
    const value = storage.getItem(THREAD_KEY);
    return value && value.trim() ? value : null;
  } catch {
    // Private mode or a blocked origin: start a new thread rather than crash.
    return null;
  }
}

export function forgetThread(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(THREAD_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export const THREAD_KEY = "vibecoder:thread";
