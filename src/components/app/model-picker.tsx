"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MODELS, PROVIDER_META, type ModelDef } from "@/lib/models";

// Model dropdown modeled on the OpenCode picker: Free badges on free models,
// credit cost on hosted ones, provider footer.

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

export default function ModelPicker({
  value,
  onChange,
  balance,
  align = "left",
}: {
  value: string;
  onChange: (id: string) => void;
  balance: number;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  const free = MODELS.filter((m) => m.tier === "free");
  const paid = MODELS.filter((m) => m.tier === "credits");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {current.label}
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`menu-pop bottom-full mb-2 ${align === "right" ? "right-0" : "left-0"}`}
          role="listbox"
          aria-label="Select model"
        >
          <p className="px-2 pb-1 pt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            Free — bring your own key (Settings)
          </p>
          {free.map((m) => (
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
              {m.id === value && <Check size={14} aria-hidden="true" style={{ color: "var(--good)" }} />}
            </button>
          ))}

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
        </div>
      )}
    </div>
  );
}
