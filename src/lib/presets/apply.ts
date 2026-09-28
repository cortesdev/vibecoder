import { presetTheme, PRESETS } from "@/lib/presets";
import { THEME_END, THEME_START } from "@/lib/templates/shared";

// Theme application: rewrite ONLY the delimited theme-variable section of
// src/index.css, retaining every other byte. Returns both sides so the caller
// can persist the previous bytes for exact undo.

export function applyPresetCss(css: string, presetId: string): { nextCss: string; previousCss: string } {
  const preset = PRESETS.find((p) => p.slug === presetId);
  if (!preset) throw new Error(`unknown preset: ${presetId}`);
  const start = css.indexOf(THEME_START);
  const end = css.indexOf(THEME_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "src/index.css has no theme section (missing vibecoder:theme delimiters) — cannot apply a preset without overwriting custom CSS.",
    );
  }
  const nextCss = css.slice(0, start) + presetTheme(preset) + css.slice(end + THEME_END.length);
  return { nextCss, previousCss: css };
}
