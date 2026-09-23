"use client";

import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="mono flex h-full items-center justify-center text-sm muted">loading editor…</div>
  ),
});

const LANG_BY_EXT: Record<string, string> = {
  ".tsx": "typescript",
  ".ts": "typescript",
  ".jsx": "javascript",
  ".js": "javascript",
  ".css": "css",
  ".html": "html",
  ".json": "json",
};

function languageFor(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return LANG_BY_EXT[ext] ?? "plaintext";
}

export default function FileEditor({ path, value, onChange }: {
  path: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <MonacoEditor
      height="100%"
      language={languageFor(path)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme="vs-dark"
      options={{
        fontSize: 13.5,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
        automaticLayout: true,
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        padding: { top: 12 },
      }}
    />
  );
}
