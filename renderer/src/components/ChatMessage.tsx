import { useState } from "react";
import { User, Bot, ChevronDown, ChevronRight, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
}

export default function ChatMessage({
  role,
  content,
  reasoning,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [reasoningOpen, setReasoningOpen] = useState(false);

  return (
    <div
      className={`flex gap-3 px-6 py-4 ${
        isUser ? "" : "bg-[var(--color-surface)]/40"
      }`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 ${
          isUser
            ? "bg-[var(--color-surface-3)]"
            : "bg-[var(--color-accent-dim)]"
        }`}
      >
        {isUser ? (
          <User size={14} className="text-[var(--color-text-muted)]" />
        ) : (
          <Bot size={14} className="text-[var(--color-accent)]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-[var(--color-text-dim)] mb-1 uppercase tracking-wider">
          {isUser ? "You" : "Agent"}
        </div>

        {/* Reasoning trace (collapsible) */}
        {reasoning && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors py-1"
            >
              <Brain size={12} />
              <span>Reasoning</span>
              {reasoningOpen ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {!reasoningOpen && (
                <span className="text-[var(--color-text-dim)] font-normal ml-1">
                  {reasoning.length > 80
                    ? reasoning.slice(0, 80) + "…"
                    : reasoning}
                </span>
              )}
            </button>
            {reasoningOpen && (
              <div className="mt-1 ml-0.5 pl-3 border-l-2 border-[var(--color-accent)]/20">
                <div className="text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap font-mono">
                  {reasoning}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        <div
          className={`chat-prose text-[var(--color-text)] ${
            isStreaming && !content ? "cursor-blink" : ""
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <ReactMarkdown>{content || " "}</ReactMarkdown>
          )}
          {isStreaming && content && (
            <span className="inline-block w-1.5 h-4 bg-[var(--color-accent)] ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
