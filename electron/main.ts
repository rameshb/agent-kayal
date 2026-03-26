import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from "electron";
import { join } from "node:path";
import { AgentServer } from "../src/server.js";
import type { AgentStatus, LogEntry } from "../src/server.js";

// ─── State ───

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agentServer: AgentServer | null = null;

// ─── Paths ───

const isDev = !app.isPackaged;
const rendererPath = isDev
  ? join(import.meta.dirname, "..", "..", "renderer", "dist")
  : join(process.resourcesPath, "renderer");
const preloadPath = join(import.meta.dirname, "preload.js");

// ─── Helpers ───

function serverUrl(path: string): string {
  const s = agentServer?.getStatus();
  return `http://${s?.host || "127.0.0.1"}:${s?.port || 3978}${path}`;
}

async function fetchJson(path: string, opts?: RequestInit): Promise<any> {
  if (!agentServer?.getStatus().running) return null;
  try {
    const r = await fetch(serverUrl(path), { headers: { "Content-Type": "application/json" }, ...opts });
    return await r.json();
  } catch { return null; }
}

// ─── Window ───

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 660, minWidth: 720, minHeight: 500,
    title: "Pi Teams Agent",
    backgroundColor: "#0a0e1a",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(join(rendererPath, "index.html"));
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("close", (e) => {
    if (agentServer?.getStatus().running) { e.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── Tray ───

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle("🤖");
  tray.setToolTip("Pi Teams Agent");

  const updateTrayMenu = () => {
    const s = agentServer?.getStatus();
    const ctx = Menu.buildFromTemplate([
      { label: `Pi Agent${s?.polling ? " ● Watching" : s?.running ? " ● Server" : " ○ Off"}`, enabled: false },
      { type: "separator" },
      { label: "Show Dashboard", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: "separator" },
      { label: "Quit", click: async () => { await agentServer?.stop(); app.quit(); } },
    ]);
    tray?.setContextMenu(ctx);
  };

  agentServer?.on("started", updateTrayMenu);
  agentServer?.on("stopped", updateTrayMenu);
  agentServer?.on("polling-started", updateTrayMenu);
  agentServer?.on("polling-stopped", updateTrayMenu);
  updateTrayMenu();
}

// ─── IPC ───

function setupIPC() {
  // ── Lifecycle ──
  ipcMain.handle("agent:status", () => agentServer?.getStatus() ?? null);
  ipcMain.handle("agent:start", async () => { await agentServer?.start(); return agentServer?.getStatus() ?? null; });
  ipcMain.handle("agent:stop", async () => { await agentServer?.stop(); });
  ipcMain.handle("agent:logs", () => agentServer?.getRecentLogs() ?? []);
  ipcMain.handle("agent:config", () => {
    const c = agentServer?.getConfig();
    if (!c) return null;
    return { provider: c.llm.provider, model: c.llm.model, host: c.server.host, port: c.server.port,
      agentName: c.agent.name, pollInterval: c.agent.pollIntervalMs, rateLimitPerHour: c.security.rateLimitPerHour };
  });

  // ── Auth ──
  ipcMain.handle("agent:auth-state", () => agentServer?.getAuthState() ?? null);

  ipcMain.handle("agent:sign-in", async () => {
    try {
      const authed = await agentServer?.tryAutoAuth();
      if (authed) return agentServer?.getAuthState();
      // Need device code flow
      await agentServer?.startDeviceCodeAuth();
      return agentServer?.getAuthState();
    } catch (err: any) {
      return { authenticated: false, error: err.message };
    }
  });

  ipcMain.handle("agent:sign-out", async () => {
    await agentServer?.logout();
    return agentServer?.getAuthState();
  });

  // ── Polling ──
  ipcMain.handle("agent:start-polling", async () => {
    try { await agentServer?.startPolling(); return agentServer?.getStatus(); }
    catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle("agent:stop-polling", async () => {
    await agentServer?.stopPolling();
    return agentServer?.getStatus();
  });

  ipcMain.handle("agent:channels", async () => fetchJson("/api/channels") ?? []);

  // ── Sessions ──
  ipcMain.handle("agent:sessions", async () => (await fetchJson("/api/sessions")) ?? []);
  ipcMain.handle("agent:delete-session", async (_e, id: string) => {
    await fetchJson(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  });

  // ── Packages ──
  ipcMain.handle("agent:packages", async () => (await fetchJson("/api/packages")) ?? []);
  ipcMain.handle("agent:install-package", async (_e, source: string) => {
    const r = await fetchJson("/api/packages/install", { method: "POST", body: JSON.stringify({ source }) });
    if (r?.error) throw new Error(r.error);
    return r;
  });
  ipcMain.handle("agent:remove-package", async (_e, name: string) => {
    const r = await fetchJson(`/api/packages/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (r?.error) throw new Error(r.error);
    return r;
  });

  // ── Event forwarding ──
  agentServer?.on("log", (entry: LogEntry) => mainWindow?.webContents.send("agent:log-entry", entry));
  agentServer?.on("started", (s: AgentStatus) => mainWindow?.webContents.send("agent:status-changed", s));
  agentServer?.on("stopped", () => mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()));
  agentServer?.on("device-code", (info: any) => {
    mainWindow?.webContents.send("agent:device-code", info);
    mainWindow?.show(); mainWindow?.focus();
  });
  agentServer?.on("auth-changed", (state: any) => mainWindow?.webContents.send("agent:auth-changed", state));
  agentServer?.on("polling-started", () => mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()));
  agentServer?.on("polling-stopped", () => mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()));
}

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  agentServer = new AgentServer();
  setupIPC();
  createWindow();
  createTray();

  // Auto-start server
  try { await agentServer.start(); } catch (err: any) {
    console.error("Failed to start:", err.message);
  }

  // Try silent auth → auto-start polling if cached tokens exist
  try {
    const authed = await agentServer.tryAutoAuth();
    if (authed) await agentServer.startPolling();
  } catch {
    // User will sign in via UI
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { mainWindow?.show(); }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !agentServer?.getStatus().running) app.quit();
});
app.on("before-quit", async () => { await agentServer?.stop(); });
