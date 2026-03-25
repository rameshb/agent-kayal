import { useState, useEffect, useRef } from "react";
import {
  Activity,
  Cpu,
  Globe,
  Clock,
  Shield,
  Trash2,
} from "lucide-react";
import type { AgentStatus } from "../App";

interface LogEntry {
  level: string;
  msg: string;
  time: number;
}

interface DashboardViewProps {
  status: AgentStatus | null;
}

export default function DashboardView({ status }: DashboardViewProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load existing logs
    window.agentAPI?.getLogs().then((entries) => setLogs(entries || []));

    // Stream new logs
    const unsub = window.agentAPI?.onLogEntry((entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-499), entry]);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const running = status?.running ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="drag-region shrink-0 flex items-center px-6 h-13 border-b border-[var(--color-border)]">
        <div className="no-drag flex items-center gap-2">
          <Activity size={15} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">Dashboard</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* ── Status cards ── */}
        <div className="grid grid-cols-4 gap-3">
          <StatusCard
            label="Status"
            value={running ? "Running" : "Stopped"}
            icon={<Cpu size={15} />}
            accent={running ? "green" : "red"}
          />
          <StatusCard
            label="Uptime"
            value={running ? formatUptime(status?.uptime ?? 0) : "—"}
            icon={<Clock size={15} />}
          />
          <StatusCard
            label="Endpoint"
            value={running ? `:${status?.port}/api/messages` : "—"}
            icon={<Globe size={15} />}
          />
          <StatusCard
            label="Security"
            value="Localhost"
            icon={<Shield size={15} />}
            accent="green"
          />
        </div>

        {/* ── Model info ── */}
        {status && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-3">
              Configuration
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-[var(--color-text-dim)] mb-0.5">Provider</div>
                <div className="font-mono font-medium">{status.provider}</div>
              </div>
              <div>
                <div className="text-[var(--color-text-dim)] mb-0.5">Model</div>
                <div className="font-mono font-medium truncate">{status.model}</div>
              </div>
              <div>
                <div className="text-[var(--color-text-dim)] mb-0.5">Host</div>
                <div className="font-mono font-medium">{status.host}:{status.port}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Activity log ── */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex flex-col min-h-[280px] max-h-[440px]">
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-semibold">
              Activity Log
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
                {logs.length} entries
              </span>
              <button
                onClick={() => setLogs([])}
                className="p-1 rounded text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto py-1 font-mono text-[11px] leading-5">
            {logs.length === 0 ? (
              <div className="text-center text-[var(--color-text-dim)] py-8">
                No activity yet
              </div>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="px-4 py-0.5 hover:bg-[var(--color-surface-2)]/50 flex gap-2">
                  <span className="shrink-0 text-[var(--color-text-dim)] w-16">
                    {new Date(entry.time).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span
                    className={`shrink-0 w-11 font-semibold ${
                      entry.level === "error"
                        ? "text-[var(--color-red)]"
                        : entry.level === "warn"
                        ? "text-[var(--color-amber)]"
                        : "text-[var(--color-accent)]"
                    }`}
                  >
                    {entry.level.toUpperCase()}
                  </span>
                  <span className="text-[var(--color-text-muted)] truncate">
                    {entry.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "green" | "red";
}) {
  const accentCls =
    accent === "green"
      ? "text-[var(--color-green)]"
      : accent === "red"
      ? "text-[var(--color-red)]"
      : "text-[var(--color-text)]";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-dim)] mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-sm font-semibold font-mono ${accentCls}`}>
        {value}
      </div>
    </div>
  );
}
