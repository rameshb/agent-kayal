# Pi Teams Agent — User Guide

This guide covers what Pi Teams Agent does, how to use it, and what you can accomplish with it.

## What Is Pi Teams Agent?

Pi Teams Agent is a desktop application that brings an AI assistant into your Microsoft Teams channels. When you @mention the agent in any channel it monitors, it reads your message, processes it through a large language model (Claude, GPT-4, or others), and replies in a threaded message — all within Teams.

The agent runs on your desktop (or a server) and connects to Teams via Microsoft Graph API. It is not a cloud-hosted bot — you control where it runs, which LLM it uses, and who can interact with it.

## Key Capabilities

### Teams Integration

- **Channel monitoring** — The agent auto-discovers every team and channel your signed-in account belongs to. No manual channel configuration needed.
- **@mention activation** — The agent only responds when explicitly @mentioned by name, so it never interrupts organic conversation.
- **Threaded replies** — Responses are posted as replies to the original message, keeping channels organized.
- **Session memory** — The agent maintains per-user, per-channel conversation history. It remembers context from earlier messages in the same thread.

### AI Chat (Dashboard)

The desktop app includes a built-in chat interface separate from Teams:

- Talk directly with the LLM without going through Teams
- Switch between available models at runtime (Claude, GPT-4, OpenRouter models)
- Useful for testing prompts, quick questions, or tasks that don't need to go through a Teams channel

### Agent Tools

The AI agent has access to tools that let it take actions beyond generating text:

| Tool | What It Does |
|------|-------------|
| **File read/write/edit** | Read, create, and modify files within the agent workspace |
| **Bash commands** | Execute shell commands (sandboxed to the workspace) |
| **HTTP requests** | Fetch data from URLs and APIs |
| **Current time** | Get the current date and time |
| **Pi Skills** | Extensible skill system — see below |

### Pi Skills (Extensions)

Skills extend the agent with domain-specific capabilities:

- **Microsoft 365** — Read/send email, manage calendar events, access OneDrive files, manage contacts and tasks via Outlook
- **Brave Search** — Web search powered by the Brave Search API
- **Browser Tools** — Automated browser interaction and scraping
- **Transcription** — Audio transcription

Skills can be installed from npm, git, or cloned directly into the workspace. The dashboard's **Packages** view provides a UI for managing installed skills.

### Workspace & Memory

The agent operates within a sandboxed workspace directory (`workspace/my_pi_agent/`). Inside this workspace:

- **MEMORY.md** — A persistent memory file the agent reads at the start of every conversation. It stores facts about users, preferences, and key decisions. The agent updates this file as it learns.
- **skills/** — Installed Pi skill packages
- **daily/** — Optional daily work logs if you request them

The workspace sandbox means the agent cannot access files outside its designated directory — an important security boundary.

## Using the Desktop App

### First Launch

1. Launch the app (`npm run dev` or the packaged application)
2. The dashboard opens showing a **Sign In** prompt
3. You'll see a device code and a URL — visit the URL in any browser, enter the code, and sign in with your Microsoft account
4. Once authenticated, the agent server starts automatically
5. Tokens are cached locally so you won't need to repeat this on subsequent launches

### Dashboard View

The main dashboard shows:

- **Server status** — Running/stopped indicator
- **Uptime** — How long the agent has been running
- **Authentication status** — Current sign-in state
- **Live activity log** — A real-time stream of events: messages received, agent actions, errors, and system events

Use the **Start** / **Stop** controls to manage the agent server.

### Chat View

The Chat view lets you talk directly to the LLM:

- Type messages in the input box and press Enter
- Select different models from the dropdown (e.g., `anthropic/claude-sonnet-4-20250514`)
- The chat uses the same agent engine as Teams — including tools and skills
- Conversations are session-based and maintain context

### Sessions View

View and manage active sessions:

- Each Teams user/channel combination gets its own session
- Sessions store conversation history in JSONL format
- Use this view to inspect or clear session data

### Packages View

Install, view, and remove Pi skill packages:

- Install skills from npm or git sources
- View currently installed packages
- Remove packages you no longer need

### Tray Behavior

When you close the app window, it minimizes to the system tray. The agent keeps running in the background, monitoring Teams and responding to @mentions. Click the tray icon to reopen the dashboard.

To fully quit the app, use the tray icon's context menu or quit from the application menu.

## Interacting via Teams

### Basic Usage

1. Go to any Teams channel the agent is monitoring
2. Type a message and @mention the agent by its configured name (default: `Pi Agent`)
3. The agent processes your message and replies in the thread

### What You Can Ask

- **Questions** — "What's the status of project X?" (if context is in the workspace)
- **File tasks** — "Create a summary document from these notes" / "Read the contents of report.md"
- **Research** — "Search the web for recent news about [topic]" (requires Brave Search skill)
- **Email/Calendar** — "Check my calendar for tomorrow" / "Draft an email to [person]" (requires MS365 skill)
- **Analysis** — "Analyze this data and create a chart" / "Summarize the key points from [file]"
- **Automation** — "Run the build script and tell me if it passes"

### Tips

- **Be specific** — The more context you provide, the better the response
- **Multi-step tasks** — The agent will outline its plan before executing complex tasks
- **Destructive operations** — The agent will ask for confirmation before deleting files, sending emails, or creating calendar events
- **Markdown formatting** — Responses use markdown (bold, lists, code blocks) for readability in Teams
- **Session context** — The agent remembers prior messages in the same thread, so you can have multi-turn conversations

## Security Model

Pi Teams Agent is designed with several security layers:

| Layer | Protection |
|-------|-----------|
| **Authentication** | Azure AD device-code flow — only your Microsoft account can authorize the agent |
| **User allowlist** | `ALLOWED_USERS` restricts which AAD users can trigger the agent |
| **Rate limiting** | Default 60 agent actions per user per hour prevents abuse |
| **Workspace sandbox** | Agent file operations cannot escape `workspace/my_pi_agent/` |
| **Localhost binding** | The HTTP server only listens on `127.0.0.1` by default |
| **Context isolation** | The Electron renderer has no access to Node.js APIs |

### Important Notes

- The agent runs under **your** Microsoft account. It can read any channel you have access to.
- LLM API keys are stored in your local `.env` file — treat it like a password.
- The MSAL token cache (`workspace/.auth/msal-cache.json`) contains refresh tokens — protect this file.
- In production, always set `ALLOWED_USERS` to restrict who can interact with the agent.

## Configuration Reference

All configuration is done via environment variables in the `.env` file:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_CLIENT_ID` | Yes | — | Azure AD app registration client ID |
| `AZURE_TENANT_ID` | Yes | — | Azure AD directory (tenant) ID |
| `AGENT_NAME` | No | `Pi Agent` | Display name for @mention detection |
| `ANTHROPIC_API_KEY` | One of three | — | Anthropic API key |
| `OPENAI_API_KEY` | One of three | — | OpenAI API key |
| `OPENROUTER_API_KEY` | One of three | — | OpenRouter API key |
| `DEFAULT_PROVIDER` | No | `anthropic` | LLM provider to use |
| `DEFAULT_MODEL` | No | `claude-sonnet-4-20250514` | LLM model identifier |
| `PORT` | No | `3978` | HTTP server port |
| `HOST` | No | `127.0.0.1` | HTTP server bind address |
| `POLL_INTERVAL_MS` | No | `2000` | Teams polling interval in milliseconds |
| `ALLOWED_USERS` | No | — | Comma-separated AAD Object IDs |
| `RATE_LIMIT_PER_HOUR` | No | `60` | Max agent actions per user per hour (0 = unlimited) |
| `WORKSPACE_DIR` | No | `./workspace` | Root workspace directory |
| `AGENT_WORKSPACE_NAME` | No | `my_pi_agent` | Agent sandbox directory name |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

## Troubleshooting

### Agent not responding to @mentions

- Verify the `AGENT_NAME` in `.env` matches exactly how the agent is mentioned in Teams
- Check the dashboard's live log for incoming message events
- Confirm the user's AAD Object ID is in `ALLOWED_USERS` (if set)
- Ensure the polling is running — dashboard should show "polling started"

### Authentication fails or expires

- Delete `workspace/.auth/msal-cache.json` and re-authenticate
- Verify `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` are correct
- Ensure "Allow public client flows" is enabled in the Azure AD app registration
- Check that the required Graph API permissions have admin consent

### Rate limit errors

- Default is 60 actions per user per hour
- Increase `RATE_LIMIT_PER_HOUR` in `.env` or set to `0` for unlimited
- Rate limits reset on a sliding window — wait for the window to expire

### LLM errors

- Verify your API key is correct and has sufficient credits/quota
- Check `DEFAULT_PROVIDER` matches the API key you provided
- Review the dashboard logs for specific error messages from the LLM provider
