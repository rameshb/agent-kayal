import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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

// ─── Settings persistence ───

function getSettingsPath(): string {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "agent-settings.json");
}

function loadSettings(): Record<string, string> {
  const p = getSettingsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, string>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

/** Apply saved settings into process.env so config.ts picks them up */
function applySettingsToEnv(): void {
  const settings = loadSettings();
  for (const [key, value] of Object.entries(settings)) {
    if (value) process.env[key] = value;
  }
}

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

function updateTrayMenu() {
  if (!tray) return;
  const s = agentServer?.getStatus();
  const ctx = Menu.buildFromTemplate([
    { label: `Pi Agent${s?.polling ? " ● Watching" : s?.running ? " ● Server" : " ○ Off"}`, enabled: false },
    { type: "separator" },
    { label: "Show Dashboard", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: "Quit", click: async () => { await agentServer?.stop(); app.quit(); } },
  ]);
  tray.setContextMenu(ctx);
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle("🤖");
  tray.setToolTip("Pi Teams Agent");
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

  // ── Settings ──
  ipcMain.handle("agent:fetch-models", async (_e, provider: string, apiKey: string) => {
    return AgentServer.fetchProviderModels(provider, apiKey);
  });
  ipcMain.handle("agent:get-settings", () => loadSettings());
  ipcMain.handle("agent:save-settings", async (_e, settings: Record<string, string>) => {
    saveSettings(settings);
    // Apply to current process env
    for (const [key, value] of Object.entries(settings)) {
      if (value) process.env[key] = value;
      else delete process.env[key];
    }
    // Restart the agent server so the new config takes effect
    try {
      await agentServer?.stop();
      agentServer = new AgentServer();
      await agentServer.start();
      // Re-wire event forwarding to the new server instance
      rewireEvents();
      mainWindow?.webContents.send("agent:status-changed", agentServer.getStatus());
    } catch (err: any) {
      console.error("Failed to restart after settings change:", err.message);
    }
    return { ok: true };
  });
  ipcMain.handle("agent:has-settings", () => {
    const s = loadSettings();
    return Object.keys(s).length > 0;
  });

  // ── Event forwarding ──
  rewireEvents();
}

function rewireEvents() {
  if (!agentServer) return;
  agentServer.removeAllListeners();
  agentServer.on("log", (entry: LogEntry) => mainWindow?.webContents.send("agent:log-entry", entry));
  agentServer.on("started", (s: AgentStatus) => { mainWindow?.webContents.send("agent:status-changed", s); updateTrayMenu(); });
  agentServer.on("stopped", () => { mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()); updateTrayMenu(); });
  agentServer.on("device-code", (info: any) => {
    mainWindow?.webContents.send("agent:device-code", info);
    mainWindow?.show(); mainWindow?.focus();
  });
  agentServer.on("auth-changed", (state: any) => mainWindow?.webContents.send("agent:auth-changed", state));
  agentServer.on("polling-started", () => { mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()); updateTrayMenu(); });
  agentServer.on("polling-stopped", () => { mainWindow?.webContents.send("agent:status-changed", agentServer?.getStatus()); updateTrayMenu(); });
}

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  applySettingsToEnv();
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
