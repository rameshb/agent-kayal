import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentAPI", {
  // ── Agent lifecycle ──
  getStatus: () => ipcRenderer.invoke("agent:status"),
  start: () => ipcRenderer.invoke("agent:start"),
  stop: () => ipcRenderer.invoke("agent:stop"),
  getLogs: () => ipcRenderer.invoke("agent:logs"),
  getConfig: () => ipcRenderer.invoke("agent:config"),

  // ── Auth ──
  getAuthState: () => ipcRenderer.invoke("agent:auth-state"),
  signIn: () => ipcRenderer.invoke("agent:sign-in"),
  signOut: () => ipcRenderer.invoke("agent:sign-out"),

  // ── Polling ──
  startPolling: () => ipcRenderer.invoke("agent:start-polling"),
  stopPolling: () => ipcRenderer.invoke("agent:stop-polling"),
  getChannels: () => ipcRenderer.invoke("agent:channels"),

  // ── Sessions ──
  getSessions: () => ipcRenderer.invoke("agent:sessions"),
  deleteSession: (id: string) => ipcRenderer.invoke("agent:delete-session", id),

  // ── Packages ──
  getPackages: () => ipcRenderer.invoke("agent:packages"),
  installPackage: (source: string) => ipcRenderer.invoke("agent:install-package", source),
  removePackage: (name: string) => ipcRenderer.invoke("agent:remove-package", name),

  // ── Settings ──
  getSettings: () => ipcRenderer.invoke("agent:get-settings"),
  saveSettings: (settings: Record<string, string>) => ipcRenderer.invoke("agent:save-settings", settings),
  hasSettings: () => ipcRenderer.invoke("agent:has-settings"),
  fetchModels: (provider: string, apiKey: string) => ipcRenderer.invoke("agent:fetch-models", provider, apiKey),

  // ── Events ──
  onLogEntry: (cb: (entry: any) => void) => {
    const h = (_e: any, entry: any) => cb(entry);
    ipcRenderer.on("agent:log-entry", h);
    return () => ipcRenderer.removeListener("agent:log-entry", h);
  },
  onStatusChanged: (cb: (status: any) => void) => {
    const h = (_e: any, s: any) => cb(s);
    ipcRenderer.on("agent:status-changed", h);
    return () => ipcRenderer.removeListener("agent:status-changed", h);
  },
  onDeviceCode: (cb: (info: any) => void) => {
    const h = (_e: any, info: any) => cb(info);
    ipcRenderer.on("agent:device-code", h);
    return () => ipcRenderer.removeListener("agent:device-code", h);
  },
  onAuthChanged: (cb: (state: any) => void) => {
    const h = (_e: any, s: any) => cb(s);
    ipcRenderer.on("agent:auth-changed", h);
    return () => ipcRenderer.removeListener("agent:auth-changed", h);
  },
});
