// UI Presets: one-click visual themes. Each preset is a set of CSS variable
// values (--bg, --surface, --ink, --accent, --radius, --font) — never a flat
// override. Applying rewrites only the delimited theme section of
// src/index.css (see presets/apply), so custom CSS outside it survives.

import { themeSection, type ThemeVars } from "./templates/shared";

export interface UiPreset {
  slug: string;
  name: string;
  blurb: string;
  dark: boolean;
  vars: ThemeVars;
  /** Small live thumbnail: background + accent swatch. */
  thumb: [string, string];
}

function preset(
  slug: string,
  name: string,
  blurb: string,
  dark: boolean,
  vars: ThemeVars,
): UiPreset {
  return { slug, name, blurb, dark, vars, thumb: [vars.bg, vars.accent] };
}

const SANS = "system-ui, -apple-system, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const PRESETS: UiPreset[] = [
  preset("midnight", "Midnight", "Dark slate with an indigo glow. Balanced and calm.", true, {
    bg: "#0b0e14", surface: "#141821", ink: "#e8ecf4", accent: "#5b8cff", radius: 14, font: SANS,
  }),
  preset("aura", "Aurora", "Deep violet with a teal accent.", true, {
    bg: "#0a0a12", surface: "#131322", ink: "#e6e6f2", accent: "#2dd4bf", radius: 18, font: SANS,
  }),
  preset("terminal", "Terminal", "Phosphor green on black. For the bare-metal mood.", true, {
    bg: "#050805", surface: "#0d120d", ink: "#d8ffe0", accent: "#33ff66", radius: 4, font: MONO,
  }),
  preset("ocean", "Ocean", "Cool navy with electric cyan highlights.", true, {
    bg: "#04141f", surface: "#082633", ink: "#d4f4fb", accent: "#22d3ee", radius: 12, font: SANS,
  }),
  preset("paper", "Paper", "Warm light background, ink text, soft shadows.", false, {
    bg: "#faf8f4", surface: "#ffffff", ink: "#26221c", accent: "#e8a33d", radius: 12, font: SERIF,
  }),
  preset("coral", "Coral", "Bright light theme with a vivid coral accent.", false, {
    bg: "#fff7f4", surface: "#ffffff", ink: "#3a241e", accent: "#ff5c39", radius: 16, font: SANS,
  }),
  preset("sage", "Sage", "Soft green light theme, minimal and clean.", false, {
    bg: "#f4f7f1", surface: "#ffffff", ink: "#24302a", accent: "#5a9e6f", radius: 10, font: SANS,
  }),
  preset("lavender", "Lavender", "Misty purple light theme, gentle and friendly.", false, {
    bg: "#f7f5ff", surface: "#ffffff", ink: "#2e2a4a", accent: "#8b5cf6", radius: 14, font: SANS,
  }),
];

/** The theme-variable section this preset contributes. */
export function presetTheme(p: UiPreset): string {
  return themeSection(p.vars);
}

export function getPreset(slug: string | undefined): UiPreset {
  return PRESETS.find((p) => p.slug === slug) ?? PRESETS[0];
}
