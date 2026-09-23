export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vibecoder.io";

export const siteConfig = {
  url: siteUrl,
  name: "Vibecoder",
  title: {
    default: "Vibecoder — Free AI Coding Agent for Mac, Windows & Linux",
    template: "%s — Vibecoder",
  },
  description:
    "Vibecoder is a free, open source AI coding agent for your desktop and terminal. No subscription, no credits — bring your own API keys. Review every diff, /undo anytime. Free download for macOS, Windows, and Linux.",
  keywords: [
    "free AI coding agent",
    "free AI code editor",
    "free Claude Code alternative",
    "free Cursor alternative",
    "free Copilot alternative",
    "open source coding agent",
    "AI coding agent desktop app",
    "AI terminal coding assistant",
    "bring your own API key coding agent",
    "free vibecoder download",
    "vibecoder free",
  ],
  og: {
    title: "Vibecoder — Free AI Coding Agent for Mac, Windows & Linux",
    description:
      "Free and open source AI coding agent. No subscription, no credits — your API keys, your machine, your code. Review every diff, /undo anytime.",
    image: "/opengraph-image",
  },
  twitter: {
    title: "Vibecoder — Free AI Coding Agent",
    description:
      "Free and open source AI coding agent for macOS, Windows, and Linux. No subscription. No credits. Your keys, your code.",
    image: "/opengraph-image",
  },
};