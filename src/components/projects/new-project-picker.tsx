"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TEMPLATES, resolveTemplate } from "@/lib/templates/catalog";

// Six accessible thumbnail cards. Selection lives in ?template=<id> so it
// survives navigation and reaches the home chat; unknown ids fall back to the
// landing template with a visible explanation instead of an empty project.
export default function NewProjectPicker({ initialTemplate }: { initialTemplate?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("template") ?? initialTemplate ?? "landing";
  const resolved = resolveTemplate(raw);
  const unknown = raw !== resolved.id;

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("template", id);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  return (
    <section aria-label="Choose a starting template" className="mx-auto w-full max-w-[720px]">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
        Start from a template
      </h2>
      {unknown && (
        <p role="status" className="mt-2 text-[13px]" style={{ color: "var(--warn)" }}>
          Unknown template “{raw}” — starting from {resolved.title} instead.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Templates">
        {TEMPLATES.map((t) => {
          const selected = t.id === resolved.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(t.id)}
              className="overflow-hidden rounded-xl text-left transition-shadow focus-visible:outline-2"
              style={{
                background: "var(--bg-raised)",
                boxShadow: selected
                  ? "0 0 0 2px var(--accent)"
                  : "inset 0 0 0 1px var(--hairline)",
              }}
            >
              <img src={t.thumbnailUrl} alt="" aria-hidden="true" className="h-20 w-full object-cover" />
              <span className="block px-3 pb-1 pt-2 text-[13.5px] font-semibold">{t.title}</span>
              <span className="muted block px-3 pb-3 text-[12px] leading-snug">{t.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The template id the composer should send, resolved with landing fallback. */
export function selectedTemplateId(search: URLSearchParams | null, fallback?: string): string {
  return resolveTemplate(search?.get("template") ?? fallback).id;
}
