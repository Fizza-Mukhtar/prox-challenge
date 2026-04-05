"use client";

import { Artifact } from "./Artifact";
import ReactMarkdown from "react-markdown";

export interface ContentBlock {
  type: "text" | "image" | "artifact" | "tool_start" | "tool_done";
  content?: string;
  src?: string;
  caption?: string;
  html?: string;
  title?: string;
  tool?: string;
  preview?: string;
  artifactType?: string;
}

interface MessageProps {
  role: "user" | "assistant";
  blocks: ContentBlock[];
}

const TOOL_LABELS: Record<string, string> = {
  search_manual:      "Searching manual...",
  get_section:        "Loading section...",
  get_page_image:     "Finding diagram...",
  generate_artifact:  "Building interactive tool...",
};

export function Message({ role, blocks }: MessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-amber-500 text-gray-900 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%] font-medium">
          {blocks.map((b, i) => b.type === "text" && (
            <span key={i}>{b.content}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-gray-900 font-bold text-sm mt-1">
        V
      </div>

      {/* Content blocks */}
      <div className="flex-1 max-w-[90%] space-y-2">
        {blocks.map((block, i) => {
          if (block.type === "text" && block.content) {
            return (
              <div
                key={i}
                className="bg-gray-800 text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3"
              >
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-amber-400 prose-strong:text-amber-300 prose-code:text-amber-300 prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded">
                  <ReactMarkdown>{block.content}</ReactMarkdown>
                </div>
              </div>
            );
          }

          if (block.type === "tool_start") {
            return (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-500/70 italic px-1">
                <span className="inline-block w-3 h-3 border-2 border-amber-500/50 border-t-amber-500 rounded-full animate-spin" />
                {TOOL_LABELS[block.tool || ""] || "Working..."}
              </div>
            );
          }

          if (block.type === "tool_done") {
            return (
              <div key={i} className="text-xs text-green-500/60 italic px-1">
                ✓ {block.preview}
              </div>
            );
          }

          if (block.type === "image" && block.src) {
            return (
              <div key={i} className="rounded-xl overflow-hidden border border-gray-700">
                <div className="bg-gray-800 px-3 py-1.5 text-xs text-amber-400 font-medium">
                  📖 {block.caption || "Manual Reference"}
                </div>
                <img
                  src={block.src}
                  alt={block.caption || "Manual page"}
                  className="w-full object-contain bg-white"
                />
              </div>
            );
          }

          if (block.type === "artifact" && block.html) {
            return (
              <Artifact
                key={i}
                html={block.html}
                title={block.title || "Interactive Tool"}
                artifactType={block.artifactType}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}