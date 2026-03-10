#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { DEFAULT_DEMO_END_DATE } from './lib/demo-db.mjs';
import { generateDemoDatabase } from './generate-demo-db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_DEMO_DB_PATH = resolve(
	ROOT_DIR,
	'static/data/wolt-history-demo.sqlite',
);
const VITE_BIN_PATH = resolve(ROOT_DIR, 'node_modules/vite/bin/vite.js');
const BUILD_DATA_DIR = resolve(ROOT_DIR, 'build/data');

const args = parseArgs({
	options: {
		endDate: { type: 'string' },
		help: { default: false, short: 'h', type: 'boolean' },
		pages: { default: false, type: 'boolean' },
		seed: { type: 'string' },
	},
});

if (args.values.help) {
	console.log(`Usage: node ./scripts/build-demo-site.mjs [options]

Options:
  --pages           Build with BASE_PATH=/wolt-stats for GitHub Pages
  --endDate <date>  Anchor date for the one-year demo window. Default: ${DEFAULT_DEMO_END_DATE}
  --seed <number>   Deterministic faker seed. Default: 20260310
  --help, -h        Show this help.
`);
	process.exit(0);
}

const summary = await generateDemoDatabase({
	dbPath: DEFAULT_DEMO_DB_PATH,
	endDate: args.values.endDate,
	seed: Number(args.values.seed ?? '20260310'),
});

const result = spawnSync(process.execPath, [VITE_BIN_PATH, 'build'], {
	cwd: ROOT_DIR,
	env: {
		...process.env,
		BASE_PATH: args.values.pages ? '/wolt-stats' : '',
		PUBLIC_WOLT_STATS_DATABASE_PATH: 'data/wolt-history-demo.sqlite',
	},
	stdio: 'inherit',
});

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const quarantinedDataDir = quarantineBuildData();
mkdirSync(BUILD_DATA_DIR, { recursive: true });
copyFileSync(summary.dbPath, join(BUILD_DATA_DIR, 'wolt-history-demo.sqlite'));

console.log(
	[
		'Built demo site with staged public assets only.',
		`  demo db: ${summary.dbPath}`,
		`  live db backup: ${summary.backupPath ?? 'not created (live DB missing)'}`,
		`  quarantined build data: ${quarantinedDataDir ?? 'not needed'}`,
	].join('\n'),
);

/**
 * @returns {string | null}
 */
function quarantineBuildData() {
	if (!existsSync(BUILD_DATA_DIR)) {
		return null;
	}

	const quarantineRoot = mkdtempSync(join(tmpdir(), 'wolt-stats-build-data-'));
	const targetDir = join(quarantineRoot, 'data');
	renameSync(BUILD_DATA_DIR, targetDir);
	return targetDir;
}
