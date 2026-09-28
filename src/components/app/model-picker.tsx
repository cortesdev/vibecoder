"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MODELS, PROVIDER_META, type ModelDef } from "@/lib/models";
import type { ModelReadiness, ReadinessStatus } from "@/lib/readiness";
import { effectiveStatement, resolveEffectiveModel, rowKind } from "@/lib/model-selection";

// The picker never re-asks the provider after the server render, so its
// readiness would go stale — a model that was rate-limited at page load stays
// gray for the whole session. We poll the keys endpoint (which re-probes the
// free providers, bounded server-side) to keep the rows honest, and gray out a
// model that cannot answer right now with a countdown to its next re-check.
const REFRESH_MS = 60_000;

// Model dropdown. Every model is free — there are no credit plans — so a row is
// only ever about one thing: whether its provider has a key. Three states,
// never one blanket "disabled":
//   runnable            -> enabled.
//   not set up yet      -> cannot run, but carries the control that fixes it
//                          ("Add key") — never a dead end.
//   temporarily down    -> the real countdown plus "Try anyway", and the model
//                          the free chain would fall back to.
// The chip and the menu footer say which model will actually run, so the free
// chain never substitutes silently.

export function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  return ref;
}

/**
 * Live readiness for the picker. Starts from the server's snapshot, then keeps
 * itself honest: re-probes the providers through /api/app/keys (the same route
 * Settings' "Check keys again" uses) on an interval and on window focus, and
 * returns the seconds until the next expected probe so the picker can show a
 * real renewal countdown instead of a frozen verdict.
 */
export function useLiveReadiness(initial: ModelReadiness[]) {
  const [ready, setReady] = useState(initial);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_MS / 1000);
  const inFlight = useRef(false);

  async function refresh() {
    if (inFlight.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/app/keys?refresh=1");
      const data = (await res.json().catch(() => ({}))) as { readiness?: ModelReadiness[] };
      if (Array.isArray(data.readiness)) setReady(data.readiness);
    } catch {
      // Network hiccup — keep the last known state; next probe will retry.
    } finally {
      inFlight.current = false;
      // The countdown restarts once a probe lands, whether or not it changed
      // anything — the picker keeps re-asking until a verdict flips.
      setSecondsLeft(REFRESH_MS / 1000);
    }
  }

  // One-second tick counts the read-out down; the probe lives on its own cadence
  // (every REFRESH_MS, plus any time the window regains focus, plus once on
  // mount) so verdicts refresh while the UI stays moving.
  useEffect(() => {
    const tick = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1_000);
    const probe = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(probe);
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(initial);
    };
  }, []);

  return { readiness: ready, secondsLeft };
}

export function ModelBadge({ tier }: { tier: ModelDef["tier"] }) {
  if (tier === "free") return <span className="tier-badge tier-badge-free">Free</span>;
  return null;
}

/** Short state word for a picker row. null = nothing was checked yet. */
export function readinessLabel(status: ReadinessStatus | undefined): string | null {
  switch (status) {
    case "live":
      return "ready";
    case "no_key":
      return "needs key";
    case "rejected":
      return "key refused";
    case "model_missing":
      return "model id";
    case "rate_limited":
      return "limit reached";
    case "unreachable":
      return "unreachable";
    default:
      return null;
  }
}

/** Green only when the provider itself answered; amber for "not set up yet". */
export function readinessColor(status: ReadinessStatus | undefined): string {
  if (status === "live") return "var(--good)";
  if (status === "no_key") return "var(--ink-3)";
  return "var(--warn)";
}

/** The working control a "not set up yet" row carries. Falls back to a
 *  sensible action when the server did not attach one. */
export function setupAction(
  state: ModelReadiness | undefined,
): { label: string; href: string } | undefined {
  if (!state) return undefined;
  if (state.action) return state.action;
  switch (state.status) {
    case "no_key":
    case "rejected":
      return { label: "Add key", href: "/agent/settings#keys" };
    case "model_missing":
      return { label: "Open settings", href: "/agent/settings" };
    default:
      return undefined;
  }
}

function readinessOf(
  states: Record<string, ModelReadiness>,
  id: string,
): ModelReadiness | undefined {
  return states[id];
}

export default function ModelPicker({
  value,
  onChange,
  align = "left",
  readiness = [],
  secondsLeft = REFRESH_MS / 1000,
}: {
  value: string;
  onChange: (id: string) => void;
  align?: "left" | "right";
  readiness?: ModelReadiness[];
  /** Seconds until the next readiness probe; supplied by the caller's
   *  useLiveReadiness so the picker and the composer share one countdown. */
  secondsLeft?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  const live = readiness;
  const states = Object.fromEntries(live.map((r) => [r.modelId, r]));
  const free = MODELS.filter((m) => m.tier === "free");

  const currentState = readinessOf(states, current.id);
  const currentStatus = currentState?.status;
  const currentLabel =
    currentStatus === "rate_limited" || currentStatus === "unreachable"
      ? `retry in ${secondsLeft}s`
      : readinessLabel(currentStatus);
  const liveFree = free.filter((m) => states[m.id]?.status === "live");
  const readyCount = liveFree.length;

  const effective = resolveEffectiveModel(value, live);
  const statement = effectiveStatement(effective);
  const currentSetupAction = setupAction(currentState);
  const currentTemporary = rowKind(currentStatus) === "temporary";

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={[currentState?.message, statement].filter(Boolean).join(" — ")}
      >
        {currentState && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: readinessColor(currentState.status) }}
          />
        )}
        {current.label}
        {currentLabel && (
          <span className="text-[11px]" style={{ color: readinessColor(currentState?.status) }}>
            {currentLabel}
          </span>
        )}
        {effective.substituted && (
          <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
            · Will run: {effective.label}
          </span>
        )}
        {!effective.substituted && effective.reason === "unavailable" && effective.fallbackLabel && (
          <span className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
            · falls back to {effective.fallbackLabel}
          </span>
        )}
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`menu-pop bottom-full mb-2 ${align === "right" ? "right-0" : "left-0"}`}
          role="listbox"
          aria-label="Select model"
        >
          <p className="px-2 pb-1 pt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {free.length === 0
              ? "Free"
              : readyCount > 0
                ? `Free — ready now (${liveFree.map((m) => m.label).join(", ")})`
                : `Free — rechecking in ${secondsLeft}s`}
          </p>
          {free.map((m) => {
            const state = readinessOf(states, m.id);
            const kind = rowKind(state?.status);
            const label =
              kind === "temporary"
                ? `try anyway · retry in ${secondsLeft}s`
                : readinessLabel(state?.status);
            const action = kind === "setup" ? setupAction(state) : undefined;
            return (
              <div key={m.id} className="flex items-center gap-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === value}
                  className="menu-item flex-1"
                  title={state?.message}
                  disabled={kind !== "runnable"}
                  onClick={() => choose(m.id)}
                >
                  {state && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: readinessColor(state.status) }}
                    />
                  )}
                  <span
                    className="flex-1"
                    style={kind !== "runnable" ? { opacity: 0.45 } : undefined}
                  >
                    {m.label}
                  </span>
                  {label && (
                    <span className="text-[11px]" style={{ color: readinessColor(state?.status) }}>
                      {label}
                    </span>
                  )}
                  <ModelBadge tier={m.tier} />
                  {kind === "runnable" && m.id === value && (
                    <Check size={14} aria-hidden="true" style={{ color: "var(--good)" }} />
                  )}
                </button>
                {action && (
                  <a
                    href={action.href}
                    className="btn btn-secondary btn-sm shrink-0"
                    onClick={() => setOpen(false)}
                  >
                    {action.label}
                  </a>
                )}
                {kind === "temporary" && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm shrink-0"
                    onClick={() => choose(m.id)}
                  >
                    Try anyway
                  </button>
                )}
              </div>
            );
          })}

          <p className="px-2 pb-2 pt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
            {PROVIDER_META[current.provider].label} · {current.note}
          </p>
          {currentState && (
            <p
              className="px-2 pb-2 text-[11.5px] leading-relaxed"
              style={{ color: readinessColor(currentState.status) }}
              data-readiness={currentState.status}
            >
              {currentState.message}
            </p>
          )}
          {currentSetupAction && (
            <p className="px-2 pb-2">
              <a
                href={currentSetupAction.href}
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen(false)}
              >
                {currentSetupAction.label}
              </a>
            </p>
          )}
          {currentTemporary && (
            <p className="flex items-center gap-2 px-2 pb-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose(current.id)}>
                Try anyway
              </button>
              {effective.fallbackLabel && (
                <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  Will run: {effective.fallbackLabel} if it fails
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
