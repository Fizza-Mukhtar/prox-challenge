"use client";

import { useState, useRef, useEffect } from "react";
import { Message, ContentBlock } from "@/components/Message";

interface ChatMessage {
  role: "user" | "assistant";
  blocks: ContentBlock[];
}

const SUGGESTED = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. Help me troubleshoot.",
  "What polarity setup do I need for TIG welding?",
  "What settings should I use for 1/4\" mild steel MIG welding?",
  "Show me how to set up the wire feed mechanism",
  "Which process should I use for thin sheet metal?",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [imageType, setImageType] = useState<string>("image/jpeg");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64]   = useState<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(",")[1]);
      setImageType(file.type || "image/jpeg");
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImagePreview(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send(text: string) {
    if ((!text.trim() && !imageBase64) || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      blocks: [{ type: "text", content: text || "What do you see in this image?" }],
    };

    const newMessages = [...messages, userMessage];
    setMessages(() => [...newMessages, { role: "assistant", blocks: [] }]);
    setInput("");
    setImagePreview(null);
    const capturedImage = imageBase64;
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setLoading(true);

    const assistantIndex = newMessages.length;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.blocks
              .filter((b) => b.type === "text")
              .map((b) => b.content)
              .join("\n"),
          })),
          image: capturedImage || null,
          imageType: imageType,
        }),
      });

      const reader  = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "done") break;

            setMessages((prev) => {
              const updated = [...prev];
              const msg = updated[assistantIndex];
              if (!msg) return prev;

              if (event.type === "text") {
                const last = msg.blocks[msg.blocks.length - 1];
                if (last?.type === "text") {
                  last.content = (last.content || "") + event.content;
                } else {
                  msg.blocks.push({ type: "text", content: event.content });
                }
              } else if (event.type !== "done") {
                if (event.type === "tool_done") {
                  const idx = msg.blocks.findLastIndex(
                    (b) => b.type === "tool_start" && b.tool === event.tool
                  );
                  if (idx !== -1) msg.blocks.splice(idx, 1);
                }
                msg.blocks.push(event as ContentBlock);
              }

              return updated;
            });
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[assistantIndex]) {
          updated[assistantIndex].blocks.push({
            type: "text",
            content: "Something went wrong. Please try again.",
          });
        }
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 bg-gray-900">
        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-gray-900 font-bold">
          V
        </div>
        <div>
          <h1 className="font-semibold text-white leading-tight">Vulcan OmniPro 220</h1>
          <p className="text-xs text-gray-400">AI Support Agent</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-gray-400">Online</span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl mx-auto w-full">

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <div className="text-center">
              <div className="text-5xl mb-4">⚡</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                What can I help you weld?
              </h2>
              <p className="text-gray-400 text-sm max-w-sm">
                Ask me anything about your Vulcan OmniPro 220 — setup, settings,
                troubleshooting, or technique. Upload a photo of your weld for diagnosis.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left px-4 py-3 rounded-xl border border-gray-700 bg-gray-800/50 hover:border-amber-500/50 hover:bg-gray-800 transition-all text-sm text-gray-300 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} role={msg.role} blocks={msg.blocks} />
        ))}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="border-t border-gray-800 bg-gray-900 px-4 py-4">
        <div className="max-w-4xl mx-auto space-y-2">

          {/* Image preview */}
          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Upload preview"
                className="h-20 rounded-lg border border-gray-600 object-cover"
              />
              <button
                onClick={removeImage}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-400"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex gap-3 items-end">
            {/* Image upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-amber-500/50 transition-colors flex items-center justify-center text-gray-400 hover:text-amber-400"
              title="Upload image of your weld or machine"
            >
              📷
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about setup, settings, troubleshooting... or upload a photo of your weld"
              rows={1}
              className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || (!input.trim() && !imageBase64)}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-xl px-4 py-3 text-sm transition-colors flex-shrink-0"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2">
          Powered by Claude · Vulcan OmniPro 220 Expert
        </p>
      </footer>
    </div>
  );
}