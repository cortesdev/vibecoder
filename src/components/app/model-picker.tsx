"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MODELS, PROVIDER_META, type ModelDef } from "@/lib/models";
import type { ModelReadiness, ReadinessStatus } from "@/lib/readiness";

// Model dropdown modeled on the OpenCode picker: Free badges on free models,
// credit cost on hosted ones, provider footer.
//
// Free models also carry their readiness: whether that model can actually
// answer right now, checked against the provider itself. A "Free" badge on its
// own promises something the app may not be able to deliver, so the state and
// the provider's own words are shown before a prompt is ever typed.

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

export function ModelBadge({ tier, cost }: { tier: ModelDef["tier"]; cost: number }) {
  if (tier === "free") return <span className="tier-badge tier-badge-free">Free</span>;
  return <span className="tier-badge tier-badge-credits">{cost} cr</span>;
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

function readinessOf(
  states: Record<string, ModelReadiness>,
  id: string,
): ModelReadiness | undefined {
  return states[id];
}

export default function ModelPicker({
  value,
  onChange,
  balance,
  align = "left",
  readiness = [],
}: {
  value: string;
  onChange: (id: string) => void;
  balance: number;
  align?: "left" | "right";
  readiness?: ModelReadiness[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  const states = Object.fromEntries(readiness.map((r) => [r.modelId, r]));
  const free = MODELS.filter((m) => m.tier === "free");
  const paid = MODELS.filter((m) => m.tier === "credits");

  const currentState = readinessOf(states, current.id);
  const currentLabel = readinessLabel(currentState?.status);
  const liveFree = free.filter((m) => states[m.id]?.status === "live");
  const readyCount = liveFree.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={currentState?.message}
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
                : "Free — needs a provider key"}
          </p>
          {free.map((m) => {
            const state = readinessOf(states, m.id);
            const label = readinessLabel(state?.status);
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={m.id === value}
                className="menu-item"
                title={state?.message}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {state && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: readinessColor(state.status) }}
                  />
                )}
                <span className="flex-1">{m.label}</span>
                {label && (
                  <span className="text-[11px]" style={{ color: readinessColor(state?.status) }}>
                    {label}
                  </span>
                )}
                <ModelBadge tier={m.tier} cost={m.cost} />
                {m.id === value && <Check size={14} aria-hidden="true" style={{ color: "var(--good)" }} />}
              </button>
            );
          })}

          <p className="px-2 pb-1 pt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
            Hosted — billed from credits ({balance} left)
          </p>
          {paid.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === value}
              className="menu-item"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span className="flex-1">{m.label}</span>
              <ModelBadge tier={m.tier} cost={m.cost} />
              {balance < m.cost && (
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  low
                </span>
              )}
              {m.id === value && <Check size={14} aria-hidden="true" style={{ color: "var(--good)" }} />}
            </button>
          ))}

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
        </div>
      )}
    </div>
  );
}
