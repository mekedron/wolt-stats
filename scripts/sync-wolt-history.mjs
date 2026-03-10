#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

import {
	clampInteger,
	ensureSchema,
	getCatalogCount,
	getDetailCount,
	getNewestCatalogPaymentTimeTs,
	insertSyncRun,
	loadDatabase,
	loadDetailQueue,
	queryAll,
	slugify,
	updateSyncState,
	upsertOrderBundle,
	upsertOrderCatalogEntry,
	upsertUser,
	writeDatabaseSnapshot,
} from './lib/wolt-sync-db.mjs';
import {
	parseWoltCli,
	RATE_LIMIT_DELAY_MS,
	runWoltJson,
	sleep,
} from './lib/wolt-sync-runtime.mjs';
import {
	formatCatalogStopReason,
	getCatalogStopDecision,
	resolveCatalogScanMode,
} from './lib/wolt-sync-catalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const DEFAULT_DB_PATH = resolve(ROOT_DIR, 'static/data/wolt-history.sqlite');
const DEFAULT_PAGE_SIZE = 50;
const DETAIL_CHECKPOINT_INTERVAL = 5;
const CATALOG_LOG_INTERVAL = 10;

const args = parseArgs({
	options: {
		db: { type: 'string' },
		expectedOrderCount: { type: 'string' },
		full: { type: 'boolean', default: false },
		help: { type: 'boolean', short: 'h', default: false },
		locale: { type: 'string' },
		pageSize: { type: 'string' },
		profile: { type: 'string', default: 'default' },
		userEmail: { type: 'string' },
		userId: { type: 'string' },
		userLabel: { type: 'string' },
	},
	allowPositionals: false,
});

if (args.values.help) {
	console.log(`Usage: ./scripts/sync-wolt-history.sh [options]

Options:
  --userEmail <email>         Canonical dashboard user key.
                              Required unless WOLT_USER_EMAIL is set.
  --userId <id>               Optional stable user ID. Defaults to a slug from --userEmail.
  --userLabel <label>         Optional display label for the user.
  --profile <name>            Wolt CLI profile. Default: default
  --db <path>                 SQLite output path. Default: static/data/wolt-history.sqlite
  --pageSize <number>         Wolt list page size, 1-50. Default: ${DEFAULT_PAGE_SIZE}
  --locale <locale>           Optional Wolt locale override, for example en-FI.
  --expectedOrderCount <n>    Minimum unique order IDs required before detail sync starts.
                              Optional, but recommended for reliable completeness checks.
  --full                      Force a full catalog crawl and re-fetch all order details.
                              Default mode is incremental after the initial history baseline exists.
  --help, -h                  Show this help.
`);
	process.exit(0);
}

const userEmail = (args.values.userEmail ?? process.env.WOLT_USER_EMAIL ?? '')
	.trim()
	.toLowerCase();
const userId = (args.values.userId ?? slugify(userEmail)).trim();
const userLabel = (args.values.userLabel ?? userEmail.split('@')[0]).trim();
const profileName = (args.values.profile ?? 'default').trim();
const locale = args.values.locale?.trim();
const pageSize = clampInteger(
	Number(args.values.pageSize ?? String(DEFAULT_PAGE_SIZE)),
	1,
	50,
);
const forceFull = Boolean(args.values.full);
const dbPath = resolve(ROOT_DIR, args.values.db ?? DEFAULT_DB_PATH);
const expectedOrderCount = parseOptionalInteger(
	args.values.expectedOrderCount ?? process.env.WOLT_EXPECTED_ORDER_COUNT,
);
const woltCli = parseWoltCli(process.env.WOLT_CLI_JSON);

if (!userEmail) {
	throw new Error(
		'Missing user email. Pass --userEmail or set WOLT_USER_EMAIL before syncing.',
	);
}

if (!userId) {
	throw new Error(
		'Resolved user ID is empty. Provide --userId or a valid --userEmail.',
	);
}

const SQL = await initSqlJs();
const db = loadDatabase(SQL, dbPath);
ensureSchema(db);

const startedAt = new Date().toISOString();

let pagesFetched;
let ordersScanned;
let detailsQueued;
let detailsFetched;
let insertedOrders;
let updatedOrders;
const knownCatalogCount = getCatalogCount(db, userId);
const newestKnownCatalogPaymentTimeTs = getNewestCatalogPaymentTimeTs(
	db,
	userId,
);
const catalogScanMode = resolveCatalogScanMode({
	expectedOrderCount,
	forceFull,
	knownCatalogCount,
	newestKnownPaymentTimeTs: newestKnownCatalogPaymentTimeTs,
});
const knownCatalogPurchaseIds =
	catalogScanMode === 'incremental'
		? new Set(
				queryAll(
					db,
					'SELECT purchase_id FROM order_catalog WHERE user_id = ?',
					[userId],
				).map((row) => String(row.purchase_id ?? '')),
			)
		: new Set();

try {
	const authState = await runWoltJson({
		commandArgs: ['auth', 'status'],
		locale,
		profileName,
		woltCli,
	});

	if (!authState?.authenticated) {
		throw new Error(`Wolt profile "${profileName}" is not authenticated.`);
	}

	upsertUser(db, { nowIso: startedAt, userEmail, userId, userLabel });
	persistSyncState(db, {
		expectedOrderCount,
		nowIso: startedAt,
		startedAt,
		userId,
	});
	writeDatabaseSnapshot(dbPath, db);

	const catalogResult = await syncCatalogPhase({
		knownCatalogPurchaseIds,
		mode: catalogScanMode,
		newestKnownPaymentTimeTs: newestKnownCatalogPaymentTimeTs,
	});
	pagesFetched = catalogResult.pagesFetched;
	ordersScanned = catalogResult.ordersScanned;

	if (!meetsExpectedBaseline(catalogResult.uniqueOrders, expectedOrderCount)) {
		const expectedLabel =
			expectedOrderCount === null ? 'n/a' : String(expectedOrderCount);
		throw new Error(
			`Catalog discovered ${catalogResult.uniqueOrders} unique orders for ${userEmail}; expected at least ${expectedLabel}. Detail sync was not started.`,
		);
	}

	const detailResult = await syncDetailPhase();
	detailsQueued = detailResult.queued;
	detailsFetched = detailResult.fetched;
	insertedOrders = detailResult.inserted;
	updatedOrders = detailResult.updated;

	const finishedAt = new Date().toISOString();
	persistSyncState(db, {
		expectedOrderCount,
		nowIso: finishedAt,
		startedAt,
		userId,
	});
	insertSyncRun(db, {
		detailsFetched,
		finishedAt,
		insertedOrders,
		ordersScanned,
		pagesFetched,
		profileName,
		reachedHistoryEnd: catalogResult.reachedHistoryEnd,
		startedAt,
		updatedOrders,
		userId,
	});
	writeDatabaseSnapshot(dbPath, db);

	const catalogCount = getCatalogCount(db, userId);
	const detailCount = getDetailCount(db, userId);

	console.log(
		[
			`Synced Wolt history for ${userEmail}`,
			`  profile: ${profileName}`,
			`  db: ${dbPath}`,
			`  catalog mode: ${catalogScanMode}`,
			`  catalog pages fetched: ${pagesFetched}`,
			`  order summaries scanned: ${ordersScanned}`,
			`  unique order IDs: ${catalogCount}`,
			`  details queued: ${detailsQueued}`,
			`  order details fetched: ${detailsFetched}`,
			`  detailed rows stored: ${detailCount}`,
			`  inserted: ${insertedOrders}`,
			`  updated: ${updatedOrders}`,
			`  expected minimum: ${expectedOrderCount ?? 'none'}`,
			`  catalog stop reason: ${formatCatalogStopReason(catalogResult.stopReason)}`,
			`  full backfill complete: ${isFullySynced(catalogCount, detailCount, expectedOrderCount) ? 'yes' : 'no'}`,
		].join('\n'),
	);
} finally {
	db.close();
}

async function syncCatalogPhase({
	knownCatalogPurchaseIds,
	mode,
	newestKnownPaymentTimeTs,
}) {
	let nextPageToken;
	let pageOrdinal = 1;
	let pagesFetchedForRun = 0;
	let ordersScannedForRun = 0;
	let stopReason = null;
	const seenPageTokens = new Set();
	const incremental = mode === 'incremental';

	while (true) {
		const listArgs = ['profile', 'orders', 'list', '--limit', String(pageSize)];
		if (nextPageToken) {
			listArgs.push('--page-token', nextPageToken);
		}

		await sleep(RATE_LIMIT_DELAY_MS);
		const page = await runWoltJson({
			commandArgs: listArgs,
			locale,
			profileName,
			woltCli,
		});
		const summaries = Array.isArray(page?.orders) ? page.orders : [];
		if (summaries.length === 0) {
			break;
		}

		pagesFetchedForRun += 1;
		ordersScannedForRun += summaries.length;
		console.log(
			`Catalog page ${pageOrdinal}: ${summaries.length} order summaries${incremental ? ' (incremental)' : ''}`,
		);

		db.run('BEGIN');
		try {
			for (const [index, summary] of summaries.entries()) {
				const purchaseId = String(summary?.purchase_id ?? '');
				if (
					index === 0 ||
					index === summaries.length - 1 ||
					(index + 1) % CATALOG_LOG_INTERVAL === 0
				) {
					console.log(
						`  Catalog page ${pageOrdinal}: ${index + 1}/${summaries.length} (${purchaseId})`,
					);
				}
				upsertOrderCatalogEntry(db, {
					nowIso: new Date().toISOString(),
					summary,
					userId,
				});
			}
			db.run('COMMIT');
		} catch (error) {
			db.run('ROLLBACK');
			throw error;
		}

		persistSyncState(db, {
			expectedOrderCount,
			nowIso: new Date().toISOString(),
			startedAt,
			userId,
		});
		writeDatabaseSnapshot(dbPath, db);

		const pageNextToken =
			typeof page?.next_page_token === 'string' ? page.next_page_token : null;
		const stopDecision = incremental
			? getCatalogStopDecision({
					knownPurchaseIds: knownCatalogPurchaseIds,
					newestKnownPaymentTimeTs,
					summaries,
				})
			: { reason: null, shouldStopAfterPage: false };
		if (stopDecision.shouldStopAfterPage) {
			stopReason = stopDecision.reason;
			break;
		}
		if (!pageNextToken) {
			break;
		}
		if (seenPageTokens.has(pageNextToken)) {
			throw new Error(
				`Wolt pagination repeated next_page_token "${pageNextToken}".`,
			);
		}
		seenPageTokens.add(pageNextToken);
		nextPageToken = pageNextToken;
		pageOrdinal += 1;
	}

	const uniqueOrders = getCatalogCount(db, userId);
	console.log(
		`Catalog phase complete: ${uniqueOrders} unique order IDs discovered.${incremental ? ` Incremental stop: ${formatCatalogStopReason(stopReason)}.` : ''}`,
	);

	return {
		ordersScanned: ordersScannedForRun,
		pagesFetched: pagesFetchedForRun,
		reachedHistoryEnd: stopReason === null,
		stopReason,
		uniqueOrders,
	};
}

async function syncDetailPhase() {
	const queue = loadDetailQueue(db, { forceFull, userId });
	if (queue.length === 0) {
		console.log('Detail phase: no missing order details.');
		return { fetched: 0, inserted: 0, queued: 0, updated: 0 };
	}

	console.log(
		`Detail phase: ${queue.length} orders queued${forceFull ? ' (full detail refresh)' : ' (missing details only)'}`,
	);

	let fetched = 0;
	let inserted = 0;
	let updated = 0;
	const knownDetailedOrders = new Set(
		queryAll(db, 'SELECT purchase_id FROM orders WHERE user_id = ?', [
			userId,
		]).map((row) => String(row.purchase_id)),
	);

	for (const [index, entry] of queue.entries()) {
		if (
			index === 0 ||
			index === queue.length - 1 ||
			(index + 1) % DETAIL_CHECKPOINT_INTERVAL === 0
		) {
			console.log(
				`  Detail phase: ${index + 1}/${queue.length} (${entry.purchaseId})`,
			);
		}

		await sleep(RATE_LIMIT_DELAY_MS);
		const detail = await runWoltJson({
			commandArgs: ['profile', 'orders', 'show', entry.purchaseId],
			locale,
			profileName,
			woltCli,
		});

		db.run('BEGIN');
		try {
			upsertOrderBundle(db, {
				detail,
				nowIso: new Date().toISOString(),
				purchaseId: entry.purchaseId,
				summary: entry.summary,
				userId,
			});
			db.run('COMMIT');
		} catch (error) {
			db.run('ROLLBACK');
			throw error;
		}

		fetched += 1;
		if (knownDetailedOrders.has(entry.purchaseId)) {
			updated += 1;
		} else {
			inserted += 1;
			knownDetailedOrders.add(entry.purchaseId);
		}

		if (
			fetched % DETAIL_CHECKPOINT_INTERVAL === 0 ||
			fetched === queue.length
		) {
			persistSyncState(db, {
				expectedOrderCount,
				nowIso: new Date().toISOString(),
				startedAt,
				userId,
			});
			writeDatabaseSnapshot(dbPath, db);
		}
	}

	return { fetched, inserted, queued: queue.length, updated };
}

function persistSyncState(
	db,
	{ expectedOrderCount, nowIso, startedAt, userId },
) {
	const catalogCount = getCatalogCount(db, userId);
	const detailCount = getDetailCount(db, userId);
	updateSyncState(db, {
		catalogOrderCount: catalogCount,
		detailOrderCount: detailCount,
		expectedOrderCount,
		fullBackfillCompleted: isFullySynced(
			catalogCount,
			detailCount,
			expectedOrderCount,
		),
		newestPaymentTimeTs: getNewestCatalogPaymentTimeTs(db, userId),
		nowIso,
		startedAt,
		userId,
	});
}

function isFullySynced(catalogCount, detailCount, expectedOrderCount) {
	return (
		detailCount >= catalogCount &&
		meetsExpectedBaseline(catalogCount, expectedOrderCount)
	);
}

function meetsExpectedBaseline(catalogCount, expectedOrderCount) {
	return expectedOrderCount === null || catalogCount >= expectedOrderCount;
}

function parseOptionalInteger(value) {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`Expected a positive integer, received "${value}".`);
	}

	return Math.trunc(parsed);
}
