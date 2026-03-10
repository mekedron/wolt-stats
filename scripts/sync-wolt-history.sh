#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${WOLT_CLI_JSON:-}" ]]; then
	if command -v wolt >/dev/null 2>&1; then
		export WOLT_CLI_JSON='["wolt"]'
	else
		cat >&2 <<'EOF'
Missing wolt-cli.

Install it first:
  brew install mekedron/tap/wolt-cli

Or point this sync script at a local checkout:
  export WOLT_CLI_JSON='["go","run","/absolute/path/to/wolt-cli/cmd/wolt"]'
EOF
		exit 1
	fi
fi

node "$ROOT_DIR/scripts/sync-wolt-history.mjs" "$@"
