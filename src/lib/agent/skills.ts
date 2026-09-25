export type SkillSource = "builtin" | "remote";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  version: string;
  tags: string[];
  source: SkillSource;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  source: SkillSource;
}

export interface SkillManifest {
  schemaVersion: 1;
  version: string;
  skills: SkillDefinition[];
}

export const DEFAULT_SKILLS: SkillDefinition[] = [
  {
    id: "context-engineering",
    name: "Context engineering",
    description: "Clarify requirements, constraints, existing structure, and success criteria before changing code.",
    instructions: "Extract the real goal, inspect the relevant project context, identify constraints, and keep the proposed work aligned with the existing architecture. Ask only for information that changes the implementation.",
    version: "1.0.0",
    tags: ["requirements", "planning", "architecture"],
    source: "builtin",
  },
  {
    id: "incremental-implementation",
    name: "Incremental implementation",
    description: "Deliver a focused change in small, verifiable slices without unnecessary dependencies.",
    instructions: "Prefer the smallest coherent change, preserve existing conventions, and define a verification step for each slice. Avoid speculative abstractions and unrelated cleanup.",
    version: "1.0.0",
    tags: ["implementation", "refactoring", "scope"],
    source: "builtin",
  },
  {
    id: "test-driven-development",
    name: "Test-driven development",
    description: "Use focused tests to prove behavior before and after a code change.",
    instructions: "For behavior changes, identify or add the smallest useful test, make the failure observable, implement the fix, and run the relevant verification before reporting success.",
    version: "1.0.0",
    tags: ["testing", "quality", "regression"],
    source: "builtin",
  },
  {
    id: "debugging-and-error-recovery",
    name: "Debugging and error recovery",
    description: "Find the root cause of failures and recover safely instead of guessing.",
    instructions: "Reproduce the issue, gather the relevant error and state, isolate the first failing boundary, test one hypothesis at a time, and verify the recovery path.",
    version: "1.0.0",
    tags: ["debugging", "errors", "reliability"],
    source: "builtin",
  },
  {
    id: "security-and-hardening",
    name: "Security and hardening",
    description: "Protect authentication, user input, secrets, storage, and external integrations.",
    instructions: "Treat untrusted input and secrets as dangerous, minimize data collection and exposure, enforce authorization at the server boundary, and verify failure behavior and abuse cases.",
    version: "1.0.0",
    tags: ["security", "auth", "privacy"],
    source: "builtin",
  },
];

const MAX_SKILLS = 100;
const MAX_SKILL_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 600;
const MAX_INSTRUCTIONS_LENGTH = 12_000;
const MAX_TAGS = 20;
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`Invalid skill ${field}`);
  }
  return value.trim();
}

function parseTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw new Error("Invalid skill tags");
  }
  const tags = value.map((tag) => {
    if (typeof tag !== "string" || tag.length > 40 || !TAG_PATTERN.test(tag)) {
      throw new Error("Invalid skill tag");
    }
    return tag;
  });
  return [...new Set(tags)];
}

function parseRemoteSkill(value: unknown): SkillDefinition {
  if (!isRecord(value)) throw new Error("Invalid skill entry");
  const id = requireString(value.id, "id", MAX_SKILL_ID_LENGTH);
  if (!SKILL_ID_PATTERN.test(id)) throw new Error("Invalid skill id");
  return {
    id,
    name: requireString(value.name, "name", MAX_NAME_LENGTH),
    description: requireString(value.description, "description", MAX_DESCRIPTION_LENGTH),
    instructions: requireString(value.instructions, "instructions", MAX_INSTRUCTIONS_LENGTH),
    version: requireString(value.version, "version", 40),
    tags: parseTags(value.tags),
    source: "remote",
  };
}

export function parseSkillManifest(value: unknown): SkillManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid skill manifest schema");
  }
  const version = requireString(value.version, "manifest version", 80);
  if (!Array.isArray(value.skills) || value.skills.length === 0 || value.skills.length > MAX_SKILLS) {
    throw new Error("Invalid skill manifest skills");
  }
  const skills = value.skills.map(parseRemoteSkill);
  const ids = new Set<string>();
  for (const skill of skills) {
    if (ids.has(skill.id)) throw new Error(`Duplicate skill id: ${skill.id}`);
    ids.add(skill.id);
  }
  return { schemaVersion: 1, version, skills };
}

export function mergeSkillCatalog(remoteSkills: SkillDefinition[] = []): SkillDefinition[] {
  const skills = new Map(DEFAULT_SKILLS.map((skill) => [skill.id, skill]));
  for (const skill of remoteSkills) skills.set(skill.id, skill);
  return [...skills.values()];
}

export function toSkillSummary(skill: SkillDefinition): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    tags: skill.tags,
    source: skill.source,
  };
}

export function normalizeSkillIds(skills: SkillDefinition[], ids: unknown): string[] {
  const known = new Set(skills.map((skill) => skill.id));
  const result: string[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== "string" || !known.has(id) || result.includes(id)) continue;
    result.push(id);
    if (result.length === 3) break;
  }
  return result;
}

function relevanceScore(skill: SkillDefinition, prompt: string): number {
  const text = `${prompt} ${skill.name} ${skill.description} ${skill.tags.join(" ")}`.toLowerCase();
  const signals: Record<string, string[]> = {
    "context-engineering": ["requirement", "scope", "context", "constraint", "architecture", "clarify"],
    "incremental-implementation": ["implement", "add", "refactor", "feature", "change", "slice"],
    "test-driven-development": ["test", "bug", "regression", "verify", "coverage", "fix"],
    "debugging-and-error-recovery": ["error", "debug", "fail", "crash", "broken", "recover", "exception"],
    "security-and-hardening": ["secure", "security", "auth", "permission", "secret", "input", "privacy"],
  };
  return (signals[skill.id] ?? []).reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0);
}

export function selectSkillIds(skills: SkillDefinition[], requested: unknown, prompt = ""): string[] {
  const pinned = normalizeSkillIds(skills, requested);
  if (pinned.length > 0) return pinned;
  const ranked = [...skills]
    .map((skill, index) => ({ skill, index, score: relevanceScore(skill, prompt) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .map(({ skill }) => skill.id);
  return ranked.length > 0 ? ranked : skills.slice(0, 3).map((skill) => skill.id);
}

export function formatSkillInstructions(skills: SkillDefinition[]): string {
  return skills
    .map((skill) => `## ${skill.name} [${skill.id}]\n${skill.instructions}`)
    .join("\n\n");
}
