import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import {
  SendHorizontal,
  StopCircle,
  RotateCcw,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import ChatMessage from "../components/ChatMessage";
import type { AgentStatus } from "../App";

interface Model {
  id: string;
  label: string;
  provider: string;
}

interface ChatViewProps {
  status: AgentStatus | null;
}

export default function ChatView({ status }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const port = status?.port ?? 3978;

  const { messages, sendMessage, isLoading, stop, reload, error } = useChat({
    api: `http://localhost:${port}/api/chat`,
    body: selectedModel ? { model: selectedModel } : undefined,
  });

  // Fetch available models when agent starts
  useEffect(() => {
    if (!status?.running) return;
    fetch(`http://localhost:${port}/api/models`)
      .then((r) => r.json())
      .then((m: Model[]) => {
        setModels(m);
        if (!selectedModel && m.length > 0) {
          // Default to the configured model
          const defaultId = `${status.provider}/${status.model}`;
          const match = m.find((x) => x.id === defaultId);
          setSelectedModel(match?.id || m[0].id);
        }
      })
      .catch(() => setModels([]));
  }, [status?.running, port]);

  // Close model picker on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const currentModelLabel =
    models.find((m) => m.id === selectedModel)?.label ||
    selectedModel.split("/").pop() ||
    "Select model";

  const isAgentDown = !status?.running;

  /**
   * Extract reasoning and text content from AI SDK message parts.
   * AI SDK sends reasoning as parts with type "reasoning".
   */
  const extractParts = (msg: any) => {
    const parts = msg.parts || [];
    let text = "";
    let reasoning = "";

    for (const part of parts) {
      if (part.type === "text") {
        text += part.text;
      } else if (part.type === "reasoning") {
        reasoning += part.reasoning || part.text || "";
      }
    }

    // Fallback to msg.content if no parts
    if (!text && typeof msg.content === "string") {
      text = msg.content;
    }

    return { text, reasoning };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="drag-region shrink-0 flex items-center justify-between px-6 h-13 border-b border-[var(--color-border)]">
        <div className="no-drag flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">Chat</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => reload()}
              className="p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
              title="Regenerate last response"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="py-2">
            {messages.map((msg) => {
              const { text, reasoning } = extractParts(msg);
              return (
                <ChatMessage
                  key={msg.id}
                  role={msg.role as "user" | "assistant"}
                  content={text}
                  reasoning={reasoning || undefined}
                  isStreaming={
                    isLoading &&
                    msg.id === messages[messages.length - 1]?.id &&
                    msg.role === "assistant"
                  }
                />
              );
            })}
          </div>
        )}

        {error && (
          <div className="mx-6 my-3 px-4 py-3 rounded-lg bg-[var(--color-red-dim)] border border-red-500/20 text-sm text-[var(--color-red)]">
            {error.message || "An error occurred. Please try again."}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-4">
        {isAgentDown && (
          <div className="mb-3 px-4 py-2.5 rounded-lg bg-[var(--color-amber-dim)] border border-amber-500/20 text-xs text-[var(--color-amber)]">
            Agent server is not running. Start it from the sidebar to chat.
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAgentDown
                ? "Start the agent to begin chatting…"
                : "Ask anything… (Shift+Enter for new line)"
            }
            disabled={isAgentDown}
            rows={1}
            className="input-ring w-full resize-none rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
                       text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                       pl-4 pr-12 py-3 pb-9 transition-colors
                       focus:border-[var(--color-accent)]/40
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: 160, minHeight: 52 }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
          />

          {/* Bottom bar inside input: model selector + send */}
          <div className="absolute left-2 right-2 bottom-1.5 flex items-center justify-between">
            {/* Model selector */}
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                disabled={isAgentDown}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono
                           text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]
                           hover:bg-[var(--color-surface-3)] transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="truncate max-w-[160px]">
                  {currentModelLabel}
                </span>
                <ChevronDown size={10} />
              </button>

              {showModelPicker && (
                <div className="absolute bottom-full left-0 mb-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-lg shadow-lg overflow-hidden z-50">
                  {models.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[var(--color-text-dim)] text-center">
                      No models available. Check API keys in .env
                    </div>
                  ) : (
                    <div className="py-1 max-h-[240px] overflow-y-auto">
                      {models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setShowModelPicker(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors
                            ${
                              selectedModel === m.id
                                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                            }`}
                        >
                          <div>
                            <div className="font-medium">{m.label}</div>
                            <div className="text-[10px] font-mono text-[var(--color-text-dim)] mt-0.5">
                              {m.provider}
                            </div>
                          </div>
                          {selectedModel === m.id && (
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Send / Stop */}
            <div className="flex items-center gap-1">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="p-1.5 rounded-lg text-[var(--color-red)] hover:bg-[var(--color-red-dim)] transition-colors"
                  title="Stop generating"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isAgentDown}
                  className="p-1.5 rounded-lg text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] transition-colors
                             disabled:text-[var(--color-text-dim)] disabled:hover:bg-transparent"
                  title="Send message"
                >
                  <SendHorizontal size={16} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-dim)] flex items-center justify-center mb-5">
        <Sparkles size={24} className="text-[var(--color-accent)]" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Pi Agent Chat</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm leading-relaxed">
        Chat directly with your AI model. Select a model from the input bar.
        Reasoning traces are shown inline when available.
      </p>
      <div className="flex gap-2 mt-6">
        {["Summarize my last meeting", "Draft a status update", "What can you do?"].map(
          (q) => (
            <span
              key={q}
              className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)]"
            >
              {q}
            </span>
          )
        )}
      </div>
    </div>
  );
}
