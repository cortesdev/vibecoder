import { freeModels, PROVIDER_META, type ModelDef, type ProviderId } from "./models";
import { resolveProviderAccess, type ProviderAccess } from "./engine";
import { providerErrorText, refusalMessage } from "./agent/llm";

/**
 * Readiness: is a free model actually able to answer right now?
 *
 * The last unverified link in the free path is the upstream model id and the
 * key itself — a wrong id looks to a user exactly like a bad key, and both
 * fail silently until they type a prompt. So for every free model we ask the
 * provider two questions and report exactly what it said:
 *
 *   1. GET  {baseUrl}/models          — does the key work? does its catalog
 *                                       contain the id we are configured with?
 *   2. POST {baseUrl}/chat/completions — the ground truth: one minimal prompt.
 *
 * The catalog call is best-effort: Z.ai documents no model-list endpoint, and a
 * 404/405 there means "no catalog", never "bad key". The completion decides.
 *
 * Everything provider-specific (base URL, model string, which key, the wording
 * of a refusal) comes from the registry and the engine's resolution — there is
 * no second key list and no second error vocabulary here.
 */

export type ReadinessStatus =
  | "live" // the provider answered on the configured model
  | "no_key" // nothing to try: no user key and no platform key
  | "rejected" // the provider refused the key (401/403, unfunded, or a bad request)
  | "model_missing" // key accepted (or listed anyway), but that model id is not served
  | "rate_limited" // key works, quota/rate limit spent right now
  | "unreachable"; // the network or the provider's host failed

export interface ModelReadiness {
  /** Registry id, e.g. "glm-flash" — the key the picker looks models up by. */
  modelId: string;
  label: string;
  provider: ProviderId;
  providerLabel: string;
  /** Upstream model string that was actually asked for. */
  model: string;
  source: "user" | "platform" | "none";
  status: ReadinessStatus;
  /** The provider's own words where it refused, plus the one action that fixes it. */
  message: string;
  /** The model id that answered, when one did (what "live" is proof of). */
  answeredModel?: string;
  /** How many models the provider's catalog listed, when it has one. */
  catalogSize?: number;
  /** Configured id absent from a catalog that did load — a likely rotation. */
  notInCatalog?: boolean;
  checkedAt: number;
}

/** A provider that hangs must not hold a page render: bounded, then reported. */
const PROBE_TIMEOUT_MS = 5_000;
/** How long a verdict is reused. Short enough to notice a fix, long enough
 *  that a page render does not re-ask the provider on every click. */
const CACHE_MS = 60_000;

const cache = new Map<string, { at: number; models: ModelReadiness[] }>();

function base(access: ProviderAccess): string {
  return access.baseUrl.replace(/\/$/, "");
}

async function probe(url: string, access: ProviderAccess, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${access.apiKey}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}

/** The provider's catalog, when it publishes one. */
async function listModels(
  access: ProviderAccess,
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; detail: string } | { ok: false; unsupported: true }> {
  let res: Response;
  try {
    res = await probe(`${base(access)}/models`, access);
  } catch {
    return { ok: false, unsupported: true }; // treat a dead catalog call as "none"
  }
  if (res.status === 404 || res.status === 405) return { ok: false, unsupported: true };
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, detail: providerErrorText(text) };

  try {
    const parsed = JSON.parse(text) as { data?: { id?: unknown }[]; models?: { id?: unknown }[] } | unknown[];
    const rows = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.models ?? [];
    const ids = rows
      .map((r) => (r as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");
    return { ok: true, ids };
  } catch {
    return { ok: false, unsupported: true };
  }
}

/** Check one model: catalog (best effort) then one minimal completion. */
export async function checkModelReadiness(userId: string, model: ModelDef): Promise<ModelReadiness> {
  const resolved = await resolveProviderAccess(userId, model);
  const shell = {
    modelId: model.id,
    label: model.label,
    provider: model.provider,
    checkedAt: Date.now(),
  };

  if (resolved.kind !== "access") {
    return {
      ...shell,
      providerLabel: PROVIDER_META[model.provider].label,
      model: model.model,
      source: "none",
      status: "no_key",
      message:
        resolved.kind === "missing_key"
          ? resolved.problem
          : `${model.label} is not configured on this deployment.`,
    };
  }

  const access = resolved.access;
  const providerLabel = access.providerLabel ?? PROVIDER_META[model.provider].label;
  const common = {
    ...shell,
    providerLabel,
    model: access.model,
    source: access.source,
  };

  // 1. Best-effort catalog: proves the key works and whether our id is offered.
  const listed = await listModels(access);
  if (!("unsupported" in listed) && !listed.ok) {
    return {
      ...common,
      status: listed.status === 429 ? "rate_limited" : listed.status >= 500 ? "unreachable" : "rejected",
      message: refusalMessage(listed.status, listed.detail, access),
    };
  }
  const catalogSize = !("unsupported" in listed) && listed.ok ? listed.ids.length : undefined;
  const notInCatalog =
    !("unsupported" in listed) && listed.ok ? !listed.ids.includes(access.model) : undefined;

  // 2. Ground truth: the smallest possible completion on the configured model.
  let res: Response;
  try {
    res = await probe(`${base(access)}/chat/completions`, access, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: access.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
  } catch (err) {
    return {
      ...common,
      status: "unreachable",
      message: `${providerLabel} could not be reached at ${base(access)} (${
        err instanceof Error ? err.message : "request failed"
      }). Check the deployment's network access to the provider.`,
    };
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const detail = providerErrorText(text);
    // A model that is not served shows up as 404 from an OpenAI-compatible
    // surface, or as a configured id that is simply absent from the catalog.
    const status: ReadinessStatus =
      res.status === 429 ? "rate_limited" : res.status >= 500 ? "unreachable" : res.status === 404 || notInCatalog ? "model_missing" : "rejected";
    return {
      ...common,
      status,
      message: refusalMessage(res.status, detail, access),
      ...(catalogSize === undefined ? {} : { catalogSize }),
      ...(notInCatalog === undefined ? {} : { notInCatalog }),
    };
  }

  let answeredModel: string | undefined;
  try {
    const data = JSON.parse(text) as { model?: unknown };
    if (typeof data.model === "string") answeredModel = data.model;
  } catch {
    // A 200 we cannot parse still means the provider accepted the request.
  }

  const answered = answeredModel ?? access.model;
  const via = access.source === "user" ? "your key" : "the platform key";
  return {
    ...common,
    status: "live",
    answeredModel: answered,
    message: `${providerLabel} accepted ${via} — ${model.label} answered on "${answered}"${
      catalogSize === undefined ? "" : ` (${catalogSize} models listed)`
    }.${notInCatalog ? ` Note: "${access.model}" is not in ${providerLabel}'s model list.` : ""}`,
    ...(catalogSize === undefined ? {} : { catalogSize }),
    ...(notInCatalog === undefined ? {} : { notInCatalog }),
  };
}

/**
 * Readiness for every free model, cached briefly. Free models come first in
 * registry order, so the picker can say what will actually answer before the
 * user types anything. A missing key costs no network at all.
 */
export async function checkFreeReadiness(
  userId: string,
  opts: { refresh?: boolean } = {},
): Promise<ModelReadiness[]> {
  const cached = cache.get(userId);
  if (!opts.refresh && cached && Date.now() - cached.at < CACHE_MS) return cached.models;

  const models = await Promise.all(freeModels().map((model) => checkModelReadiness(userId, model)));
  cache.set(userId, { at: Date.now(), models });
  return models;
}

/** Drop a user's cached verdicts (after saving or removing a key). */
export function invalidateReadiness(userId: string): void {
  cache.delete(userId);
}

/** Lookup by registry id, for the picker and the builder. */
export function indexReadiness(models: ModelReadiness[]): Record<string, ModelReadiness> {
  return Object.fromEntries(models.map((m) => [m.modelId, m]));
}
