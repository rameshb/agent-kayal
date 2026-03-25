#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Pi Teams Agent — Default Packages Setup
#
# Installs:
#   1. pi-memory          — Persistent cross-session memory
#   2. ms-365-mcp-server  — Microsoft 365 (Outlook, Calendar, OneDrive, etc.)
#   3. pi-skills           — Web search, browser, transcription, YouTube
#   4. pi-subagents        — Sub-agent orchestration
#   5. qmd                 — Semantic search for pi-memory
# ─────────────────────────────────────────────────────────────

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()  { echo -e "${RED}[FAIL]${RESET}  $*"; }
step()  { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ─── Preflight checks ───

step "Checking prerequisites"

command -v node >/dev/null 2>&1 || { fail "Node.js not found. Install v22+ first."; exit 1; }
command -v npm >/dev/null 2>&1  || { fail "npm not found."; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  warn "Node.js v${NODE_VERSION} detected. v22+ recommended."
else
  ok "Node.js v$(node -v | sed 's/v//')"
fi

# Check if pi CLI is available
if command -v pi >/dev/null 2>&1; then
  ok "Pi CLI found: $(pi --version 2>/dev/null || echo 'available')"
else
  warn "Pi CLI not found. Installing globally..."
  npm install -g @mariozechner/pi-coding-agent
  ok "Pi CLI installed"
fi

# ─── 1. pi-memory ───

step "1/5 Installing pi-memory (persistent cross-session memory)"

if pi list 2>/dev/null | grep -q "pi-memory"; then
  ok "pi-memory already installed"
else
  pi install npm:pi-memory && ok "pi-memory installed" || warn "pi-memory install failed (non-critical)"
fi

# ─── 2. MS 365 MCP Server ───

step "2/5 Installing @softeria/ms-365-mcp-server (Microsoft 365 integration)"

if npm list -g @softeria/ms-365-mcp-server >/dev/null 2>&1; then
  ok "ms-365-mcp-server already installed globally"
else
  npm install -g @softeria/ms-365-mcp-server && ok "ms-365-mcp-server installed" || warn "ms-365-mcp-server install failed"
fi

info "The MS 365 skill is pre-configured at workspace/my_pi_agent/skills/ms365/SKILL.md"
info "To authenticate, run: npx @softeria/ms-365-mcp-server --org-mode --login"

# ─── 3. pi-skills (selective — web search, browser, transcription) ───

step "3/5 Installing pi-skills (brave-search, browser-tools, transcribe, youtube-transcript)"

if pi list 2>/dev/null | grep -q "pi-skills"; then
  ok "pi-skills already installed"
else
  pi install git:github.com/badlogic/pi-skills && ok "pi-skills installed" || warn "pi-skills install failed (non-critical)"
fi

# Install brave-search dependency
if [ -d "$HOME/.pi/agent/git/pi-skills/brave-search" ]; then
  info "Installing brave-search npm dependencies..."
  (cd "$HOME/.pi/agent/git/pi-skills/brave-search" && npm install 2>/dev/null) && ok "brave-search deps installed" || warn "brave-search deps skipped"
fi

# ─── 4. pi-subagents ───

step "4/5 Installing pi-subagents (sub-agent orchestration)"

if pi list 2>/dev/null | grep -q "pi-subagents"; then
  ok "pi-subagents already installed"
else
  pi install npm:@tintinweb/pi-subagents && ok "pi-subagents installed" || warn "pi-subagents install failed (non-critical)"
fi

# ─── 5. qmd (semantic search for pi-memory) ───

step "5/5 Installing qmd (semantic search for pi-memory)"

if command -v qmd >/dev/null 2>&1; then
  ok "qmd already installed"
elif command -v bun >/dev/null 2>&1; then
  bun install -g https://github.com/tobi/qmd && ok "qmd installed" || warn "qmd install failed (non-critical, pi-memory works without it)"
else
  warn "Bun not found. qmd requires Bun to install."
  warn "Install Bun (curl -fsSL https://bun.sh/install | bash) then run: bun install -g https://github.com/tobi/qmd"
  warn "pi-memory will still work without qmd — just without semantic search."
fi

# ─── Summary ───

step "Setup complete"

echo ""
echo -e "${BOLD}Installed packages:${RESET}"
echo ""
pi list 2>/dev/null || echo "  (run 'pi list' to verify)"
echo ""

echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo "  1. Authenticate MS 365:"
echo "     npx @softeria/ms-365-mcp-server --org-mode --login"
echo ""
echo "  2. Set BRAVE_API_KEY for web search (get one at brave.com/search/api):"
echo "     export BRAVE_API_KEY=your-key"
echo ""
echo "  3. If qmd is installed, initialize embeddings:"
echo "     qmd embed"
echo ""
echo "  4. Start the agent:"
echo "     npm run dev"
echo ""
