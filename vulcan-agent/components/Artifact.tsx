"use client";

import { useEffect, useRef } from "react";

interface ArtifactProps {
  html: string;
  title: string;
  artifactType?: string;
}

export function Artifact({ html, title, artifactType }: ArtifactProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // If it's a mermaid diagram, wrap it properly
    const content = artifactType === "mermaid"
      ? `<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<style>
  body { background: #111827; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
  .mermaid { max-width: 100%; }
  .mermaid svg { max-width: 100%; }
</style>
</head>
<body>
<div class="mermaid">
${html}
</div>
<script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</body>
</html>`
      : html;

    doc.open();
    doc.write(content);
    doc.close();
  }, [html, artifactType]);

  return (
    <div className="rounded-xl overflow-hidden border border-amber-500/30 bg-gray-900 my-2">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-xs text-gray-400 font-medium ml-1">{title}</span>
        <span className="ml-auto text-xs text-gray-600">
          {artifactType === "mermaid" ? "diagram" : artifactType === "svg" ? "schematic" : "interactive"}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        className="w-full border-0"
        style={{ height: "520px" }}
        title={title}
      />
    </div>
  );
}