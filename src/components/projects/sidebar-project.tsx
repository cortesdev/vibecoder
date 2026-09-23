"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, FolderOpen, Trash2 } from "lucide-react";

export default function SidebarProject({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = draft.trim();
    if (!next || busy) return;
    setBusy(true);
    const res = await fetch(`/api/app/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function remove() {
    if (busy || !window.confirm("Delete this project and all its files? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/app/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (pathname === `/agent/projects/${id}`) router.push("/agent");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="sidebar-link gap-1.5" style={{ padding: "4px 6px" }}>
        <Link
          href={`/agent/projects/${id}`}
          className="shrink-0"
          aria-label={`Open ${name}`}
          onClick={() => setEditing(false)}
        >
          <FolderOpen size={15} aria-hidden="true" />
        </Link>
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[13px]"
          style={{
            background: "var(--bg-inset)",
            color: "var(--ink)",
            borderColor: "var(--hairline)",
          }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="shrink-0"
          aria-label="Save name"
          style={{ color: "var(--good)" }}
        >
          <Check size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="shrink-0"
          aria-label="Delete project"
          style={{ color: "var(--accent)" }}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link href={`/agent/projects/${id}`} className="sidebar-link">
        <FolderOpen size={15} aria-hidden="true" className="shrink-0" />
        <span
          className="truncate"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraft(name);
            setEditing(true);
          }}
        >
          {name}
        </span>
      </Link>
    </li>
  );
}