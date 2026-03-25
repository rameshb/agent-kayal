import { useState, useEffect } from "react";
import {
  LayoutGrid,
  MessageSquare,
  Clock,
  Trash2,
  Search,
  User,
  Hash,
  ChevronRight,
  X,
  FileText,
} from "lucide-react";

interface Session {
  id: string;
  conversationType: string;
  lastActive: string;
  messageCount: number;
  sizeBytes: number;
  preview?: string;
}

export default function SessionsView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await window.agentAPI?.getSessions();
      setSessions(data || []);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  };

  const deleteSession = async (id: string) => {
    await window.agentAPI?.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = sessions.filter(
    (s) =>
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.conversationType.toLowerCase().includes(search.toLowerCase())
  );

  const typeIcon = (type: string) => {
    switch (type) {
      case "personal":
        return <User size={13} />;
      case "channel":
        return <Hash size={13} />;
      default:
        return <MessageSquare size={13} />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "personal":
        return "text-[var(--color-accent)]  bg-[var(--color-accent-dim)]";
      case "channel":
        return "text-[var(--color-green)]   bg-[var(--color-green-dim)]";
      default:
        return "text-[var(--color-amber)]   bg-[var(--color-amber-dim)]";
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full">
      {/* ── List ── */}
      <div
        className={`flex flex-col border-r border-[var(--color-border)] ${
          selected ? "w-[380px]" : "flex-1"
        } transition-all`}
      >
        {/* Header */}
        <header className="drag-region shrink-0 flex items-center justify-between px-6 h-13 border-b border-[var(--color-border)]">
          <div className="no-drag flex items-center gap-2">
            <LayoutGrid size={15} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold">Sessions</span>
            <span className="text-[11px] font-mono text-[var(--color-text-dim)] ml-1">
              {sessions.length}
            </span>
          </div>
        </header>

        {/* Search */}
        <div className="no-drag px-4 py-3 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter sessions…"
              className="input-ring w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg
                         text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                         pl-9 pr-3 py-2 transition-colors focus:border-[var(--color-accent)]/40"
            />
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-dim)]">
              Loading sessions…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-8">
              <FileText
                size={20}
                className="text-[var(--color-text-dim)] mb-2"
              />
              <p className="text-xs text-[var(--color-text-dim)]">
                {search ? "No matching sessions" : "No sessions yet"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelected(session)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors
                    ${
                      selected?.id === session.id
                        ? "bg-[var(--color-accent-dim)]"
                        : "hover:bg-[var(--color-surface)]/60"
                    }`}
                >
                  <div
                    className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${typeColor(session.conversationType)}`}
                  >
                    {typeIcon(session.conversationType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {session.id.replace(/^teams-/, "").replace(/-/g, " ")}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5 flex items-center gap-2">
                      <span className="capitalize">
                        {session.conversationType}
                      </span>
                      <span>·</span>
                      <span>{session.messageCount} msgs</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-[var(--color-text-dim)]">
                      {formatDate(session.lastActive)}
                    </div>
                    <ChevronRight
                      size={12}
                      className="text-[var(--color-text-dim)] ml-auto mt-1"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="flex-1 flex flex-col min-w-0">
          <header className="shrink-0 flex items-center justify-between px-6 h-13 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold truncate pr-4">
              {selected.id.replace(/^teams-/, "")}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="no-drag p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
            >
              <X size={14} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Session metadata cards */}
            <div className="grid grid-cols-2 gap-3">
              <MetaCard
                label="Type"
                value={selected.conversationType}
                icon={<MessageSquare size={14} />}
              />
              <MetaCard
                label="Messages"
                value={String(selected.messageCount)}
                icon={<Hash size={14} />}
              />
              <MetaCard
                label="Last Active"
                value={formatDate(selected.lastActive)}
                icon={<Clock size={14} />}
              />
              <MetaCard
                label="Size"
                value={formatSize(selected.sizeBytes)}
                icon={<FileText size={14} />}
              />
            </div>

            {/* Session ID */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
                Session ID
              </div>
              <code className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-2)] px-3 py-2 rounded-lg block break-all border border-[var(--color-border)]">
                {selected.id}
              </code>
            </div>

            {/* Preview */}
            {selected.preview && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-1.5">
                  Last Message Preview
                </div>
                <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-2)] px-3 py-2 rounded-lg border border-[var(--color-border)] line-clamp-4">
                  {selected.preview}
                </div>
              </div>
            )}

            {/* Delete */}
            <button
              onClick={() => {
                if (confirm(`Delete session "${selected.id}"?`)) {
                  deleteSession(selected.id);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                         text-[var(--color-red)] bg-[var(--color-red-dim)] hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={13} />
              Delete Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-dim)] mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-semibold font-mono capitalize">{value}</div>
    </div>
  );
}
