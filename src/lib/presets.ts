// UI Presets: one-click visual themes for a project. A preset renders a full
// `src/index.css`, so applying it swaps the whole look instantly (and the
// static preview reflects it with no extra bundling surprises).

export interface UiPreset {
  slug: string;
  name: string;
  blurb: string;
  dark: boolean;
  swatches: [string, string, string]; // bg, accent, surface
  gradient?: [string, string];
  font: string;
  radius: number;
}

interface Theme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  hairline: string;
}

function render(t: Theme, font: string, radius: number, extra: string) {
  return `:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${font};
  background: ${t.bg};
  color: ${t.text};
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
main {
  max-width: 680px;
  margin: 0 auto;
  padding: 96px 24px;
}
.card {
  background: ${t.surface};
  border: 1px solid ${t.hairline};
  border-radius: ${radius}px;
  padding: 32px;
}
h1 {
  margin: 0 0 8px;
  font-size: 2.25rem;
  line-height: 1.15;
  letter-spacing: -0.02em;
  background: linear-gradient(120deg, ${t.accent}, ${t.accentSoft});
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
p { margin: 0 0 16px; color: ${t.muted}; }
.tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: ${t.accent};
  background: ${t.accentSoft};
  border-radius: 999px;
  padding: 4px 12px;
  margin-bottom: 16px;
}
button {
  font: inherit;
  border: 1px solid ${t.hairline};
  background: ${t.surface};
  color: ${t.text};
  border-radius: ${Math.max(6, radius - 2)}px;
  padding: 8px 16px;
  cursor: pointer;
}
a { color: ${t.accent}; }
${extra}
`;
}

export const PRESETS: UiPreset[] = [
  {
    slug: "midnight",
    name: "Midnight",
    blurb: "Dark slate with an indigo glow. Balanced and calm.",
    dark: true,
    swatches: ["#0b0e14", "#5b8cff", "#141821"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 14,
  },
  {
    slug: "aura",
    name: "Aurora",
    blurb: "Deep violet fading to teal — a gradient headline.",
    dark: true,
    gradient: ["#8b5cf6", "#2dd4bf"],
    swatches: ["#0a0a12", "#a78bfa", "#131322"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 18,
  },
  {
    slug: "terminal",
    name: "Terminal",
    blurb: "Phosphor green on black. For the bare-metal mood.",
    dark: true,
    swatches: ["#050805", "#33ff66", "#0d120d"],
    font: "ui-monospace, SFMono-Regular, Menlo, monospace",
    radius: 4,
  },
  {
    slug: "ocean",
    name: "Ocean",
    blurb: "Cool navy with electric cyan highlights.",
    dark: true,
    swatches: ["#04141f", "#22d3ee", "#082633"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 12,
  },
  {
    slug: "paper",
    name: "Paper",
    blurb: "Warm light background, ink text, soft shadows.",
    dark: false,
    swatches: ["#faf8f4", "#e8a33d", "#ffffff"],
    font: "Georgia, 'Times New Roman', serif",
    radius: 12,
  },
  {
    slug: "coral",
    name: "Coral",
    blurb: "Bright light theme with a vivid coral accent.",
    dark: false,
    swatches: ["#fff7f4", "#ff5c39", "#ffffff"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 16,
  },
  {
    slug: "sage",
    name: "Sage",
    blurb: "Soft green light theme, minimal and clean.",
    dark: false,
    swatches: ["#f4f7f1", "#5a9e6f", "#ffffff"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 10,
  },
  {
    slug: "lavender",
    name: "Lavender",
    blurb: "Misty purple light theme, gentle and friendly.",
    dark: false,
    swatches: ["#f7f5ff", "#8b5cf6", "#ffffff"],
    font: "system-ui, -apple-system, sans-serif",
    radius: 14,
  },
];

const DARK: Record<string, { text: string; muted: string; hairline: string }> = {
  midnight: { text: "#e8ecf4", muted: "#98a2b6", hairline: "#20252f" },
  aura: { text: "#e6e6f2", muted: "#9b9bb0", hairline: "#23233a" },
  terminal: { text: "#d8ffe0", muted: "#7fa389", hairline: "#1c2a1f" },
  ocean: { text: "#d4f4fb", muted: "#8fb6c4", hairline: "#123a4d" },
};
const LIGHT: Record<string, { text: string; muted: string; hairline: string }> = {
  paper: { text: "#26221c", muted: "#6e675b", hairline: "#e8e1d5" },
  coral: { text: "#3a241e", muted: "#8a6a60", hairline: "#ffe4db" },
  sage: { text: "#24302a", muted: "#6d7a71", hairline: "#e2ebe1" },
  lavender: { text: "#2e2a4a", muted: "#7b749a", hairline: "#e6e0f7" },
};

/** Full `src/index.css` for a preset slug. Throws on unknown slug. */
export function presetCss(p: UiPreset): string {
  const tone = p.dark ? DARK[p.slug] : LIGHT[p.slug];
  if (!tone) throw new Error(`preset ${p.slug} has no tone`);
  const surface = p.swatches[2];
  const extra = p.gradient
    ? `h1 {\n  background: linear-gradient(120deg, ${p.gradient[0]}, ${p.gradient[1]});\n  -webkit-background-clip: text;\n  background-clip: text;\n  -webkit-text-fill-color: transparent;\n}`
    : "";
  return render(
    {
      bg: p.swatches[0],
      surface,
      text: tone.text,
      muted: tone.muted,
      accent: p.swatches[1],
      accentSoft: p.dark ? "rgba(255,255,255,0.08)" : `color-mix(in srgb, ${p.swatches[1]} 14%, transparent)`,
      hairline: tone.hairline,
    },
    p.font,
    p.radius,
    extra,
  );
}

export function getPreset(slug: string | undefined): UiPreset {
  return PRESETS.find((p) => p.slug === slug) ?? PRESETS[0];
}