"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import SiteNav from "@/components/site-nav";
import GlobeBackground from "@/components/globe-background";
import DownloadButtons from "@/components/download-buttons";
import UpgradeCard from "@/components/upgrade-card";
import VideoIntro from "@/components/video-intro";
import { testEnabled } from "@/lib/env";
import { siteConfig } from "@/lib/site";
import type { Metadata } from "next";

const TerminalChat = dynamic(() => import("@/components/app/terminal-chat"), {
  ssr: false,
});

const pillars = [
  {
    title: "Free and open source",
    body: "The whole agent, MIT licensed. No subscription, no credits to buy, no ads. Your keys, your models, your code.",
  },
  {
    title: "Bring your own keys",
    body: "Works with Claude, GPT, Gemini, local models via Ollama — any provider you configure. Switch models mid-session.",
  },
  {
    title: "Every change, reviewable",
    body: "The agent shows its plan and its diffs. Approve, tweak, or /undo in one keystroke. Nothing lands behind your back.",
  },
  {
    title: "Your machine, your files",
    body: "Runs natively on macOS, Windows, and Linux. It works on the repos already on your disk — no uploading your code anywhere.",
  },
];

const faqs = [
  {
    q: "Is Vibecoder really free?",
    a: "Yes — MIT licensed and free forever. You pay your chosen model provider directly for what you use, and that's the only cost. We charge nothing, show no ads, and collect nothing.",
  },
  {
    q: "Which models does it support?",
    a: "Any provider you can configure: Anthropic, OpenAI, Google, plus local models through Ollama and LM Studio. Set your API key once, switch models any time in the session.",
  },
  {
    q: "What can it do in my project?",
    a: "Read and edit files, run commands and tests, search the codebase, plan features before building them, and undo everything with /undo. It works inside the folder you open — plain, inspectable file changes.",
  },
  {
    q: "How is this different from the terminal version?",
    a: "It's the same agent with a native window: multiple workspaces side by side, real tabs and panels, drag-and-drop images into prompts, and system notifications when long runs finish. Your sessions and config are shared with the CLI.",
  },
  {
    q: "Is my code sent to a server?",
    a: "Only to the model provider you configure — the same code you'd send when using their API yourself. Vibecoder runs locally and adds no layer in between. No telemetry, no accounts.",
  },
  {
    q: "Does it work on Windows?",
    a: "Yes, natively. WSL is supported for Linux-flavored toolchains, but plain Windows works out of the box.",
  },
];

// JSON-LD structured data: SoftwareApplication at $0 plus the FAQ, rendered
// from the same source arrays the page displays (they can never diverge).
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Vibecoder",
      url: siteConfig.url,
      logo: `${siteConfig.url}/vibe-logo.png`,
      sameAs: ["https://github.com"],
    },
    {
      "@type": "WebSite",
      name: "Vibecoder",
      url: siteConfig.url,
      description:
        "Free, open source AI coding agent for desktop and terminal. Bring your own API keys, review every diff, /undo anytime.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Vibecoder",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux",
      url: siteConfig.url,
      description:
        "Free, open source AI coding agent for desktop and terminal. Bring your own API keys, review every diff, /undo anytime.",
      softwareVersion: "1.0.0",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      license: "https://opensource.org/licenses/MIT",
      author: { "@type": "Organization", name: "Vibecoder" },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function HomeClient() {
  const [introDone, setIntroDone] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleIntroDone = () => {
      setIntroDone(true);
    };
    window.addEventListener('vibecoder:intro-done', handleIntroDone);
    return () => window.removeEventListener('vibecoder:intro-done', handleIntroDone);
  }, []);

  return (
    <>
      <VideoIntro />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main id="main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden text-center">
          {/* Three.js globe — behind the copy, 40% transparent (dots at 0.6),
              fading from visible up top to 0% going down. */}
          <GlobeBackground className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[170vmin] w-[170vmin] max-w-none -translate-x-1/2 -translate-y-1/2 [mask-image:linear-gradient(to_bottom,black_0%,black_35%,transparent_85%)]" />
          <div className="relative z-10 mx-auto max-w-[1100px] px-6 pb-20 pt-20 text-center">
            <p className="hero-rise eyebrow" style={{ "--i": 0 } as React.CSSProperties}>
              Free · open source · MIT
            </p>
            <h1
              className="display hero-rise mx-auto mt-4 max-w-[840px]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              The AI coding agent that lives on your desktop.
            </h1>
            <p
              className="hero-rise muted mx-auto mt-5 max-w-[620px] text-[19px]"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Vibecoder reads your code, plans the change, and edits your project
              while you watch every diff. No subscription. No credits. Your API
              keys, your machine, your code.
            </p>
            <div className="hero-rise mt-8" style={{ "--i": 3 } as React.CSSProperties}>
              <DownloadButtons variant="hero" />
            </div>
          </div>
        </section>

        {/* Terminal window */}
        <section className="mx-auto max-w-[880px] px-6 pb-24">
          <div
            ref={terminalRef}
            className={`transition-transform duration-1000 ease-out ${
              introDone ? 'translate-y-[-70px]' : 'translate-y-0'
            }`}
          >
            <TerminalChat />
            <p className="muted-3 mt-4 text-center text-[13px]">
              One session, one repo: plan → build → review → undo.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="hairline-t px-6 py-24" aria-labelledby="pillars-h">
          <div className="mx-auto max-w-[1000px]">
            <h2 id="pillars-h" className="h2 text-center">
              Built like the agents you pay for. Priced like the tools you own.
            </h2>
            <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
              {pillars.map((p) => (
                <div key={p.title}>
                  <h3 className="text-[19px] font-semibold">{p.title}</h3>
                  <p className="muted mt-2">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick start */}
        <section className="px-6 py-24" style={{ background: "var(--bg-raised)" }} aria-labelledby="quickstart-h">
          <div className="mx-auto max-w-[720px]">
            <h2 id="quickstart-h" className="h2 text-center">
              Three commands to first diff.
            </h2>
            <div className="card mono mt-10 space-y-4 p-6 text-[13.5px] leading-relaxed">
              <p>
                <span style={{ color: "var(--ink-3)" }}># 1. Install the CLI (or grab the desktop app below)</span>
                <br />
                <span style={{ color: "var(--accent)" }}>$</span> curl -fsSL https://vibecoder.io/install | bash
              </p>
              <p>
                <span style={{ color: "var(--ink-3)" }}># 2. Point it at any project</span>
                <br />
                <span style={{ color: "var(--accent)" }}>$</span> cd your-project && vibecoder
              </p>
              <p>
                <span style={{ color: "var(--ink-3)" }}># 3. Add your model key once, then just talk</span>
                <br />
                <span style={{ color: "var(--green, var(--good))" }}></span> refactor auth to use sessions — plan first
              </p>
            </div>
          </div>
        </section>

        {/* Download — everything on one page */}
        <section id="download" className="hairline-t px-6 py-24" aria-labelledby="dl-h">
          <div className="mx-auto max-w-[900px]">
            <div className="text-center">
              <h2 id="dl-h" className="h2">
                Download Vibecoder.
              </h2>
              <p className="muted mx-auto mt-3 max-w-[520px]">
                Native desktop app for macOS, Windows, and Linux. Free, open
                source, and it stays on your machine.
              </p>
            </div>
            <div className="mt-10">
              <DownloadButtons variant="list" />
            </div>
            <p className="muted-3 mt-4 text-center text-[13px]">
              Prefer the terminal? The CLI is a free download too:{" "}
              <code
                className="mono rounded px-1.5 py-0.5"
                style={{ background: "var(--bg-inset)" }}
              >
                curl -fsSL https://vibecoder.io/install | bash
              </code>{" "}
              or{" "}
              <code
                className="mono rounded px-1.5 py-0.5"
                style={{ background: "var(--bg-inset)" }}
              >
                npm install -g vibecoder-ai
              </code>
            </p>
          </div>
        </section>

        {/* Upgrade (Stripe) */}
        <section className="hairline-t px-6 py-24" aria-labelledby="upgrade-section-h">
          <div className="mx-auto max-w-[560px]">
            <div className="text-center">
            <p className="eyebrow">Optional</p>
            <h2 id="upgrade-section-h" className="h2 mt-2">
              Support the project.
            </h2>
            <p className="muted mx-auto mt-3 max-w-[440px]">
              Vibecoder is a free AI coding agent — free forever, no
              credits, no subscription. If you want to fund development and
              get a few conveniences, Pro is a one-time payment — not a
              subscription.
            </p>
            </div>
            <div className="mt-10">
              <UpgradeCard demoAvailable={testEnabled} />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="hairline-t px-6 py-24" aria-labelledby="faq-h">
          <div className="mx-auto max-w-[720px]">
            <h2 id="faq-h" className="h2 text-center">
              Questions, answered plainly.
            </h2>
            <div className="mt-10">
              {faqs.map((f) => (
                <details key={f.q} className="border-b" style={{ borderColor: "var(--hairline)" }}>
                  <summary className="cursor-pointer list-none py-5 text-[17px] font-medium">
                    {f.q}
                  </summary>
                  <p className="muted max-w-[62ch] pb-5">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="hairline-t px-6 py-10">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-6">
          <p className="muted-3 text-[13px]">
            vibecoder — free as in yours. MIT licensed. We don&rsquo;t want your
            data.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-5 text-[13px]">
            <a href="https://github.com" className="muted hover:opacity-70">
              GitHub
            </a>
            <a href="#download" className="muted hover:opacity-70">
              Download
            </a>
            <a href="#faq" className="muted hover:opacity-70">
              FAQ
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}