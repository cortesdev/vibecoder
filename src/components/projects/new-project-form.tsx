"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/app/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; project?: { id: string } };
    if (!res.ok || !data.ok || !data.project) {
      setError(data.error ?? "Could not create the project.");
      setBusy(false);
      return;
    }
    router.push(`/agent/projects/${data.project.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={create} className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:flex-1">
        <label htmlFor="project-name" className="block text-sm font-medium mb-1">
          Project name
        </label>
        <input
          id="project-name"
          className="input"
          placeholder="e.g. My landing page"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Creating…" : "Create project"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm" style={{ color: "var(--accent)" }}>
          {error}
        </p>
      )}
    </form>
  );
}