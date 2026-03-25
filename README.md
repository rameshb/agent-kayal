# pi-teams-agent

Desktop AI agent runtime for Microsoft Teams, built on [Pi SDK](https://github.com/badlogic/pi-mono) + Electron.

Takes the best parts of OpenClaw's architecture — Pi's agent loop, multi-provider LLM, session persistence, tool execution, and skills — and pairs them with a focused Teams integration in a desktop app.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron App                               │
│  ┌─────────────────────────────────────────┐│
│  │  Main Process                           ││
│  │  ├─ AgentServer (HTTP :3978)            ││
│  │  │  ├─ POST /api/messages  (Bot FW)     ││
│  │  │  └─ GET  /health                     ││
│  │  ├─ Middleware                           ││
│  │  │  ├─ Access Control (AAD allowlist)   ││
│  │  │  └─ Rate Limiter                     ││
│  │  ├─ TeamsPiBot → AgentRunner            ││
│  │  │  ├─ pi-coding-agent (sessions/tools) ││
│  │  │  ├─ pi-agent-core (agent loop)       ││
│  │  │  └─ pi-ai (multi-provider LLM)      ││
│  │  └─ Tray icon + lifecycle management    ││
│  ├──────────────────────────────────────────┤│
│  │  Renderer (Dashboard)                   ││
│  │  ├─ Status / uptime / model info        ││
│  │  ├─ Start / Stop controls               ││
│  │  └─ Live activity log stream            ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
         ↕  IPC (context-isolated)
         ↕
    Microsoft Teams (Bot Framework webhook)
```

## Quick Start

### 1. Install

```bash
git clone <your-repo> pi-teams-agent
cd pi-teams-agent
npm install
```

### 2. Azure Bot Setup

1. [Azure Portal](https://portal.azure.com) → Create resource → **Azure Bot** (Single Tenant)
2. Note **App (client) ID** from Overview
3. App Registrations → your bot → Certificates & secrets → New client secret → copy value
4. Note **Directory (tenant) ID**
5. Bot resource → Configuration → set messaging endpoint: `https://<your-domain>/api/messages`
6. Channels → Add **Microsoft Teams**

### 3. Configure

```bash
cp .env.example .env
# Fill in TEAMS_APP_ID, TEAMS_APP_SECRET, TEAMS_TENANT_ID
# Fill in your LLM API key (ANTHROPIC_API_KEY or OPENAI_API_KEY)
```

### 4. Tunnel (for development)

```bash
ngrok http 3978
# Copy the HTTPS URL → update Azure Bot messaging endpoint
```

### 5. Run

```bash
# Desktop app (Electron)
npm run dev

# Or headless (no GUI, server only)
npx tsx src/server.ts
```

### 6. Package for distribution

```bash
npm run dist          # All platforms
npm run dist:mac      # macOS .dmg
npm run dist:win      # Windows .exe
npm run dist:linux    # Linux .AppImage
```

Outputs go to `release/`.

## Project Structure

```
pi-teams-agent/
├── electron/
│   ├── main.ts              # Electron main process + tray + IPC
│   └── preload.ts           # Context bridge (renderer ↔ main)
├── renderer/
│   ├── index.html           # Dashboard UI
│   ├── app.js               # Dashboard logic
│   └── types.d.ts           # Window.agentAPI types
├── src/
│   ├── server.ts            # AgentServer class (start/stop/events)
│   ├── config.ts            # Env-based configuration
│   ├── logger.ts            # Structured logging (pino)
│   ├── agent-runner.ts      # Pi SDK wrapper
│   ├── session-store.ts     # Per-user session management
│   ├── teams-bot.ts         # Teams Bot Framework handler
│   ├── middleware/
│   │   ├── access-control.ts
│   │   └── rate-limiter.ts
│   └── tools/
│       └── custom-tools.ts  # Domain-specific agent tools
├── workspace/
│   └── AGENTS.md            # Agent identity + instructions
├── .env.example
├── package.json
└── tsconfig.json
```

## Two Run Modes

**Desktop (Electron):** `npm run dev` — launches the dashboard window with start/stop controls, live log stream, and tray icon. The agent server runs inside Electron's main process. Closing the window minimizes to tray; the agent keeps running.

**Headless:** `npx tsx src/server.ts` — runs the webhook server standalone, no GUI. Use this for production servers, Docker, or CI. The Dockerfile is included for container deployments.

## Installing Pi Skills

Pi's package system works directly:

```bash
# Install from npm
pi install npm:@foo/pi-tools

# Install from git
pi install git:github.com/badlogic/pi-skills

# Official skills (browser, Google Calendar/Drive/Gmail, etc.)
git clone https://github.com/badlogic/pi-skills workspace/skills/pi-skills
```

Skills are loaded from the workspace directory and available to the agent on demand.

## Adding Custom Tools

Add tools in `src/tools/custom-tools.ts` following Pi's `AgentTool` interface:

```typescript
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const params = Type.Object({
  query: Type.String({ description: "What to look up" }),
});

export const myTool: AgentTool<typeof params> = {
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful.",
  parameters: params,
  execute: async (_id, params, signal, onUpdate) => {
    return {
      content: [{ type: "text", text: `Result: ${params.query}` }],
    };
  },
};
```

Then add it to `getCustomTools()`.

## Security

- **Context isolation:** Renderer cannot access Node.js or Electron APIs
- **Localhost binding:** Webhook server binds to 127.0.0.1 by default
- **Allowlists:** `ALLOWED_USERS` (AAD Object IDs) and `ALLOWED_TEAMS` in production
- **Rate limiting:** Default 60 actions/user/hour
- **Workspace scoping:** Pi tools operate within the workspace directory
- **No skill marketplace:** No untrusted skill loading surface
- **Tray persistence:** Agent keeps running when window is closed

## Roadmap

- [ ] MCP support (via mcporter or native tool wrapper)
- [ ] Outlook email integration (IMAP/SMTP or Graph API)
- [ ] Multi-agent routing (per-team agent isolation)
- [ ] Auto-update (electron-updater)
- [ ] Migrate to Tauri for smaller bundle size

## License

MIT
