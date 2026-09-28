import { defineConfig } from "@playwright/test";

// Provider keys are scrubbed so the agent turn deterministically takes the
// no-key path; Turso is scrubbed so tests hit the local file database.
const scrubbed: Record<string, string> = {
  TURSO_DATABASE_URL: "",
  TURSO_DATABASE_TOKEN: "",
  TURSO_API_KEY: "",
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
  VIBECODER_GEMINI_API_KEY: "",
  GROQ_API_KEY: "",
  GROQ_KEY: "",
  VIBECODER_GROQ_API_KEY: "",
  OPENROUTER_KEY: "",
  OPENROUTER_API_KEY: "",
  VIBECODER_OPENROUTER_API_KEY: "",
  NVIDIA_API_KEY: "",
  NVIDIA_NIM_API_KEY: "",
  CEREBRAS_API_KEY: "",
  HF_TOKEN: "",
  HUGGINGFACE_API_KEY: "",
  ZAI_API_KEY: "",
  Z_AI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  VIBECODER_ANTHROPIC_API_KEY: "",
  VIBECODER_OPENAI_API_KEY: "",
};

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: "http://127.0.0.1:3105", trace: "retain-on-failure" },
  webServer: {
    command: "npx next dev --port 3105",
    url: "http://127.0.0.1:3105/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: scrubbed,
  },
});
