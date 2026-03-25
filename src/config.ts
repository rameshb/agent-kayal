import "dotenv/config";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

// ─── Helpers ───

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function csvList(key: string): string[] {
  const raw = process.env[key] || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Config shape ───

export interface AppConfig {
  azure: {
    clientId: string;
    tenantId: string;
  };
  agent: {
    name: string;           // Display name for @mention detection
    pollIntervalMs: number;
  };
  llm: {
    provider: string;
    model: string;
    anthropicKey?: string;
    openaiKey?: string;
    openrouterKey?: string;
  };
  server: {
    port: number;
    host: string;
  };
  workspace: {
    dir: string;
    sessionDir: string;
    stateDir: string;   // For delta link persistence
    cacheDir: string;   // For MSAL token cache
    agentDir: string;   // Sandboxed directory for Pi agent file operations
    agentDirName: string;
  };
  security: {
    allowedUsers: string[];
    rateLimitPerHour: number;
  };
  logLevel: string;
}

// ─── Build config ───

function ensureDir(dir: string) {
  const abs = resolve(dir);
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true });
  return abs;
}

export function loadConfig(): AppConfig {
  const workspaceDir = ensureDir(optional("WORKSPACE_DIR", "./workspace"));
  const sessionDir = ensureDir(
    optional("SESSION_DIR", `${workspaceDir}/.sessions`)
  );
  const stateDir = ensureDir(`${workspaceDir}/.graph-state`);
  const cacheDir = ensureDir(`${workspaceDir}/.auth`);
  const agentDirName = optional("AGENT_WORKSPACE_NAME", "my_pi_agent");
  const agentDir = ensureDir(`${workspaceDir}/${agentDirName}`);

  return {
    azure: {
      clientId: required("AZURE_CLIENT_ID"),
      tenantId: required("AZURE_TENANT_ID"),
    },
    agent: {
      name: optional("AGENT_NAME", "Pi Agent"),
      pollIntervalMs: parseInt(optional("POLL_INTERVAL_MS", "2000"), 10),
    },
    llm: {
      provider: optional("DEFAULT_PROVIDER", "anthropic"),
      model: optional("DEFAULT_MODEL", "claude-sonnet-4-20250514"),
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      openaiKey: process.env.OPENAI_API_KEY,
      openrouterKey: process.env.OPENROUTER_API_KEY,
    },
    server: {
      port: parseInt(optional("PORT", "3978"), 10),
      host: optional("HOST", "127.0.0.1"),
    },
    workspace: { dir: workspaceDir, sessionDir, stateDir, cacheDir, agentDir, agentDirName },
    security: {
      allowedUsers: csvList("ALLOWED_USERS"),
      rateLimitPerHour: parseInt(optional("RATE_LIMIT_PER_HOUR", "60"), 10),
    },
    logLevel: optional("LOG_LEVEL", "info"),
  };
}
