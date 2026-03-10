#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
CHROME_PROFILE="${PROJECT_ROOT}/.chrome-profile"
MCP_ARGS="[\"-y\",\"chrome-devtools-mcp@0.17.1\",\"--executablePath=${CHROME_BIN}\",\"--userDataDir=${CHROME_PROFILE}\"]"

exec codex \
  -C "$PROJECT_ROOT" \
  -c 'mcp_servers.chrome-devtools.command="npx"' \
  -c "mcp_servers.chrome-devtools.args=${MCP_ARGS}" \
  -c "mcp_servers.chrome-devtools.cwd=\"${PROJECT_ROOT}\"" \
  "$@"
