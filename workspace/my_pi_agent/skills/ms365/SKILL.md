---
name: ms365
description: Microsoft 365 integration for Outlook email, calendar, OneDrive, contacts, To Do, and Excel via the Softeria MS 365 MCP server. Use for any email, meeting, file, or task operations on Microsoft 365.
---

# Microsoft 365 Integration

This skill lets you interact with Microsoft 365 services (Outlook, Calendar, OneDrive, Contacts, To Do, Excel) through the `ms-365-mcp-server` CLI.

## Prerequisites

The MCP server must be installed globally and authenticated:
```bash
npm install -g @softeria/ms-365-mcp-server
npx @softeria/ms-365-mcp-server --org-mode --login
```

## How to Use

Run commands via bash using `npx @softeria/ms-365-mcp-server` with the `--preset` flag and pipe commands through stdin. However, the simplest approach is to use the **stdio JSON-RPC** interface.

For quick operations, use the CLI presets to scope which tools are loaded:

```bash
# List available presets
npx @softeria/ms-365-mcp-server --list-presets
# Available: mail, calendar, files, personal, work, excel, contacts, tasks, onenote, search, users, all
```

## Email Operations

### List recent emails
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-mail-messages","arguments":{"limit":10}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Read a specific email
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get-mail-message","arguments":{"message-id":"MESSAGE_ID"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Send an email
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send-mail","arguments":{"subject":"Subject here","body":"Email body content","to-recipients":"user@company.com"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Create a draft
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create-draft-email","arguments":{"subject":"Draft subject","body":"Draft content","to-recipients":"user@company.com"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

## Calendar Operations

### List upcoming events
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-calendar-events","arguments":{"limit":10}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Get calendar view (date range)
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get-calendar-view","arguments":{"start-date":"2026-03-25T00:00:00Z","end-date":"2026-03-26T23:59:59Z"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Create a calendar event
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create-calendar-event","arguments":{"subject":"Team Standup","start":"2026-03-26T09:00:00","end":"2026-03-26T09:30:00","attendees":"alice@company.com,bob@company.com","location":"Conference Room A"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

## OneDrive Operations

### List files in root
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-folder-files","arguments":{}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Download a file
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"download-onedrive-file-content","arguments":{"file-path":"/Documents/report.docx"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Upload a file
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"upload-file-content","arguments":{"file-path":"/Documents/output.md","content":"File content here"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

## Contacts

### List contacts
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-outlook-contacts","arguments":{"limit":20}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

## To Do Tasks

### List task lists
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-todo-task-lists","arguments":{}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

### Create a task
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create-todo-task","arguments":{"list-id":"LIST_ID","title":"Review PR #42","due-date":"2026-03-28"}}}' | npx -y @softeria/ms-365-mcp-server --org-mode 2>/dev/null | grep '"result"'
```

## Tips

- Always use `--org-mode` for work/school accounts
- Add `2>/dev/null` to suppress MCP server startup logs
- Parse JSON output with `jq` when available for cleaner results
- For multiple operations, chain them in a single bash session
- If auth expires, re-run: `npx @softeria/ms-365-mcp-server --org-mode --login`
- Use `--read-only` flag if the user only needs to view data (safer)
