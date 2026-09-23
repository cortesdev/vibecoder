"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); the key is visible to select.
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={copy}>
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
