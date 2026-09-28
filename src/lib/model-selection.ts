// One honest answer to "what will actually run next?".
//
// The picker used to gray out every model whose readiness was not "live",
// which turned a key-less account into a dead list with no way out, and it
// never told the user that the free chain substitutes a model behind their
// back. This module is the single place that decides, from the readiness
// snapshot, which model the next turn will really run and whether that differs
// from the one the user selected.
//
// There are no credit plans: nothing here consults a wallet. Every model is
// free and runs when a key for its provider is available.
//
// It is pure and framework-free so the chip, the send button, and the tests
// all agree on the same answer.

import { DEFAULT_MODEL_ID, getModel, freeModels } from "./models";
import type { ModelReadiness, ReadinessStatus } from "./readiness";

export type RowKind = "runnable" | "setup" | "temporary";

/**
 * Three states, not one blanket "disabled":
 *   runnable  — the provider answered, or we have not checked yet: pick it.
 *   setup     — it cannot run until a key is added. Never a dead end: it
 *               carries that action.
 *   temporary — rate limited or unreachable: recovers on its own, so the user
 *               may try anyway, with the real countdown and a statement of the
 *               model that will actually run as a fallback.
 */
export function rowKind(status: ReadinessStatus | undefined): RowKind {
  if (status === undefined || status === "live") return "runnable";
  if (status === "no_key" || status === "rejected" || status === "model_missing") return "setup";
  return "temporary"; // rate_limited | unreachable
}

export type EffectiveReason = "none" | "needs_setup" | "unavailable";

export interface EffectiveModel {
  /** Best-known model the next turn will run. */
  id: string;
  label: string;
  reason: EffectiveReason;
  /** True when this is not the model the user selected. */
  substituted: boolean;
  /** For a temporarily-unavailable selection: the model the free chain falls
   *  back to when the first attempt fails. */
  fallbackLabel?: string;
}

function inChainOrder(excludeId?: string) {
  return freeModels().filter((m) => m.id !== excludeId);
}

function firstRunnable(
  states: Record<string, ModelReadiness>,
  excludeId?: string,
): { id: string; label: string } | undefined {
  const live = inChainOrder(excludeId).find((m) => states[m.id]?.status === "live");
  return live ? { id: live.id, label: live.label } : undefined;
}

/**
 * Deterministic, best-known prediction of the serving model.
 *
 * The engine's rule this mirrors (src/lib/engine.ts): a free model is tried
 * first, then every other model in FREE_PREFERENCE order, skipping the ones
 * with no key.
 */
export function resolveEffectiveModel(
  selectedId: string,
  readiness: ModelReadiness[],
): EffectiveModel {
  const states = Object.fromEntries(readiness.map((r) => [r.modelId, r]));
  const selected = getModel(selectedId);

  if (selected) {
    const kind = rowKind(states[selected.id]?.status);
    if (kind === "runnable") {
      return { id: selected.id, label: selected.label, reason: "none", substituted: false };
    }
    if (kind === "setup") {
      // No key means the chain skips it deterministically; name the next one.
      const next = firstRunnable(states, selected.id);
      if (next) {
        return { id: next.id, label: next.label, reason: "needs_setup", substituted: true };
      }
      return { id: selected.id, label: selected.label, reason: "needs_setup", substituted: false };
    }
    // Temporary: the chain still tries the selected model first, so it stays
    // the "attempt" target — but say where it falls back to.
    const next =
      firstRunnable(states, selected.id) ??
      (() => {
        const candidate = inChainOrder(selected.id)[0];
        return candidate ? { id: candidate.id, label: candidate.label } : undefined;
      })();
    return {
      id: selected.id,
      label: selected.label,
      reason: "unavailable",
      substituted: false,
      ...(next ? { fallbackLabel: next.label } : {}),
    };
  }

  const fallback = getModel(DEFAULT_MODEL_ID)!;
  return { id: fallback.id, label: fallback.label, reason: "none", substituted: false };
}

/** The one-line "will actually run" statement, or null when nothing is hidden. */
export function effectiveStatement(effective: EffectiveModel): string | null {
  switch (effective.reason) {
    case "needs_setup":
      return effective.substituted
        ? `Will run: ${effective.label} (the selected model has no key yet)`
        : `Will run: ${effective.label} once a key is added`;
    case "unavailable":
      return effective.fallbackLabel
        ? `Will try ${effective.label}, then fall back to ${effective.fallbackLabel}`
        : `Will try ${effective.label} — no fallback is configured yet`;
    default:
      return null;
  }
}
