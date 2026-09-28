// Minimal operation instrumentation: duration, outcome, stable error code.
// Never logs prompts, uploads, tokens, keys, or generated content — only the
// event name, elapsed ms, ok flag, and code.

export interface InstrumentEvent {
  event: string;
  ms: number;
  ok: boolean;
  code?: string;
}

type Logger = (event: InstrumentEvent) => void;

function defaultLog(event: InstrumentEvent): void {
  try {
    console.info(JSON.stringify({ v: "vibecoder-obs", ...event }));
  } catch {
    // Logging must never break the operation it observes.
  }
}

function codeOf(err: unknown): string {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "number") return String(code);
    if (typeof code === "string" && code) return code;
  }
  if (err instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(err.name) && err.name !== "Error") return err.name;
  return "unknown";
}

/** Time an async operation and emit one event. Rejects with the original error. */
export async function measure<T>(
  event: string,
  fn: () => Promise<T>,
  opts: { log?: Logger } = {},
): Promise<T> {
  const log = opts.log ?? defaultLog;
  const started = Date.now();
  try {
    const result = await fn();
    try {
      log({ event, ms: Date.now() - started, ok: true });
    } catch {
      // ignore logger failures
    }
    return result;
  } catch (err) {
    try {
      log({ event, ms: Date.now() - started, ok: false, code: codeOf(err) });
    } catch {
      // ignore logger failures
    }
    throw err;
  }
}
