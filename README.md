# Pi Teams Agent

Desktop AI agent runtime for Microsoft Teams, built on [Pi SDK](https://github.com/badlogic/pi-mono) + Electron.

Takes the best parts of OpenClaw's architecture — Pi's agent loop, multi-provider LLM, session persistence, tool execution, and skills — and pairs them with a focused Teams integration in a desktop app.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron App                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Main Process (Node.js)                                │  │
│  │  ├─ AgentServer (HTTP :3978)                           │  │
│  │  │  ├─ POST /api/messages   (Teams handler)            │  │
│  │  │  ├─ POST /api/chat       (Dashboard LLM chat)       │  │
│  │  │  ├─ GET  /api/sessions   (Session listing)          │  │
│  │  │  ├─ GET  /api/auth       (Auth status)              │  │
│  │  │  ├─ *    /api/packages   (Skill management)         │  │
│  │  │  └─ GET  /health                                    │  │
│  │  ├─ GraphAuth (Azure AD / MSAL device-code flow)       │  │
│  │  ├─ GraphPoller (Teams delta-sync message polling)     │  │
│  │  ├─ GraphReplier (Threaded replies to Teams)           │  │
│  │  ├─ AgentRunner (Pi SDK agent loop)                    │  │
│  │  │  ├─ pi-agent-core  (agent loop)                     │  │
│  │  │  ├─ pi-coding-agent (sessions / tools)              │  │
│  │  │  └─ pi-ai (multi-provider LLM)                      │  │
│  │  ├─ Middleware                                          │  │
│  │  │  ├─ Access Control (AAD allowlist)                  │  │
│  │  │  └─ Rate Limiter (sliding window)                   │  │
│  │  └─ Tray icon + lifecycle management                   │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Renderer (React Dashboard)                            │  │
│  │  ├─ DashboardView  (status, uptime, live logs)         │  │
│  │  ├─ ChatView       (direct LLM chat interface)         │  │
│  │  ├─ SessionsView   (session management)                │  │
│  │  └─ PackagesView   (Pi skill installer)                │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         ↕  IPC (context-isolated)
         ↕
    Microsoft Teams (Graph API polling + replies)
         ↕
    Azure AD / Entra (Device Code auth via MSAL)
```

## Quick Start

### 1. Prerequisites

- **Node.js >= 22.0.0**
- An **Azure AD App Registration** (see step 2)
- At least one LLM API key (Anthropic, OpenAI, or OpenRouter)

### 2. Install

```bash
git clone <your-repo> pi-teams-agent
cd pi-teams-agent
npm install          # also installs renderer dependencies via postinstall
```

### 3. Azure AD Setup

1. [Azure Portal](https://portal.azure.com) > **Azure AD** > **App registrations** > **New registration**
2. Set **Supported account types** to *Single tenant*
3. Under **Authentication** > **Advanced settings**, enable **Allow public client flows** (required for device-code flow)
4. Note the **Application (client) ID** and **Directory (tenant) ID**
5. Under **API permissions**, add Microsoft Graph delegated permissions:
   - `ChannelMessage.Read.All`
   - `ChannelMessage.Send`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `User.Read`
6. Grant admin consent for your organization

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
AZURE_CLIENT_ID=your-app-client-id
AZURE_TENANT_ID=your-directory-tenant-id
ANTHROPIC_API_KEY=sk-ant-...          # or OPENAI_API_KEY / OPENROUTER_API_KEY
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-20250514
AGENT_NAME="Pi Agent"                 # name used for @mention detection
```

See [`.env.example`](.env.example) for all available options.

### 5. Run

```bash
# Desktop app (Electron dashboard + agent server)
npm run dev

# Or headless (no GUI, server only — for Docker/CI/production)
npm run dev:server
```

### 6. Authenticate

On first launch, the dashboard will display a device-code prompt. Visit the URL shown, enter the code, and sign in with your Microsoft account. Tokens are cached locally for subsequent launches.

### 7. Package for Distribution

```bash
npm run dist          # All platforms
npm run dist:mac      # macOS .dmg + .zip
npm run dist:win      # Windows .exe + portable
npm run dist:linux    # Linux .AppImage + .deb
```

Outputs go to `release/`.

## Project Structure

```
pi-teams-agent/
├── electron/
│   ├── main.ts                    # Electron lifecycle, window, tray, IPC
│   └── preload.ts                 # Context bridge (renderer ↔ main)
├── renderer/
│   └── src/
│       ├── App.tsx                # Main app shell with sidebar navigation
│       ├── views/
│       │   ├── DashboardView.tsx  # Server status, uptime, live log stream
│       │   ├── ChatView.tsx       # Direct LLM chat interface
│       │   ├── SessionsView.tsx   # Session management
│       │   └── PackagesView.tsx   # Pi skill package installer
│       └── components/
│           ├── Sidebar.tsx        # Navigation sidebar
│           └── ChatMessage.tsx    # Chat message component
├── src/
│   ├── server.ts                  # AgentServer class (HTTP, polling, auth)
│   ├── config.ts                  # Environment configuration loading
│   ├── logger.ts                  # Structured logging (pino)
│   ├── agent-runner.ts            # Pi SDK wrapper for agent execution
│   ├── session-store.ts           # Per-user session persistence (JSONL)
│   ├── graph/
│   │   ├── auth.ts                # Azure AD / MSAL device-code authentication
│   │   ├── poller.ts              # Teams message polling via Graph delta sync
│   │   ├── replier.ts            # Send threaded replies back to Teams
│   │   └── types.ts               # Graph API TypeScript definitions
│   ├── middleware/
│   │   ├── access-control.ts      # AAD allowlist-based access control
│   │   └── rate-limiter.ts        # Sliding-window rate limiting
│   └── tools/
│       └── custom-tools.ts        # Custom agent tools (HTTP, time, etc.)
├── workspace/
│   └── my_pi_agent/               # Agent sandbox directory
│       ├── AGENTS.md              # Agent system prompt & rules
│       ├── MEMORY.md              # Persistent memory across sessions
│       └── skills/
│           └── ms365/SKILL.md     # Microsoft 365 skill documentation
├── scripts/
│   └── setup-packages.sh          # Pi skill setup helper
├── .env.example                   # Configuration template
├── Dockerfile                     # Multi-stage Docker build (headless)
├── package.json
└── tsconfig.json
```

## Two Run Modes

**Desktop (Electron):** `npm run dev` — launches the React dashboard with start/stop controls, direct chat, session management, skill installer, and a live log stream. The agent server runs inside Electron's main process. Closing the window minimizes to tray; the agent keeps running in the background.

**Headless:** `npm run dev:server` — runs the agent server standalone, no GUI. Use for production servers, Docker, or CI. The included Dockerfile provides a multi-stage build with health checks and a non-root user.

## How It Works

1. **Authentication** — On launch, the app authenticates with Azure AD via MSAL device-code flow. Tokens are cached locally in `workspace/.auth/msal-cache.json` for silent re-auth on subsequent launches.

2. **Channel Discovery** — GraphPoller auto-discovers all Teams and channels the authenticated user belongs to.

3. **Message Polling** — Every 2 seconds (configurable), the poller uses Microsoft Graph delta-sync to efficiently check for new messages. Only messages that @mention the agent name are processed.

4. **Access & Rate Control** — Incoming messages are checked against the AAD allowlist and per-user rate limits before reaching the agent.

5. **Agent Execution** — The message is routed to AgentRunner, which resolves a per-user session (JSONL-based), then runs Pi SDK's agent loop with the configured LLM and available tools.

6. **Reply** — The agent's response is converted from markdown to HTML and posted as a threaded reply in the originating Teams channel.

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

Skills are loaded from the workspace directory and available to the agent. You can also manage skills from the **Packages** view in the dashboard.

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

Then register it in `getCustomTools()`.

## Security

- **Context isolation:** Electron renderer has no access to Node.js or Electron APIs
- **Localhost binding:** Server binds to `127.0.0.1` by default
- **Allowlists:** `ALLOWED_USERS` accepts comma-separated AAD Object IDs
- **Rate limiting:** Sliding-window, default 60 actions/user/hour
- **Workspace scoping:** Agent file operations are sandboxed to `workspace/my_pi_agent/`
- **Token caching:** MSAL tokens cached locally with automatic refresh
- **Non-root Docker:** Container runs as unprivileged `agent` user

## Documentation

- **[User Guide](docs/user-guide.md)** — End-user documentation: features, capabilities, and day-to-day usage
- **[Developer Guide](docs/developer-guide.md)** — Setup, architecture deep-dive, working with Claude Code, testing, and delivering features

## Roadmap

- [ ] MCP support (via mcporter or native tool wrapper)
- [ ] Outlook email integration (IMAP/SMTP or Graph API)
- [ ] Multi-agent routing (per-team agent isolation)
- [ ] Auto-update (electron-updater)
- [ ] Migrate to Tauri for smaller bundle size

## License

MIT
