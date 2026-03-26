# CLAUDE.md

This file provides guidance for Claude Code when working on the Pi Teams Agent project.

## Project Overview

Pi Teams Agent is a desktop AI agent runtime that connects to Microsoft Teams via Graph API polling. Users @mention the agent in Teams channels/DMs, the desktop app detects it, runs the Pi coding agent, and posts a reply back. The desktop app (Electron) serves as the control plane with a React UI for chat, session management, packages, and monitoring.

## Architecture

```
Microsoft Teams (cloud)
    ↑↓ Graph API (outbound HTTPS only, no webhook)
Desktop App (Electron)
    ├─ Graph Poller (delta queries every 2s)
    ├─ @mention detector
    ├─ Pi Agent Runner (pi-coding-agent SDK)
    ├─ Graph Replier (posts replies via Graph API)
    ├─ HTTP Server (:3978) for desktop chat UI
    └─ Renderer (Vite + React + Tailwind v4 + AI SDK)
```

## Tech Stack

- **Runtime**: Node.js 22+, TypeScript, ESM modules
- **Desktop**: Electron 33+
- **Agent**: Pi SDK (`@mariozechner/pi-coding-agent`, `pi-agent-core`, `pi-ai`)
- **Chat UI**: Vercel AI SDK 5 (`ai`, `@ai-sdk/react`), React 19, Vite 6, Tailwind CSS v4
- **Teams**: Microsoft Graph API via `@microsoft/microsoft-graph-client`, MSAL device code auth
- **LLM**: Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), OpenRouter
- **Logging**: Pino

## Project Structure

```
pi-teams-agent/
├── electron/              # Electron main process + preload
│   ├── main.ts            # App lifecycle, tray, IPC handlers
│   └── preload.ts         # Context bridge (renderer ↔ main)
├── renderer/              # Vite React app (separate package.json)
│   ├── src/
│   │   ├── App.tsx        # Root with sidebar navigation
│   │   ├── components/    # Sidebar, ChatMessage
│   │   └── views/         # ChatView, SessionsView, PackagesView, DashboardView
│   ├── package.json       # Renderer deps (@ai-sdk/react, lucide-react, etc.)
│   └── vite.config.ts
├── src/                   # Backend (runs in Electron main process)
│   ├── server.ts          # AgentServer class — HTTP + Graph polling + agent
│   ├── config.ts          # Env-based config loader
│   ├── agent-runner.ts    # Pi SDK wrapper with sandbox enforcement
│   ├── session-store.ts   # Per-user session management
│   ├── graph/             # Microsoft Graph API integration
│   │   ├── auth.ts        # MSAL device code flow + token cache
│   │   ├── poller.ts      # Delta query polling for new messages
│   │   ├── replier.ts     # Post replies back to Teams
│   │   └── types.ts       # Graph API type definitions
│   ├── middleware/         # Access control, rate limiter
│   └── tools/             # Custom Pi agent tools
├── workspace/
│   └── my_pi_agent/       # Sandboxed agent workspace
│       ├── AGENTS.md      # Agent system prompt
│       ├── MEMORY.md      # Persistent cross-session memory
│       └── skills/ms365/  # Microsoft 365 skill
├── scripts/
│   └── setup-packages.sh  # Installs default Pi packages
├── docs/screenshots/      # UI screenshots for README
└── package.json           # Root deps + Electron builder config
```

## Build Commands

```bash
npm install              # Install all deps (auto-installs renderer)
npm run setup            # Full setup: install + packages
npm run build            # TypeScript + Vite renderer
npm run dev              # Build + launch Electron
npm run dev:server       # Run backend only (no Electron)
npm run dev:renderer     # Vite dev server with HMR
npm run dist:mac         # Package macOS .dmg
npm run dist:win         # Package Windows .exe
npm run dist:linux       # Package Linux .AppImage
```

## Key Design Decisions

1. **Graph API over Bot Framework**: No inbound webhooks, no tunnel, no public URL. Everything is outbound HTTPS. The desktop app polls Teams via delta queries.

2. **Pi coding agent as the agent core**: Built-in tools (read, write, edit, bash), session persistence (JSONL), extensions, and skills system. NOT a custom agent loop.

3. **Workspace sandboxing**: The agent's `cwd` is restricted to `workspace/my_pi_agent/` (configurable via `AGENT_WORKSPACE_NAME`). Pi's sandbox settings enforce this.

4. **Vercel AI SDK for desktop chat**: `useChat` hook with streaming, model selection via body params, reasoning traces via `sendReasoning: true`.

5. **@mention activation**: In channels, the bot only processes messages where it's @mentioned. DMs would always activate (not yet implemented with Graph API).

## Important Patterns

### Adding a new IPC handler
1. Add the handler in `electron/main.ts` under `setupIPC()`
2. Expose it in `electron/preload.ts` via `contextBridge`
3. Add the TypeScript type to the `window.agentAPI` declaration in `renderer/src/App.tsx`
4. Call it from the renderer via `window.agentAPI.newMethod()`

### Adding a new HTTP endpoint
Add the route in `src/server.ts` inside the `createServer` handler, following the existing pattern (CORS headers are set globally).

### Adding a custom Pi tool
Create in `src/tools/custom-tools.ts` following the `AgentTool` interface from `@mariozechner/pi-agent-core`. Add to the `getCustomTools()` array.

### Adding a new renderer view
1. Create `renderer/src/views/NewView.tsx`
2. Add to the `View` type union in `App.tsx`
3. Add nav item in `components/Sidebar.tsx`
4. Add route in `App.tsx` render

## Environment Variables

Required: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and at least one LLM API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`).

See `.env.example` for all options.

## Testing

No test framework is set up yet. Priority areas for tests:
- `src/graph/poller.ts` — message filtering, @mention detection, delta link persistence
- `src/graph/replier.ts` — markdown-to-HTML conversion
- `src/middleware/rate-limiter.ts` — sliding window logic
- `src/session-store.ts` — session ID generation, filesystem operations

## Common Issues

- **Renderer not loading in Electron**: Run `npm run build:renderer` first. Electron loads from `renderer/dist/`.
- **TypeScript errors**: The root `tsconfig.json` includes both `src/` and `electron/`. The renderer has its own `tsconfig.json`.
- **Graph API 403**: Check that Azure AD app permissions include `ChannelMessage.Read.All` and admin consent is granted.
- **Pi tools not working**: Ensure `pi` CLI is on PATH (`npm install -g @mariozechner/pi-coding-agent`).
