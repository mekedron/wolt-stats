#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';

import {
	DEFAULT_DEMO_END_DATE,
	backupExistingDatabase,
	populateDemoDatabase,
} from './lib/demo-db.mjs';
import { writeDatabaseSnapshot } from './lib/wolt-sync-db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const LIVE_DB_PATH = resolve(ROOT_DIR, 'static/data/wolt-history.sqlite');
const DEMO_DB_PATH = resolve(ROOT_DIR, 'static/data/wolt-history-demo.sqlite');

/**
 * @param {{
 *  backupPath?: string;
 *  dbPath?: string;
 *  endDate?: string;
 *  liveDbPath?: string;
 *  seed?: number;
 * }} [options]
 * @returns {Promise<{ backupPath: string | null; catalogOrders: number; dbPath: string; detailOrders: number; endDate: string; startDate: string; users: number }>}
 */
export async function generateDemoDatabase(options = {}) {
	const demoDbPath = resolve(ROOT_DIR, options.dbPath ?? DEMO_DB_PATH);
	const liveDbPath = resolve(ROOT_DIR, options.liveDbPath ?? LIVE_DB_PATH);
	const seed = Number(options.seed ?? 20260310);

	if (demoDbPath === liveDbPath) {
		throw new Error(
			`Refusing to overwrite the live database at ${liveDbPath}. Use a separate demo DB path.`,
		);
	}

	const backupResult = backupExistingDatabase(liveDbPath, {
		backupPath: options.backupPath,
		now: new Date(),
	});

	const SQL = await initSqlJs();
	const db = new SQL.Database();
	const summary = populateDemoDatabase(db, {
		endDate: options.endDate,
		seed,
	});

	writeDatabaseSnapshot(demoDbPath, db);

	return {
		backupPath: backupResult,
		catalogOrders: summary.catalogOrders,
		dbPath: demoDbPath,
		detailOrders: summary.detailOrders,
		endDate: summary.endDate,
		startDate: summary.startDate,
		users: summary.users,
	};
}

function printHelp() {
	console.log(`Usage: node ./scripts/generate-demo-db.mjs [options]

Options:
  --db <path>        Demo SQLite output path. Default: static/data/wolt-history-demo.sqlite
  --backup <path>    Optional backup path for the current live DB.
                     Default: static/data/wolt-history.sqlite-<timestamp>.bak
  --endDate <date>   Anchor date for the one-year demo window. Default: ${DEFAULT_DEMO_END_DATE}
  --seed <number>    Deterministic faker seed. Default: 20260310
  --help, -h         Show this help.
`);
}

async function main() {
	const args = parseArgs({
		options: {
			backup: { type: 'string' },
			db: { type: 'string' },
			endDate: { type: 'string' },
			help: { default: false, short: 'h', type: 'boolean' },
			seed: { type: 'string' },
		},
	});

	if (args.values.help) {
		printHelp();
		return;
	}

	const summary = await generateDemoDatabase({
		backupPath: args.values.backup
			? resolve(ROOT_DIR, args.values.backup)
			: undefined,
		dbPath: args.values.db,
		endDate: args.values.endDate,
		seed: Number(args.values.seed ?? '20260310'),
	});

	console.log(
		[
			'Generated demo Wolt history database.',
			`  demo db: ${summary.dbPath}`,
			`  live db backup: ${summary.backupPath ?? 'not created (live DB missing)'}`,
			`  users: ${summary.users}`,
			`  cataloged orders: ${summary.catalogOrders}`,
			`  detailed orders: ${summary.detailOrders}`,
			`  coverage: ${summary.startDate} to ${summary.endDate}`,
			'  build with demo data: npm run build:pages:demo',
		].join('\n'),
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
