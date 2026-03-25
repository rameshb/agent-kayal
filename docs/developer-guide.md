# Pi Teams Agent — Developer Guide

This guide helps contributors get set up, understand the architecture, develop with Claude Code, and deliver features.

## Prerequisites

- **Node.js >= 22.0.0** (check with `node -v`)
- **npm** (bundled with Node.js)
- **Git**
- **Claude Code CLI** (for AI-assisted development) — install via `npm install -g @anthropic-ai/claude-code`
- An LLM API key (Anthropic, OpenAI, or OpenRouter)
- An Azure AD App Registration (see [README](../README.md#3-azure-ad-setup))

## Local Setup

```bash
# Clone the repository
git clone <your-repo> pi-teams-agent
cd pi-teams-agent

# Install dependencies (also installs renderer deps via postinstall)
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Azure AD and LLM credentials
```

### Running in Development

```bash
# Full Electron app (builds TypeScript + renderer, then launches)
npm run dev

# Headless server only (with hot reload via tsx watch)
npm run dev:server

# Renderer only (Vite dev server with HMR on port 5173)
npm run dev:renderer
```

For frontend work, run `npm run dev:renderer` and `npm run dev:server` in separate terminals. The Vite dev server proxies API calls to the backend.

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript + build renderer |
| `npm run build:main` | Compile TypeScript only (backend + electron) |
| `npm run build:renderer` | Build React frontend only |
| `npm run clean` | Remove `dist/`, `release/`, `renderer/dist/` |
| `npm run dist` | Full build + package for all platforms |
| `npm run dist:mac` | Package for macOS (.dmg + .zip) |
| `npm run dist:win` | Package for Windows (.exe + portable) |
| `npm run dist:linux` | Package for Linux (.AppImage + .deb) |

## Architecture Deep Dive

### Component Overview

The application has three layers: **Electron shell**, **backend services**, and **React renderer**.

```
electron/main.ts          ← App lifecycle, window, tray, IPC handlers
       │
       ├─ src/server.ts   ← AgentServer: HTTP server, orchestrates all backend services
       │    ├─ src/graph/auth.ts       ← Azure AD / MSAL authentication
       │    ├─ src/graph/poller.ts     ← Teams message polling (Graph delta sync)
       │    ├─ src/graph/replier.ts    ← Send replies to Teams channels
       │    ├─ src/agent-runner.ts     ← Pi SDK agent execution wrapper
       │    ├─ src/session-store.ts    ← Per-user session persistence (JSONL)
       │    ├─ src/middleware/access-control.ts
       │    └─ src/middleware/rate-limiter.ts
       │
       └─ renderer/src/App.tsx  ← React dashboard (communicates via IPC)
```

### Data Flow: Teams Message to Reply

```
1. GraphPoller polls Graph API delta endpoint every 2s
2. New message detected → filters for @mention of AGENT_NAME
3. AgentServer.handleTeamsMessage() receives the message
4. Access control checks user's AAD Object ID against allowlist
5. Rate limiter checks sliding-window count for the user
6. SessionStore resolves a session reference (teams-<type>-<channelId>-<userId>)
7. AgentRunner.run() executes Pi SDK agent loop with:
   - The user's prompt (message text)
   - The session reference (for conversation history)
   - Custom tools + Pi skill tools
   - The configured LLM provider/model
8. Agent produces a response (may invoke tools during execution)
9. GraphReplier converts markdown → HTML, posts threaded reply to Teams
10. Event logged to circular buffer (visible in dashboard)
```

### Data Flow: Dashboard Chat

```
1. User types message in ChatView
2. POST /api/chat with { prompt, model: "provider/model" }
3. AgentServer creates/reuses a chat session
4. AgentRunner.run() executes (same as Teams flow)
5. Response streamed back via SSE text_delta events
6. ChatView renders streamed markdown
```

### Key Design Patterns

- **EventEmitter pattern** — `GraphAuth`, `GraphPoller`, and `AgentRunner` extend EventEmitter for decoupled communication
- **Session isolation** — Each user/channel combination gets its own JSONL session file, preventing cross-contamination
- **Delta sync** — GraphPoller persists delta links to `workspace/.graph-state/` so polling resumes efficiently after restarts
- **Abort signals** — Agent runs accept `AbortController` signals for cancellation of long-running operations
- **Circular log buffer** — 500-entry limit prevents unbounded memory growth in the dashboard log stream
- **Context-isolated IPC** — Renderer communicates with the main process exclusively through `electron/preload.ts` context bridge

### Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/server.ts` | ~641 | Core orchestration: HTTP routes, polling lifecycle, auth flow |
| `src/graph/poller.ts` | ~390 | Teams message polling with delta sync and deduplication |
| `src/agent-runner.ts` | ~222 | Pi SDK wrapper, tool registration, agent execution |
| `src/graph/auth.ts` | ~203 | MSAL device-code flow, token caching, silent re-auth |
| `electron/main.ts` | ~197 | Electron window, tray icon, IPC handler registration |
| `src/graph/replier.ts` | ~125 | Markdown-to-HTML conversion, threaded Teams replies |
| `src/config.ts` | ~108 | Environment variable loading and validation |
| `src/tools/custom-tools.ts` | ~107 | Example custom tools (HTTP request, current time) |
| `src/session-store.ts` | ~89 | Session ID generation, JSONL file management |
| `src/middleware/access-control.ts` | ~65 | AAD Object ID allowlist enforcement |
| `src/middleware/rate-limiter.ts` | ~50 | Sliding-window per-user rate limiting |
| `electron/preload.ts` | ~52 | IPC context bridge API surface |

### Workspace Layout (Runtime)

These directories are created automatically at runtime:

```
workspace/
├── my_pi_agent/           # Agent sandbox (file ops scoped here)
│   ├── AGENTS.md          # Agent system prompt (edit to change behavior)
│   ├── MEMORY.md          # Persistent cross-session memory
│   └── skills/            # Installed Pi skill packages
├── .sessions/             # JSONL session files (per user/channel)
├── .graph-state/          # Delta link persistence for polling
└── .auth/                 # MSAL token cache
    └── msal-cache.json
```

## Developing with Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is an AI-powered CLI that understands your codebase and helps you write, debug, and refactor code. It's the recommended way to develop on this project.

### Getting Started with Claude Code

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Launch in the project root
cd pi-teams-agent
claude
```

Claude Code will read the project structure, understand the codebase, and help you with development tasks conversationally.

### Common Development Workflows

#### Adding a New Custom Tool

```
You: "Add a new agent tool called 'jira_lookup' that fetches a Jira issue by key"
```

Claude Code will:
1. Read `src/tools/custom-tools.ts` to understand the existing pattern
2. Create the tool following the `AgentTool` interface
3. Register it in `getCustomTools()`

#### Adding a New API Endpoint

```
You: "Add a GET /api/stats endpoint that returns message counts per channel"
```

Claude Code will:
1. Read `src/server.ts` to understand the route registration pattern
2. Add the endpoint handler
3. Update the IPC bridge in `electron/preload.ts` if the dashboard needs it

#### Modifying the Dashboard

```
You: "Add a new view that shows a graph of messages over time"
```

Claude Code will:
1. Read existing views to understand the pattern
2. Create a new view component in `renderer/src/views/`
3. Add navigation in `Sidebar.tsx` and routing in `App.tsx`

#### Debugging Issues

```
You: "The poller stops after a few minutes. Help me debug."
```

Claude Code will:
1. Read `src/graph/poller.ts` to understand the polling loop
2. Identify potential failure points (token expiry, error handling, delta link issues)
3. Suggest fixes or add logging

### Claude Code Tips for This Project

- **Start broad, then narrow** — Ask Claude Code to explain a component before modifying it
- **Use slash commands** — `/commit` to create well-formatted commits, `/review-pr` to review changes
- **Reference files explicitly** — "In `src/graph/poller.ts`, fix the error handling in the poll loop"
- **Iterate** — If the first approach doesn't work, describe what went wrong and Claude Code will adjust
- **Let it explore** — For unfamiliar areas, ask "How does the session store work?" before making changes

### CLAUDE.md

If you create a `CLAUDE.md` file in the project root, Claude Code reads it automatically on every session. Use it for:

- Project-specific conventions (naming, patterns, formatting)
- Common commands (how to run tests, build, deploy)
- Areas that need special attention or have known quirks
- Links to relevant design docs or architecture decisions

Example:

```markdown
# CLAUDE.md

## Build & Run
- `npm run dev` — full Electron app
- `npm run dev:server` — headless with hot reload
- Node >= 22 required

## Conventions
- All Graph API code goes in src/graph/
- Custom tools go in src/tools/custom-tools.ts
- Use pino logger (import from src/logger.ts), never console.log
- Agent workspace is sandboxed — never reference paths outside workspace/

## Known Issues
- Delta sync occasionally returns stale messages — dedup via seenMessages Set
- MSAL token refresh can fail silently — check auth status in logs
```

## Adding Features

### Adding a Custom Tool

1. Open `src/tools/custom-tools.ts`
2. Define parameters using `Type.Object()` from `@mariozechner/pi-ai`
3. Implement the `AgentTool` interface:

```typescript
const params = Type.Object({
  issueKey: Type.String({ description: "Jira issue key like PROJ-123" }),
});

export const jiraLookup: AgentTool<typeof params> = {
  name: "jira_lookup",
  label: "Jira Lookup",
  description: "Fetches a Jira issue by its key.",
  parameters: params,
  execute: async (_id, params, signal, onUpdate) => {
    const response = await fetch(`https://jira.example.com/rest/api/2/issue/${params.issueKey}`, {
      signal,
      headers: { Authorization: `Bearer ${process.env.JIRA_TOKEN}` },
    });
    const issue = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
    };
  },
};
```

4. Register it in `getCustomTools()` by adding it to the returned array
5. Add any required environment variables to `.env.example`

### Adding a Dashboard View

1. Create `renderer/src/views/MyView.tsx`:

```tsx
export function MyView() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My View</h1>
      {/* Your content */}
    </div>
  );
}
```

2. Add navigation in `renderer/src/components/Sidebar.tsx`
3. Add route in `renderer/src/App.tsx`
4. If the view needs backend data, add an API endpoint in `src/server.ts` and expose it through `electron/preload.ts`

### Adding an API Endpoint

1. In `src/server.ts`, find the route registration section in the `AgentServer` class
2. Add your handler:

```typescript
// In the setupRoutes method or equivalent
if (url.pathname === '/api/stats' && req.method === 'GET') {
  const stats = this.getStats(); // your logic
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats));
  return;
}
```

3. If the dashboard needs to call it, add an IPC handler in `electron/main.ts` and expose it in `electron/preload.ts`

### Modifying the Agent's Behavior

The agent's system prompt and rules live in `workspace/my_pi_agent/AGENTS.md`. Edit this file to:

- Change the agent's persona or tone
- Add domain-specific instructions
- Define rules for tool usage
- Set boundaries for what the agent should/shouldn't do

Changes take effect on the next agent invocation (no restart needed).

## Testing

The project is in early development and does not yet have a formal test suite. Here are approaches for manual and integration testing:

### Manual Testing

**Health check:**
```bash
curl http://localhost:3978/health
```

**Auth status:**
```bash
curl http://localhost:3978/api/auth
```

**Chat endpoint (after authentication):**
```bash
curl -X POST http://localhost:3978/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, what can you do?", "model": "anthropic/claude-sonnet-4-20250514"}'
```

**Session listing:**
```bash
curl http://localhost:3978/api/sessions
```

### Testing the Polling Loop

1. Start the server with `LOG_LEVEL=debug` in `.env`
2. Send a message in a Teams channel @mentioning the agent
3. Watch the terminal/dashboard logs for:
   - `poll: checking for new messages`
   - `poll: new message from <user>`
   - `agent: running for session <id>`
   - `reply: sent to <channel>`

### Testing Custom Tools

1. Add your tool to `getCustomTools()`
2. Start the server
3. In the dashboard Chat view, ask the agent to use your tool by name
4. Check logs for `tool_start` and `tool_done` events

### Adding Automated Tests

When adding tests, consider:

- **Unit tests** for pure functions (config parsing, session ID generation, rate limiter logic)
- **Integration tests** for the agent runner (mock the LLM, verify tool execution)
- **E2E tests** for the API endpoints (start server, hit endpoints, verify responses)

## Docker

The included `Dockerfile` builds a headless (no Electron) image:

```bash
# Build
docker build -t pi-teams-agent .

# Run
docker run -d \
  --env-file .env \
  -p 3978:3978 \
  --name pi-teams-agent \
  pi-teams-agent
```

The container:
- Uses a multi-stage build (builder + slim runtime)
- Runs as a non-root `agent` user
- Exposes port 3978
- Includes a health check hitting `/health` every 30 seconds
- Copies the `workspace/` directory for agent configuration

## Delivering Features

### Branch Strategy

1. Create a feature branch from `main`
2. Make your changes
3. Test manually (and with any automated tests)
4. Commit with clear, descriptive messages
5. Open a pull request against `main`

### Commit Guidelines

- Use imperative mood: "Add jira_lookup tool" not "Added jira_lookup tool"
- First line under 72 characters
- Body explains *why*, not just *what*
- Reference issues if applicable

### Using Claude Code for PRs

```bash
# Stage your changes, then:
claude

# Inside Claude Code:
You: /commit
# Claude Code will analyze changes and create a well-formatted commit

You: "Create a PR for this feature"
# Claude Code will push and create the PR with a summary
```

### Checklist Before Submitting

- [ ] Code compiles: `npm run build` succeeds
- [ ] Manual testing done for the changed functionality
- [ ] New environment variables added to `.env.example` with comments
- [ ] `AGENTS.md` updated if agent behavior changed
- [ ] No secrets or API keys committed
- [ ] README or docs updated if user-facing behavior changed
