// Narrowly scoped postMessage bridge between the preview iframe and the
// parent. Traffic flows ONE way: preview → parent, error reports only. The
// parent never executes anything from the preview and accepts no commands.

export const BRIDGE_SOURCE = "vibecoder-preview";

export type BridgeEventType = "runtime-error" | "console-error";

export interface BridgeEvent {
  type: BridgeEventType;
  message: string;
}

const MAX_MESSAGE = 2000;

/** Validate an inbound window message. Returns the event or null. Checks, in
 *  order: same-window source (no cross-iframe forgery), srcDoc origin
 *  ("null"), tagged payload shape, per-preview nonce, known type, size cap. */
export function acceptBridgeEvent(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  nonce: string,
  iframeWindow: unknown,
): BridgeEvent | null {
  if (event.source == null || event.source !== iframeWindow) return null;
  // srcDoc documents have an opaque origin serialized as "null".
  if (event.origin !== "null" && event.origin !== windowOrigin()) return null;
  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return null;
  if (data.source !== BRIDGE_SOURCE) return null;
  if (typeof data.nonce !== "string" || data.nonce !== nonce) return null;
  if (data.type !== "runtime-error" && data.type !== "console-error") return null;
  if (typeof data.message !== "string" || data.message.length === 0) return null;
  if (data.message.length > MAX_MESSAGE) return null;
  return { type: data.type, message: data.message };
}

function windowOrigin(): string {
  // Evaluated lazily so this module stays import-safe in Node tests.
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** In-preview snippet: forwards window errors + console.error to the parent.
 *  One-way reporting — no eval, no command handling, no parent access. The
 *  nonce binds reports to a single preview instance. */
export function bridgeListenerSnippet(nonce: string): string {
  const safe = nonce.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return (
    "(function(){\n" +
    'var N="' + safe + '",S="' + BRIDGE_SOURCE + '";\n' +
    "function send(t,m){try{parent.postMessage({source:S,nonce:N,type:t,message:String(m).slice(0,2000)},'*');}catch(e){}}\n" +
    "window.addEventListener('error',function(e){send('runtime-error',e.message||'Script error');});\n" +
    "window.addEventListener('unhandledrejection',function(e){send('runtime-error',(e.reason&&e.reason.message)||'Unhandled rejection');});\n" +
    "var orig=console.error;console.error=function(){try{send('console-error',Array.prototype.map.call(arguments,function(a){return String(a);}).join(' '));}catch(e){}return orig.apply(console,arguments);};\n" +
    "})();"
  );
}
