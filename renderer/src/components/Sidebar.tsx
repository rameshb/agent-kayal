import {
  MessageSquare,
  LayoutGrid,
  Activity,
  Play,
  Square,
  Zap,
  Package,
} from "lucide-react";
import type { View, AgentStatus } from "../App";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  status: AgentStatus | null;
  onStart: () => void;
  onStop: () => void;
}

const navItems: { id: View; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "sessions", label: "Sessions", icon: LayoutGrid },
  { id: "packages", label: "Packages", icon: Package },
  { id: "dashboard", label: "Dashboard", icon: Activity },
];

export default function Sidebar({
  currentView,
  onNavigate,
  status,
  onStart,
  onStop,
}: SidebarProps) {
  const running = status?.running ?? false;

  return (
    <aside className="drag-region w-[220px] flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* ── Brand ── */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-dim)] flex items-center justify-center">
            <Zap size={16} className="text-[var(--color-accent)]" />
          </div>
          <div className="no-drag">
            <div className="text-sm font-semibold tracking-tight">
              Pi Agent
            </div>
            <div className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
              Teams Runtime
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="no-drag flex-1 px-3 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${
                  active
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent-hover)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                }`}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* ── Status + Controls ── */}
      <div className="no-drag px-3 pb-4 space-y-3">
        {/* Model info */}
        {status && (
          <div className="px-3 py-2.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
              Model
            </div>
            <div className="text-xs font-mono text-[var(--color-text-muted)] truncate">
              {status.provider}/{status.model?.replace("claude-", "").replace(/-\d{8}$/, "")}
            </div>
          </div>
        )}

        {/* Start/Stop button */}
        <button
          onClick={running ? onStop : onStart}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all
            ${
              running
                ? "bg-[var(--color-red-dim)] text-[var(--color-red)] hover:bg-red-500/20"
                : "bg-[var(--color-green-dim)] text-[var(--color-green)] hover:bg-green-500/20"
            }`}
        >
          {running ? <Square size={12} /> : <Play size={12} />}
          {running ? "Stop Agent" : "Start Agent"}
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              running
                ? "bg-[var(--color-green)] pulse-soft"
                : "bg-[var(--color-text-dim)]"
            }`}
          />
          <span className="text-[11px] text-[var(--color-text-dim)]">
            {running
              ? `Running · :${status?.port}`
              : "Stopped"}
          </span>
        </div>
      </div>
    </aside>
  );
}
