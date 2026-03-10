# Wolt Ledger

Static SvelteKit dashboard for Wolt order history. The UI is rendered as a static site, the data is loaded from a local SQLite file in the browser with `sql.js`, and the charts are drawn with `d3`.

## Overview

- Static output, suitable for GitHub Pages
- Browser-side SQLite queries with no backend required
- Multi-user data model with explicit `user_id` ownership on synced orders
- Filters for user, country, city, venue, venue type, currency, day split, and date window
- Order drilldowns, venue memory, product replay, fee-share trends, and monthly spend/cadence charts

## Stack

- Node.js 20+
- npm
- SvelteKit with `@sveltejs/adapter-static`
- Tailwind CSS v4
- `sql.js`
- `d3`
- `wolt-cli` for the local sync workflow

## Installation

```bash
npm install
```

## Wolt CLI

The sync depends on `wolt-cli`.

Recommended install:

```bash
brew tap mekedron/tap
brew install wolt-cli
```

If you prefer to run it from source instead of installing the binary:

```bash
git clone https://github.com/mekedron/wolt-cli.git
cd wolt-cli
go run ./cmd/wolt --help
```

To point this repo at a source checkout, set `WOLT_CLI_JSON`:

```bash
export WOLT_CLI_JSON='["go","run","/absolute/path/to/wolt-cli/cmd/wolt"]'
```

Basic auth / verification flow:

```bash
wolt configure --profile-name default --wtoken "<token>" --wrtoken "<refresh-token>" --overwrite
wolt auth status --profile default --format json
wolt profile orders list --profile default --limit 5 --format json
```

## Sync Order History

The sync writes a local SQLite database to `static/data/wolt-history.sqlite`.

`--userEmail` is intentionally not hard-coded in this repo. Pass it explicitly or set `WOLT_USER_EMAIL`.

Example:

```bash
./scripts/sync-wolt-history.sh \
  --userEmail you@example.com \
  --expectedOrderCount 870
```

What the sync does:

1. Pages through Wolt order history and builds a deduplicated `order_catalog`.
2. Verifies the catalog baseline, if one was provided.
3. Fetches detailed order payloads only after the catalog phase succeeds.
4. Upserts details into SQLite so reruns append safely and stay deduplicated.

Useful variants:

```bash
./scripts/sync-wolt-history.sh --userEmail you@example.com --expectedOrderCount 870
./scripts/sync-wolt-history.sh --userEmail you@example.com --full
./scripts/sync-wolt-history.sh --userEmail second.user@example.com --profile second-profile --expectedOrderCount 120
./scripts/sync-wolt-history.sh --help
```

You can also use the npm wrapper:

```bash
npm run db:sync -- --userEmail you@example.com --expectedOrderCount 870
```

## Run Locally

```bash
npm run dev
```

Open `http://localhost:5173`.

## Validation

```bash
npm run validate
```

That runs:

- Prettier check
- ESLint
- Vitest
- `svelte-check`
- production build

## Static Builds

Default build:

```bash
npm run build
```

GitHub Pages project-site build:

```bash
npm run build:pages
```

The generated static site is written to `build/`.

## Privacy and Public Repo Safety

- The generated SQLite database is ignored by git.
- Local Wolt auth/config files are ignored by git.
- Temporary screenshots and local Chromium profiles are ignored by git.
- The repo no longer hard-codes a personal email address in source, tests, or docs.

Do not commit:

- `static/data/wolt-history.sqlite`
- Wolt auth tokens, cookies, or config files
- screenshots generated from your real order history

If you publish the database or a build produced from real personal data, that history becomes public.
