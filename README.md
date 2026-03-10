# wolt-stats

Unofficial hobby dashboard for exploring Wolt order history. Not affiliated with Wolt.

| Primary                                                                      | Secondary                                                                        | Tertiary                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Primary desktop screenshot](docs/readme-assets/readme-desktop-primary.png) | ![Secondary desktop screenshot](docs/readme-assets/readme-desktop-secondary.png) | ![Tertiary desktop screenshot](docs/readme-assets/readme-desktop-tertiary.png) |

## What It Does

- Syncs your Wolt order history into a local SQLite database
- Keeps reruns cheap by syncing incrementally by default
- Lets you filter by user, country, city, venue, venue type, currency, day split, and date range
- Shows spending, order cadence, fee pressure, venue patterns, and dish price trends
- Supports multiple users in the same database

## Dependencies

- Node.js 20+
- npm
- `wolt-cli`

Install `wolt-cli`:

```bash
brew tap mekedron/tap
brew install wolt-cli
```

Check that it works:

```bash
wolt --help
```

## Install

```bash
npm install
```

## Sync Your Data

The sync writes to `static/data/wolt-history.sqlite`.

```bash
./scripts/sync-wolt-history.sh \
  --userEmail you@example.com \
  --expectedOrderCount 870
```

Useful variants:

```bash
./scripts/sync-wolt-history.sh --help
./scripts/sync-wolt-history.sh --userEmail you@example.com --expectedOrderCount 870
./scripts/sync-wolt-history.sh --userEmail you@example.com --expectedOrderCount 870 --full
```

Notes:

- normal runs are incremental
- `--full` forces a full history rescan
- the database file is git-ignored and should stay private

## Run Locally

```bash
npm run dev
```

Open `http://localhost:5173`.

## Validate

```bash
npm run validate
```

## Build Static Output

```bash
npm run build
```

For GitHub Pages project-site builds:

```bash
npm run build:pages
```
