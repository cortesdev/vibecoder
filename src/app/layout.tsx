import type { Metadata } from "next";
import "./globals.css";

// "Free" is the headline keyword: the site, the app, and the agent are free.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vibecoder.io";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  applicationName: "Vibecoder",
  authors: [{ name: "Vibecoder" }],
  creator: "Vibecoder",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Vibecoder",
    title: "Vibecoder — Free AI Coding Agent for Mac, Windows & Linux",
    description:
      "Free and open source AI coding agent. No subscription, no credits — your API keys, your machine, your code. Review every diff, /undo anytime.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Vibecoder — free, open source AI coding agent",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibecoder — Free AI Coding Agent",
    description:
      "Free and open source AI coding agent for macOS, Windows, and Linux. No subscription. No credits. Your keys, your code.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "developer tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
