import { files as landing } from "./landing";
import { files as dashboard } from "./saas-dashboard";
import { files as portfolio } from "./portfolio";
import { files as blog } from "./blog";
import { files as shop } from "./ecommerce-lite";
import { files as chat } from "./chat-app";

export type TemplateId =
  | "landing"
  | "saas-dashboard"
  | "portfolio"
  | "blog"
  | "ecommerce-lite"
  | "chat-app";

export interface TemplateDef {
  id: TemplateId;
  title: string;
  description: string;
  thumbnailUrl: string;
  files: (name: string) => Record<string, string>;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "landing",
    title: "Landing page",
    description: "Waitlist hero with feature cards and a working dark/light switch.",
    thumbnailUrl: "/templates/landing.svg",
    files: landing,
  },
  {
    id: "saas-dashboard",
    title: "SaaS dashboard",
    description: "MRR overview with a filterable, editable customer table.",
    thumbnailUrl: "/templates/saas-dashboard.svg",
    files: dashboard,
  },
  {
    id: "portfolio",
    title: "Portfolio",
    description: "Project switcher with case-study cards and a contact link.",
    thumbnailUrl: "/templates/portfolio.svg",
    files: portfolio,
  },
  {
    id: "blog",
    title: "Blog",
    description: "Typed post list with search and full reading views.",
    thumbnailUrl: "/templates/blog.svg",
    files: blog,
  },
  {
    id: "ecommerce-lite",
    title: "Mini shop",
    description: "Product grid with a working cart, totals, and checkout.",
    thumbnailUrl: "/templates/ecommerce-lite.svg",
    files: shop,
  },
  {
    id: "chat-app",
    title: "Support chat",
    description: "Message thread with keyword replies and a live composer.",
    thumbnailUrl: "/templates/chat-app.svg",
    files: chat,
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

export const DEFAULT_TEMPLATE_ID: TemplateId = "landing";

/** A conversation that starts with no files. Unlike a real template, a chat
 *  that has not asked for code yet should not be handed a scaffold it never
 *  asked for — the agent creates files on the first turn that needs them. */
export const CHAT_TEMPLATE_ID = "empty";

export function isChatTemplate(id: unknown): boolean {
  return id === CHAT_TEMPLATE_ID;
}

/** Unknown or missing ids fall back to landing — never an empty project. */
export function resolveTemplate(id: unknown): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function filesFor(id: unknown, name: string): Record<string, string> {
  return resolveTemplate(id).files(name);
}
