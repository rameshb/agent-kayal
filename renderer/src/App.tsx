import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatView from "./views/ChatView";
import SessionsView from "./views/SessionsView";
import DashboardView from "./views/DashboardView";
import PackagesView from "./views/PackagesView";
import SettingsView from "./views/SettingsView";

export type View = "chat" | "sessions" | "packages" | "dashboard" | "settings";

export interface AgentStatus {
  running: boolean;
  uptime: number;
  host: string;
  port: number;
  provider: string;
  model: string;
}

declare global {
  interface Window {
    agentAPI: {
      getStatus: () => Promise<AgentStatus | null>;
      start: () => Promise<AgentStatus | null>;
      stop: () => Promise<void>;
      getLogs: () => Promise<any[]>;
      getConfig: () => Promise<any>;
      getSessions: () => Promise<any[]>;
      deleteSession: (id: string) => Promise<void>;
      getPackages: () => Promise<any[]>;
      installPackage: (source: string) => Promise<any>;
      removePackage: (name: string) => Promise<void>;
      getSettings: () => Promise<Record<string, string>>;
      saveSettings: (settings: Record<string, string>) => Promise<{ ok: boolean }>;
      hasSettings: () => Promise<boolean>;
      fetchModels: (provider: string, apiKey: string) => Promise<{ id: string; label: string; provider: string }[]>;
      onLogEntry: (cb: (entry: any) => void) => () => void;
      onStatusChanged: (cb: (status: AgentStatus) => void) => () => void;
    };
  }
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  useEffect(() => {
    // Initial status fetch
    window.agentAPI?.getStatus().then(setStatus);

    // Check if this is the first launch (no settings saved yet)
    window.agentAPI?.hasSettings().then((has) => {
      if (!has) {
        setIsFirstLaunch(true);
        setView("settings");
      }
    });

    // Listen for status changes
    const unsub = window.agentAPI?.onStatusChanged((s) => setStatus(s));
    return () => unsub?.();
  }, []);

  // Poll uptime every second when running
  useEffect(() => {
    if (!status?.running) return;
    const interval = setInterval(async () => {
      const s = await window.agentAPI?.getStatus();
      if (s) setStatus(s);
    }, 5000);
    return () => clearInterval(interval);
  }, [status?.running]);

  return (
    <div className="flex h-screen bg-[var(--color-bg)]">
      <Sidebar
        currentView={view}
        onNavigate={setView}
        status={status}
        onStart={async () => {
          const s = await window.agentAPI?.start();
          if (s) setStatus(s);
        }}
        onStop={async () => {
          await window.agentAPI?.stop();
          const s = await window.agentAPI?.getStatus();
          if (s) setStatus(s);
        }}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === "chat" && <ChatView status={status} />}
        {view === "sessions" && <SessionsView />}
        {view === "packages" && <PackagesView />}
        {view === "dashboard" && <DashboardView status={status} />}
        {view === "settings" && (
          <SettingsView
            isFirstLaunch={isFirstLaunch}
            onSetupComplete={() => {
              setIsFirstLaunch(false);
              setView("chat");
            }}
          />
        )}
      </main>
    </div>
  );
}
