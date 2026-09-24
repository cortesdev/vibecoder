// Integrations catalog: services a user can connect from the Integrations
// tab. Stored credentials (server-side only) count as "keys" on each card.
// Kept intentionally small — a curated starter set of the most useful stubs.

export interface IntegrationService {
  slug: string;
  name: string;
  category: string;
  blurb: string;
  monogram: string;
  hue: number; // brand hue for the letter badge
}

export const INTEGRATION_CATEGORIES = [
  "All",
  "AI",
  "Auth",
  "Database",
  "Payments",
  "Email",
  "Storage",
  "Analytics",
  "Monitoring",
  "Realtime",
] as const;

export const INTEGRATIONS: IntegrationService[] = [
  { slug: "anthropic", name: "Anthropic", category: "AI", blurb: "Claude API for assistants and agents.", monogram: "A", hue: 30 },
  { slug: "openai", name: "OpenAI", category: "AI", blurb: "GPT models for chat, embedding, and code.", monogram: "O", hue: 150 },
  // Z.ai (GLM Flash) is commented out for now along with the free fallback chain.
  // { slug: "zai", name: "Z.ai", category: "AI", blurb: "Free GLM Flash endpoint for fast inference.", monogram: "Z", hue: 230 },
  { slug: "stripe", name: "Stripe", category: "Payments", blurb: "Payments, subscriptions, and billing.", monogram: "S", hue: 260 },
  { slug: "supabase", name: "Supabase", category: "Database", blurb: "Postgres with auth, realtime, and storage.", monogram: "S", hue: 145 },
  { slug: "neon", name: "Neon", category: "Database", blurb: "Serverless Postgres with branching.", monogram: "N", hue: 35 },
  { slug: "turso", name: "Turso", category: "Database", blurb: "Edge-hosted libSQL database.", monogram: "T", hue: 15 },
  { slug: "mongodb", name: "MongoDB", category: "Database", blurb: "Document database with Atlas cloud.", monogram: "M", hue: 140 },
  { slug: "resend", name: "Resend", category: "Email", blurb: "Transactional email API for developers.", monogram: "R", hue: 0 },
  { slug: "sendgrid", name: "SendGrid", category: "Email", blurb: "Email delivery and marketing automations.", monogram: "S", hue: 200 },
  { slug: "aws-s3", name: "S3", category: "Storage", blurb: "Object storage at global scale.", monogram: "S", hue: 270 },
  { slug: "uploadthing", name: "UploadThing", category: "Storage", blurb: "Type-safe file uploads for web apps.", monogram: "U", hue: 320 },
  { slug: "clerk", name: "Clerk", category: "Auth", blurb: "Authentication and user management.", monogram: "C", hue: 210 },
  { slug: "auth0", name: "Auth0", category: "Auth", blurb: "Identity platform with SSO and MFA.", monogram: "A", hue: 250 },
  { slug: "posthog", name: "PostHog", category: "Analytics", blurb: "Product analytics and event tracking.", monogram: "P", hue: 40 },
  { slug: "sentry", name: "Sentry", category: "Monitoring", blurb: "Error tracking and performance monitoring.", monogram: "S", hue: 160 },
  { slug: "ably", name: "Ably", category: "Realtime", blurb: "Realtime pub/sub and presence.", monogram: "A", hue: 200 },
  { slug: "pulse", name: "Pulse", category: "Realtime", blurb: "Instant sync for collaborative apps.", monogram: "P", hue: 190 },
];

export function getIntegration(slug: string): IntegrationService | undefined {
  return INTEGRATIONS.find((s) => s.slug === slug);
}