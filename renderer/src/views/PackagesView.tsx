import { useState, useEffect } from "react";
import {
  Package,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Download,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";

interface PiPackage {
  name: string;
  version: string;
  source: string;
}

export default function PackagesView() {
  const [packages, setPackages] = useState<PiPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [installSource, setInstallSource] = useState("");
  const [installing, setInstalling] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const data = await window.agentAPI?.getPackages();
      setPackages(data || []);
    } catch {
      setPackages([]);
    }
    setLoading(false);
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installSource.trim() || installing) return;

    setInstalling(true);
    setFeedback(null);
    try {
      await window.agentAPI?.installPackage(installSource.trim());
      setFeedback({ type: "success", msg: `Installed ${installSource.trim()}` });
      setInstallSource("");
      await loadPackages();
    } catch (err: any) {
      setFeedback({
        type: "error",
        msg: err.message || "Install failed",
      });
    }
    setInstalling(false);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove package "${name}"?`)) return;
    setRemoving(name);
    try {
      await window.agentAPI?.removePackage(name);
      setFeedback({ type: "success", msg: `Removed ${name}` });
      await loadPackages();
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Remove failed" });
    }
    setRemoving(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="drag-region shrink-0 flex items-center justify-between px-6 h-13 border-b border-[var(--color-border)]">
        <div className="no-drag flex items-center gap-2">
          <Package size={15} className="text-[var(--color-accent)]" />
          <span className="text-sm font-semibold">Packages</span>
          <span className="text-[11px] font-mono text-[var(--color-text-dim)] ml-1">
            {packages.length}
          </span>
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={loadPackages}
            className="p-1.5 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              // Opens pi.dev packages page
              window.open?.("https://shittycodingagent.ai/packages", "_blank");
            }}
            className="flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            Browse pi.dev
            <ExternalLink size={10} />
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Install form */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-3 font-semibold">
            Install package
          </div>
          <form onSubmit={handleInstall} className="flex gap-2">
            <input
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value)}
              placeholder="npm:@foo/pi-tools  or  git:github.com/user/repo"
              disabled={installing}
              className="input-ring flex-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg
                         text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]
                         px-3 py-2.5 font-mono transition-colors
                         focus:border-[var(--color-accent)]/40
                         disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!installSource.trim() || installing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
                         bg-[var(--color-accent-dim)] text-[var(--color-accent)]
                         hover:bg-[var(--color-accent)]/20 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {installing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              {installing ? "Installing…" : "Install"}
            </button>
          </form>
          <div className="mt-2 text-[10px] text-[var(--color-text-dim)]">
            Supports npm packages, git repos, and version pinning with @tag
          </div>
        </div>

        {/* Feedback banner */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium ${
              feedback.type === "success"
                ? "bg-[var(--color-green-dim)] text-[var(--color-green)]"
                : "bg-[var(--color-red-dim)] text-[var(--color-red)]"
            }`}
          >
            {feedback.type === "success" ? (
              <Check size={13} />
            ) : (
              <AlertCircle size={13} />
            )}
            {feedback.msg}
          </div>
        )}

        {/* Installed packages list */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-3 font-semibold">
            Installed packages
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-[var(--color-text-dim)]">
              <Loader2 size={14} className="animate-spin mr-2" />
              Loading packages…
            </div>
          ) : packages.length === 0 ? (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8 text-center">
              <Package
                size={24}
                className="text-[var(--color-text-dim)] mx-auto mb-3"
              />
              <p className="text-sm text-[var(--color-text-muted)] mb-1">
                No packages installed
              </p>
              <p className="text-xs text-[var(--color-text-dim)]">
                Install Pi packages to extend agent capabilities — skills,
                extensions, prompt templates, and themes.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {packages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-dim)] flex items-center justify-center shrink-0">
                    <Package size={14} className="text-[var(--color-accent)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {pkg.name}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-dim)] font-mono flex items-center gap-2 mt-0.5">
                      {pkg.version && <span>v{pkg.version}</span>}
                      {pkg.source && (
                        <>
                          <span>·</span>
                          <span className="truncate">{pkg.source}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(pkg.name)}
                    disabled={removing === pkg.name}
                    className="shrink-0 p-1.5 rounded-md text-[var(--color-text-dim)]
                               hover:text-[var(--color-red)] hover:bg-[var(--color-red-dim)] transition-colors
                               disabled:opacity-40"
                    title="Remove package"
                  >
                    {removing === pkg.name ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick install suggestions */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] mb-3 font-semibold">
            Popular packages
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                name: "pi-skills",
                desc: "Browser, Google Calendar/Drive/Gmail, transcription",
                source: "git:github.com/badlogic/pi-skills",
              },
              {
                name: "pi-doom",
                desc: "Run Doom inside your agent (yes, really)",
                source: "git:github.com/badlogic/pi-doom",
              },
            ].map((s) => (
              <button
                key={s.name}
                onClick={() => setInstallSource(s.source)}
                className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5
                           hover:border-[var(--color-accent)]/30 transition-colors"
              >
                <div className="text-xs font-medium mb-0.5">{s.name}</div>
                <div className="text-[10px] text-[var(--color-text-dim)] leading-snug">
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
