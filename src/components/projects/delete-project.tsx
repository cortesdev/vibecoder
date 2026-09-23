"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteProject({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy || !window.confirm("Delete this project and all its files? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/app/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/agent");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      className="text-sm"
      style={{ color: "var(--accent)" }}
      disabled={busy}
    >
      {busy ? "Deleting…" : "Delete project"}
    </button>
  );
}