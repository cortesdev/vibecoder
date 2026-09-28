"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

// Sign-out that always lands on a fresh home page. The old plain
// <form action="/api/auth/logout"> depended on the server's absolute
// redirect (env.siteUrl), which can point at the wrong host and leave
// cached app UI behind. POST via fetch, then hard-navigate to "/".
export default function SignOutButton({ className = "sidebar-link w-full text-left" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Cookie is cleared server-side; even a network hiccup should not
      // trap the user on a stale authenticated page.
    }
    window.location.replace("/");
    // Fallback: if replace is somehow swallowed, force a reload.
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <button type="button" className={className} onClick={() => void signOut()} disabled={busy}>
      <LogOut size={16} aria-hidden="true" /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
