import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { EventEmitter } from "node:events";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { loadConfig, type AppConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { SessionStore } from "./session-store.js";
import { AgentRunner } from "./agent-runner.js";
import { GraphAuth, type AuthState } from "./graph/auth.js";
import { GraphPoller, type InboundMessage } from "./graph/poller.js";
import { GraphReplier } from "./graph/replier.js";
import { AccessControl } from "./middleware/access-control.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { getCustomTools } from "./tools/custom-tools.js";

// ─── Types ───

export interface AgentStatus {
  running: boolean;
  uptime: number;
  host: string;
  port: number;
  provider: string;
  model: string;
  auth: AuthState;
  polling: boolean;
  watchedChannels: number;
}

export interface LogEntry {
  level: string;
  msg: string;
  time: number;
  [key: string]: unknown;
}

// ─── Agent Server ───

export class AgentServer extends EventEmitter {
  private config: AppConfig;
  private log: Logger;
  private server: Server | null = null;
  private startTime: number = 0;
  private logBuffer: LogEntry[] = [];
  private maxLogBuffer = 500;
  private sessionStore: SessionStore | null = null;

  // Graph API components
  private graphAuth: GraphAuth;
  private graphPoller: GraphPoller | null = null;
  private graphReplier: GraphReplier | null = null;

  // Agent components
  private agent: AgentRunner | null = null;
  private access: AccessControl;
  private rateLimiter: RateLimiter;

  constructor() {
    super();
    this.config = loadConfig();
    this.log = createLogger(this.config.logLevel);

    // Initialize auth (doesn't connect yet)
    this.graphAuth = new GraphAuth({
      clientId: this.config.azure.clientId,
      tenantId: this.config.azure.tenantId,
      cacheDir: this.config.workspace.cacheDir,
      logger: this.log,
    });

    // Forward auth events
    this.graphAuth.on("device-code", (info) => this.emit("device-code", info));
    this.graphAuth.on("authenticated", (state) => {
      this.pushLog({
        level: "info",
        msg: `Authenticated as ${state.userName}`,
        time: Date.now(),
      });
      this.emit("auth-changed", state);
    });
    this.graphAuth.on("auth-expired", () => {
      this.pushLog({
        level: "warn",
        msg: "Authentication expired, please re-authenticate",
        time: Date.now(),
      });
      this.emit("auth-changed", this.graphAuth.getState());
    });

    // Initialize middleware
    this.access = new AccessControl({
      allowedUsers: this.config.security.allowedUsers,
      allowedTeams: [], // Not used with Graph API approach
      logger: this.log,
    });
    this.rateLimiter = new RateLimiter(this.config.security.rateLimitPerHour);
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getStatus(): AgentStatus {
    return {
      running: this.server !== null && this.server.listening,
      uptime: this.startTime ? (Date.now() - this.startTime) / 1000 : 0,
      host: this.config.server.host,
      port: this.config.server.port,
      provider: this.config.llm.provider,
      model: this.config.llm.model,
      auth: this.graphAuth.getState(),
      polling: this.graphPoller?.isRunning() ?? false,
      watchedChannels: this.graphPoller?.getWatchedChannels().length ?? 0,
    };
  }

  getRecentLogs(): LogEntry[] {
    return this.logBuffer.slice(-200);
  }

  getAuthState(): AuthState {
    return this.graphAuth.getState();
  }

  // ─── Authentication ───

  /**
   * Try silent auth from cached tokens.
   * Returns true if already authenticated.
   */
  async tryAutoAuth(): Promise<boolean> {
    return this.graphAuth.trysilent();
  }

  /**
   * Start device code flow.
   * Emits "device-code" event with { userCode, verificationUri, message }.
   * The UI should display the code and URL to the user.
   */
  async startDeviceCodeAuth(): Promise<void> {
    await this.graphAuth.authenticateWithDeviceCode();
  }

  async logout(): Promise<void> {
    await this.stopPolling();
    await this.graphAuth.logout();
    this.emit("auth-changed", this.graphAuth.getState());
  }

  // ─── Polling ───

  async startPolling(): Promise<void> {
    if (!this.graphAuth.getState().authenticated) {
      throw new Error("Not authenticated. Sign in first.");
    }

    this.graphReplier = new GraphReplier({
      auth: this.graphAuth,
      logger: this.log,
    });

    this.graphPoller = new GraphPoller({
      auth: this.graphAuth,
      agentName: this.config.agent.name,
      pollIntervalMs: this.config.agent.pollIntervalMs,
      stateDir: this.config.workspace.stateDir,
      logger: this.log,
    });

    // Handle inbound messages
    this.graphPoller.on("message", (msg: InboundMessage) =>
      this.handleTeamsMessage(msg)
    );

    await this.graphPoller.start();

    this.pushLog({
      level: "info",
      msg: `Watching ${this.graphPoller.getWatchedChannels().length} channels for @${this.config.agent.name} mentions`,
      time: Date.now(),
    });
    this.emit("polling-started");
  }

  async stopPolling(): Promise<void> {
    if (this.graphPoller) {
      await this.graphPoller.stop();
      this.graphPoller = null;
      this.pushLog({ level: "info", msg: "Stopped watching Teams", time: Date.now() });
      this.emit("polling-stopped");
    }
  }

  // ─── Teams Message Handling ───

  private async handleTeamsMessage(msg: InboundMessage): Promise<void> {
    this.pushLog({
      level: "info",
      msg: `@mention from ${msg.userName} in #${msg.channelName}: "${msg.text.slice(0, 60)}${msg.text.length > 60 ? "..." : ""}"`,
      time: Date.now(),
    });

    // Access control
    const accessCheck = this.access.check({
      userId: msg.userId,
      conversationType: "channel",
    });
    if (!accessCheck.allowed) {
      this.log.warn({ userId: msg.userId }, "user not authorized");
      return;
    }

    // Rate limiting
    if (!this.rateLimiter.allow(msg.userId)) {
      this.log.warn({ userId: msg.userId }, "rate limited");
      if (this.graphReplier) {
        await this.graphReplier.replyToChannel(
          msg,
          "⏳ Rate limit reached. Please try again later."
        );
      }
      return;
    }

    // Resolve session
    if (!this.sessionStore || !this.agent) return;

    const sessionId = this.sessionStore.buildSessionId({
      conversationType: "channel",
      conversationId: msg.channelId,
      userId: msg.userId,
      channelId: msg.channelId,
    });
    const sessionRef = this.sessionStore.resolve(sessionId);

    // Run the agent
    try {
      const result = await this.agent.run({
        sessionRef,
        prompt: `[Teams #${msg.channelName}, from ${msg.userName}]\n${msg.text}`,
      });

      if (result.success && result.fullText && this.graphReplier) {
        await this.graphReplier.replyToChannel(msg, result.fullText);
        this.pushLog({
          level: "info",
          msg: `Replied to ${msg.userName} (${result.toolCallCount} tool calls)`,
          time: Date.now(),
        });
      } else if (!result.success) {
        this.pushLog({
          level: "error",
          msg: `Agent failed: ${result.error}`,
          time: Date.now(),
        });
      }
    } catch (err: any) {
      this.log.error({ error: err.message }, "failed to handle Teams message");
      this.pushLog({
        level: "error",
        msg: `Error: ${err.message}`,
        time: Date.now(),
      });
    }
  }

  // ─── AI Model Helpers ───

  private getAIModel() {
    const { provider, model, anthropicKey, openaiKey, openrouterKey } =
      this.config.llm;
    if (provider === "anthropic" && anthropicKey)
      return createAnthropic({ apiKey: anthropicKey })(model);
    if (provider === "openai" && openaiKey)
      return createOpenAI({ apiKey: openaiKey })(model);
    if (provider === "openrouter" && openrouterKey)
      return createOpenAI({ apiKey: openrouterKey, baseURL: "https://openrouter.ai/api/v1" })(model);
    throw new Error(`No API key for provider "${provider}"`);
  }

  private getAIModelByString(modelStr: string) {
    const [provider, ...rest] = modelStr.split("/");
    const modelId = rest.join("/");
    if (provider === "anthropic" && this.config.llm.anthropicKey)
      return createAnthropic({ apiKey: this.config.llm.anthropicKey })(modelId);
    if (provider === "openai" && this.config.llm.openaiKey)
      return createOpenAI({ apiKey: this.config.llm.openaiKey })(modelId);
    if (provider === "openrouter" && this.config.llm.openrouterKey)
      return createOpenAI({ apiKey: this.config.llm.openrouterKey, baseURL: "https://openrouter.ai/api/v1" })(modelId);
    throw new Error(`No API key for provider "${provider}"`);
  }

  private getAvailableModels() {
    const models: { id: string; label: string; provider: string }[] = [];
    if (this.config.llm.anthropicKey) {
      models.push(
        { id: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
        { id: "anthropic/claude-opus-4-20250918", label: "Claude Opus 4", provider: "anthropic" },
        { id: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic" },
      );
    }
    if (this.config.llm.openaiKey) {
      models.push(
        { id: "openai/gpt-4o", label: "GPT-4o", provider: "openai" },
        { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
      );
    }
    if (this.config.llm.openrouterKey) {
      models.push(
        { id: "openrouter/anthropic/claude-sonnet-4", label: "Sonnet 4 (OR)", provider: "openrouter" },
        { id: "openrouter/google/gemini-2.5-flash", label: "Gemini 2.5 Flash (OR)", provider: "openrouter" },
        { id: "openrouter/deepseek/deepseek-r1", label: "DeepSeek R1 (OR)", provider: "openrouter" },
      );
    }
    return models;
  }

  // ─── Log buffer ───

  private pushLog(entry: LogEntry) {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogBuffer)
      this.logBuffer = this.logBuffer.slice(-this.maxLogBuffer);
    this.emit("log", entry);
  }

  // ─── HTTP Server ───

  async start(): Promise<void> {
    if (this.server?.listening) {
      this.log.warn("server already running");
      return;
    }

    this.pushLog({ level: "info", msg: "Starting agent server...", time: Date.now() });

    // Core components
    this.sessionStore = new SessionStore({
      sessionDir: this.config.workspace.sessionDir,
      workspaceDir: this.config.workspace.agentDir, // Sandboxed to AGENT_WORKSPACE_NAME
      logger: this.log,
    });

    this.agent = new AgentRunner({
      config: this.config,
      logger: this.log,
      customTools: getCustomTools(),
      sandboxDir: this.config.workspace.agentDir, // Enforce boundary
    });

    this.pushLog({
      level: "info",
      msg: `Agent sandboxed to: ${this.config.workspace.agentDir}`,
      time: Date.now(),
    });

    // Helpers
    const readBody = (req: IncomingMessage): Promise<any> =>
      new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error("Invalid JSON")); }
        });
        req.on("error", reject);
      });

    const setCors = (res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    };

    // ── HTTP Server ──

    this.server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url || "";
        const method = req.method || "GET";
        setCors(res);

        if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

        // ── Health ──
        if (url === "/health" && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(this.getStatus()));
          return;
        }

        // ── Auth status ──
        if (url === "/api/auth" && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(this.graphAuth.getState()));
          return;
        }

        // ── Available models ──
        if (url === "/api/models" && method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(this.getAvailableModels()));
          return;
        }

        // ── Watched channels ──
        if (url === "/api/channels" && method === "GET") {
          const channels = this.graphPoller?.getWatchedChannels() ?? [];
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(channels));
          return;
        }

        // ── AI SDK chat streaming ──
        if (url === "/api/chat" && method === "POST") {
          this.pushLog({ level: "info", msg: "Chat request from desktop UI", time: Date.now() });
          try {
            const body = await readBody(req);
            const messages = body.messages || [];
            const modelOverride = body.model;
            const model = modelOverride ? this.getAIModelByString(modelOverride) : this.getAIModel();

            const result = streamText({
              model,
              system: "You are a helpful AI assistant running as a Pi-based agent inside a desktop application. Be concise, use markdown formatting, and assist with any tasks the user asks about.",
              messages: messages.map((m: any) => ({
                role: m.role,
                content: typeof m.content === "string" ? m.content
                  : m.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || "",
              })),
              providerOptions: {
                anthropic: { thinking: { type: "enabled", budgetTokens: 4096 } },
              },
            });

            const response = result.toDataStreamResponse({ sendReasoning: true });
            res.writeHead(response.status ?? 200, {
              ...Object.fromEntries(response.headers?.entries() ?? []),
              "Access-Control-Allow-Origin": "*",
            });
            if (response.body) {
              const reader = (response.body as ReadableStream).getReader();
              const pump = async () => { while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); } res.end(); };
              pump().catch(() => res.end());
            } else { res.end(); }
          } catch (err: any) {
            this.log.error({ error: err.message }, "chat stream failed");
            this.pushLog({ level: "error", msg: `Chat error: ${err.message}`, time: Date.now() });
            if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
          }
          return;
        }

        // ── Sessions list ──
        if (url === "/api/sessions" && method === "GET") {
          try {
            const list = await this.listSessions();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(list));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // ── Session delete ──
        if (url.startsWith("/api/sessions/") && method === "DELETE") {
          const id = decodeURIComponent(url.replace("/api/sessions/", ""));
          try {
            const { rmSync } = await import("node:fs");
            const { join } = await import("node:path");
            rmSync(join(this.config.workspace.sessionDir, id), { recursive: true, force: true });
            this.pushLog({ level: "info", msg: `Deleted session: ${id}`, time: Date.now() });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deleted: id }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // ── Packages: list ──
        if (url === "/api/packages" && method === "GET") {
          try { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(await this.listPackages())); }
          catch (err: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
          return;
        }

        // ── Packages: install ──
        if (url === "/api/packages/install" && method === "POST") {
          try {
            const body = await readBody(req);
            if (!body.source) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Missing source" })); return; }
            this.pushLog({ level: "info", msg: `Installing: ${body.source}`, time: Date.now() });
            const result = await this.installPackage(body.source);
            res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
          } catch (err: any) {
            this.pushLog({ level: "error", msg: `Install failed: ${err.message}`, time: Date.now() });
            res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // ── Packages: remove ──
        if (url.startsWith("/api/packages/") && method === "DELETE") {
          const name = decodeURIComponent(url.replace("/api/packages/", ""));
          try {
            this.pushLog({ level: "info", msg: `Removing: ${name}`, time: Date.now() });
            const result = await this.removePackage(name);
            res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        res.writeHead(404); res.end("Not Found");
      }
    );

    // ── Listen ──
    return new Promise((resolve) => {
      this.server!.listen(this.config.server.port, this.config.server.host, () => {
        this.startTime = Date.now();
        const msg = `Listening on http://${this.config.server.host}:${this.config.server.port}`;
        this.log.info(msg);
        this.pushLog({ level: "info", msg, time: Date.now() });
        this.emit("started", this.getStatus());
        resolve();
      });
    });
  }

  // ─── Session listing ───

  private async listSessions() {
    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = this.config.workspace.sessionDir;
    let dirs: string[];
    try { dirs = readdirSync(dir).filter((d) => { try { return statSync(join(dir, d)).isDirectory(); } catch { return false; } }); }
    catch { return []; }

    return dirs.map((id) => {
      const sessionFile = join(dir, id, "session.jsonl");
      let messageCount = 0, sizeBytes = 0, lastActive = new Date(0).toISOString(), preview = "", conversationType = "personal";
      try {
        const stat = statSync(sessionFile);
        sizeBytes = stat.size; lastActive = stat.mtime.toISOString();
        const lines = readFileSync(sessionFile, "utf-8").split("\n").filter(Boolean);
        messageCount = lines.length;
        const typeMatch = id.match(/^teams-(personal|channel|group)/);
        if (typeMatch) conversationType = typeMatch[1];
        if (lines.length > 0) { try { const last = JSON.parse(lines[lines.length - 1]); preview = (typeof last.content === "string" ? last.content : last.text || "").slice(0, 200); } catch {} }
      } catch {}
      return { id, conversationType, lastActive, messageCount, sizeBytes, preview };
    });
  }

  // ─── Package management ───

  private async listPackages() {
    const { execSync } = await import("node:child_process");
    try {
      const output = execSync("pi list", { encoding: "utf-8", timeout: 10_000, cwd: this.config.workspace.dir });
      return output.split("\n").filter(Boolean).map((line) => {
        const match = line.match(/^(.+?)@(.+?)\s*(?:\((.+?)\))?$/);
        return match ? { name: match[1].trim(), version: match[2].trim(), source: match[3]?.trim() || "" } : { name: line.trim(), version: "", source: "" };
      });
    } catch { return []; }
  }

  private async installPackage(source: string) {
    const { execSync } = await import("node:child_process");
    const output = execSync(`pi install ${source}`, { encoding: "utf-8", timeout: 60_000, cwd: this.config.workspace.dir });
    return { success: true, output: output.trim() };
  }

  private async removePackage(name: string) {
    const { execSync } = await import("node:child_process");
    const output = execSync(`pi remove ${name}`, { encoding: "utf-8", timeout: 30_000, cwd: this.config.workspace.dir });
    return { success: true, output: output.trim() };
  }

  // ─── Shutdown ───

  async stop(): Promise<void> {
    await this.stopPolling();
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.log.info("server stopped");
        this.pushLog({ level: "info", msg: "Server stopped", time: Date.now() });
        this.server = null; this.startTime = 0;
        this.emit("stopped");
        resolve();
      });
      setTimeout(() => { this.server = null; resolve(); }, 5000);
    });
  }
}

// ─── Standalone mode ───

const isDirectRun = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");

if (isDirectRun) {
  const server = new AgentServer();
  await server.start();

  // Try auto-auth
  const authed = await server.tryAutoAuth();
  if (authed) {
    await server.startPolling();
  } else {
    console.log("\nNot authenticated. Starting device code flow...\n");
    server.on("device-code", (info: any) => {
      console.log(`\n📱 To sign in, visit: ${info.verificationUri}`);
      console.log(`   Enter code: ${info.userCode}\n`);
    });
    await server.startDeviceCodeAuth();
    await server.startPolling();
  }

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
