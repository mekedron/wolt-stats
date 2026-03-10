import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @typedef {import('sql.js').Database} SqlJsDatabase
 * @typedef {string | number | null | Uint8Array | undefined} SqlScalar
 * @typedef {Record<string, SqlScalar>} SqlRow
 */

/**
 * @param {{ Database: new (data?: Uint8Array) => SqlJsDatabase }} SQL
 * @param {string} dbPath
 * @returns {SqlJsDatabase}
 */
export function loadDatabase(SQL, dbPath) {
	const existingDb = existsSync(dbPath) ? readFileSync(dbPath) : undefined;
	const db = new SQL.Database(existingDb);
	db.run('PRAGMA foreign_keys = ON');
	return db;
}

/**
 * @param {SqlJsDatabase} db
 * @returns {void}
 */
export function ensureSchema(db) {
	db.run(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			label TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sync_state (
			user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			newest_payment_time_ts INTEGER NOT NULL DEFAULT 0,
			full_backfill_completed INTEGER NOT NULL DEFAULT 0,
			resume_page_token TEXT,
			resume_page_number INTEGER NOT NULL DEFAULT 1,
			catalog_order_count INTEGER NOT NULL DEFAULT 0,
			detail_order_count INTEGER NOT NULL DEFAULT 0,
			expected_order_count INTEGER,
			last_sync_started_at TEXT,
			last_sync_finished_at TEXT,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sync_runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			profile_name TEXT NOT NULL,
			started_at TEXT NOT NULL,
			finished_at TEXT NOT NULL,
			pages_fetched INTEGER NOT NULL DEFAULT 0,
			orders_scanned INTEGER NOT NULL DEFAULT 0,
			details_fetched INTEGER NOT NULL DEFAULT 0,
			inserted_orders INTEGER NOT NULL DEFAULT 0,
			updated_orders INTEGER NOT NULL DEFAULT 0,
			reached_history_end INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS order_catalog (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			purchase_id TEXT NOT NULL,
			payment_time_ts INTEGER NOT NULL,
			currency TEXT,
			status TEXT,
			received_at_raw TEXT,
			items_summary TEXT,
			venue_name TEXT,
			summary_json TEXT NOT NULL,
			discovered_at TEXT NOT NULL,
			last_seen_at TEXT NOT NULL,
			PRIMARY KEY (user_id, purchase_id)
		);

		CREATE TABLE IF NOT EXISTS orders (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			purchase_id TEXT NOT NULL,
			order_number TEXT,
			status TEXT NOT NULL,
			payment_time_ts INTEGER NOT NULL,
			order_local_datetime TEXT,
			order_local_date TEXT,
			order_local_month TEXT,
			order_local_weekday INTEGER,
			order_local_hour INTEGER,
			creation_time_raw TEXT,
			delivery_time_raw TEXT,
			received_at_raw TEXT,
			currency TEXT NOT NULL,
			total_amount_minor INTEGER NOT NULL,
			subtotal_minor INTEGER NOT NULL DEFAULT 0,
			items_amount_minor INTEGER NOT NULL DEFAULT 0,
			delivery_fee_minor INTEGER NOT NULL DEFAULT 0,
			service_fee_minor INTEGER NOT NULL DEFAULT 0,
			fees_minor INTEGER NOT NULL DEFAULT 0,
			credits_minor INTEGER NOT NULL DEFAULT 0,
			tokens_minor INTEGER NOT NULL DEFAULT 0,
			discount_amount_minor INTEGER NOT NULL DEFAULT 0,
			surcharge_amount_minor INTEGER NOT NULL DEFAULT 0,
			delivery_method TEXT,
			delivery_city TEXT,
			delivery_alias TEXT,
			venue_id TEXT,
			venue_name TEXT,
			venue_country TEXT,
			venue_address TEXT,
			venue_product_line TEXT,
			items_summary TEXT,
			payment_provider TEXT,
			payment_method_type TEXT,
			payment_method_name TEXT,
			raw_json TEXT NOT NULL,
			synced_at TEXT NOT NULL,
			PRIMARY KEY (user_id, purchase_id)
		);

		CREATE TABLE IF NOT EXISTS order_items (
			user_id TEXT NOT NULL,
			purchase_id TEXT NOT NULL,
			item_index INTEGER NOT NULL,
			item_id TEXT,
			item_name TEXT NOT NULL,
			quantity INTEGER NOT NULL,
			unit_price_minor INTEGER NOT NULL DEFAULT 0,
			line_total_minor INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (user_id, purchase_id, item_index),
			FOREIGN KEY (user_id, purchase_id) REFERENCES orders(user_id, purchase_id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS order_item_option_values (
			user_id TEXT NOT NULL,
			purchase_id TEXT NOT NULL,
			item_index INTEGER NOT NULL,
			option_index INTEGER NOT NULL,
			value_index INTEGER NOT NULL,
			option_group_id TEXT,
			option_group_name TEXT,
			option_value_id TEXT,
			option_value_name TEXT,
			quantity INTEGER NOT NULL DEFAULT 1,
			price_minor INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (user_id, purchase_id, item_index, option_index, value_index),
			FOREIGN KEY (user_id, purchase_id, item_index) REFERENCES order_items(user_id, purchase_id, item_index) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS order_payments (
			user_id TEXT NOT NULL,
			purchase_id TEXT NOT NULL,
			payment_index INTEGER NOT NULL,
			method_id TEXT,
			provider TEXT,
			method_type TEXT,
			method_name TEXT,
			amount_minor INTEGER NOT NULL DEFAULT 0,
			payment_time_raw TEXT,
			PRIMARY KEY (user_id, purchase_id, payment_index),
			FOREIGN KEY (user_id, purchase_id) REFERENCES orders(user_id, purchase_id) ON DELETE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_order_catalog_user_payment_ts ON order_catalog(user_id, payment_time_ts);
		CREATE INDEX IF NOT EXISTS idx_orders_user_date ON orders(user_id, order_local_date);
		CREATE INDEX IF NOT EXISTS idx_orders_user_currency ON orders(user_id, currency);
		CREATE INDEX IF NOT EXISTS idx_orders_user_country ON orders(user_id, venue_country);
		CREATE INDEX IF NOT EXISTS idx_orders_user_payment_ts ON orders(user_id, payment_time_ts DESC);
		CREATE INDEX IF NOT EXISTS idx_order_items_user_name ON order_items(user_id, item_name);
	`);

	ensureColumn(db, 'sync_state', 'resume_page_token', 'TEXT');
	ensureColumn(
		db,
		'sync_state',
		'resume_page_number',
		'INTEGER NOT NULL DEFAULT 1',
	);
	ensureColumn(
		db,
		'sync_state',
		'catalog_order_count',
		'INTEGER NOT NULL DEFAULT 0',
	);
	ensureColumn(
		db,
		'sync_state',
		'detail_order_count',
		'INTEGER NOT NULL DEFAULT 0',
	);
	ensureColumn(db, 'sync_state', 'expected_order_count', 'INTEGER');
}

/**
 * @param {SqlJsDatabase} db
 * @param {{ userEmail: string; userId: string; userLabel: string; nowIso: string }} options
 * @returns {void}
 */
export function upsertUser(db, { userEmail, userId, userLabel, nowIso }) {
	db.run(
		`INSERT INTO users (id, email, label, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			email = excluded.email,
			label = excluded.label,
			updated_at = excluded.updated_at`,
		[userId, userEmail, userLabel, nowIso, nowIso],
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {{ nowIso: string; summary: any; userId: string }} options
 * @returns {void}
 */
export function upsertOrderCatalogEntry(db, { nowIso, summary, userId }) {
	const purchaseId = String(summary?.purchase_id ?? '').trim();
	if (!purchaseId) {
		throw new Error('Encountered a Wolt order summary without a purchase_id.');
	}

	db.run(
		`INSERT INTO order_catalog (
			user_id,
			purchase_id,
			payment_time_ts,
			currency,
			status,
			received_at_raw,
			items_summary,
			venue_name,
			summary_json,
			discovered_at,
			last_seen_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, purchase_id) DO UPDATE SET
			payment_time_ts = excluded.payment_time_ts,
			currency = excluded.currency,
			status = excluded.status,
			received_at_raw = excluded.received_at_raw,
			items_summary = excluded.items_summary,
			venue_name = excluded.venue_name,
			summary_json = excluded.summary_json,
			last_seen_at = excluded.last_seen_at`,
		[
			userId,
			purchaseId,
			Number(summary?.payment_time_ts ?? 0),
			typeof summary?.currency === 'string' ? summary.currency : null,
			typeof summary?.status === 'string' ? summary.status : null,
			typeof summary?.received_at === 'string' ? summary.received_at : null,
			typeof summary?.items_summary === 'string' ? summary.items_summary : null,
			typeof summary?.venue_name === 'string' ? summary.venue_name : null,
			JSON.stringify(summary ?? {}),
			nowIso,
			nowIso,
		],
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {{
 * 	catalogOrderCount: number;
 * 	detailOrderCount: number;
 * 	expectedOrderCount: number | null;
 * 	fullBackfillCompleted: boolean;
 * 	newestPaymentTimeTs: number;
 * 	nowIso: string;
 * 	startedAt: string;
 * 	userId: string;
 * }} options
 * @returns {void}
 */
export function updateSyncState(
	db,
	{
		catalogOrderCount,
		detailOrderCount,
		expectedOrderCount,
		fullBackfillCompleted,
		newestPaymentTimeTs,
		nowIso,
		startedAt,
		userId,
	},
) {
	db.run(
		`INSERT INTO sync_state (
			user_id,
			newest_payment_time_ts,
			full_backfill_completed,
			resume_page_token,
			resume_page_number,
			catalog_order_count,
			detail_order_count,
			expected_order_count,
			last_sync_started_at,
			last_sync_finished_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			newest_payment_time_ts = excluded.newest_payment_time_ts,
			full_backfill_completed = excluded.full_backfill_completed,
			resume_page_token = excluded.resume_page_token,
			resume_page_number = excluded.resume_page_number,
			catalog_order_count = excluded.catalog_order_count,
			detail_order_count = excluded.detail_order_count,
			expected_order_count = excluded.expected_order_count,
			last_sync_started_at = excluded.last_sync_started_at,
			last_sync_finished_at = excluded.last_sync_finished_at,
			updated_at = excluded.updated_at`,
		[
			userId,
			newestPaymentTimeTs,
			fullBackfillCompleted ? 1 : 0,
			null,
			1,
			catalogOrderCount,
			detailOrderCount,
			expectedOrderCount,
			startedAt,
			nowIso,
			nowIso,
		],
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {{
 * 	detailsFetched: number;
 * 	finishedAt: string;
 * 	insertedOrders: number;
 * 	ordersScanned: number;
 * 	pagesFetched: number;
 * 	profileName: string;
 * 	reachedHistoryEnd: boolean;
 * 	startedAt: string;
 * 	updatedOrders: number;
 * 	userId: string;
 * }} options
 * @returns {void}
 */
export function insertSyncRun(
	db,
	{
		detailsFetched,
		finishedAt,
		insertedOrders,
		ordersScanned,
		pagesFetched,
		profileName,
		reachedHistoryEnd,
		startedAt,
		updatedOrders,
		userId,
	},
) {
	db.run(
		`INSERT INTO sync_runs (
			user_id,
			profile_name,
			started_at,
			finished_at,
			pages_fetched,
			orders_scanned,
			details_fetched,
			inserted_orders,
			updated_orders,
			reached_history_end
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			userId,
			profileName,
			startedAt,
			finishedAt,
			pagesFetched,
			ordersScanned,
			detailsFetched,
			insertedOrders,
			updatedOrders,
			reachedHistoryEnd ? 1 : 0,
		],
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} userId
 * @returns {number}
 */
export function getCatalogCount(db, userId) {
	return Number(
		queryValue(
			db,
			'SELECT COUNT(*) AS value FROM order_catalog WHERE user_id = ?',
			[userId],
		) ?? 0,
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} userId
 * @returns {number}
 */
export function getDetailCount(db, userId) {
	return Number(
		queryValue(db, 'SELECT COUNT(*) AS value FROM orders WHERE user_id = ?', [
			userId,
		]) ?? 0,
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} userId
 * @returns {number}
 */
export function getNewestCatalogPaymentTimeTs(db, userId) {
	return Number(
		queryValue(
			db,
			'SELECT COALESCE(MAX(payment_time_ts), 0) AS value FROM order_catalog WHERE user_id = ?',
			[userId],
		) ?? 0,
	);
}

/**
 * @param {SqlJsDatabase} db
 * @param {{ forceFull: boolean; userId: string }} options
 * @returns {Array<{ paymentTimeTs: number; purchaseId: string; summary: any }>}
 */
export function loadDetailQueue(db, { forceFull, userId }) {
	const rows = queryAll(
		db,
		forceFull
			? `SELECT purchase_id, payment_time_ts, summary_json
			FROM order_catalog
			WHERE user_id = ?
			ORDER BY payment_time_ts ASC, purchase_id ASC`
			: `SELECT c.purchase_id, c.payment_time_ts, c.summary_json
			FROM order_catalog c
			LEFT JOIN orders o
				ON o.user_id = c.user_id
				AND o.purchase_id = c.purchase_id
			WHERE c.user_id = ?
				AND o.purchase_id IS NULL
			ORDER BY c.payment_time_ts ASC, c.purchase_id ASC`,
		[userId],
	);

	return rows.map((row) => ({
		paymentTimeTs: Number(row.payment_time_ts ?? 0),
		purchaseId: String(row.purchase_id),
		summary: parseStoredJson(row.summary_json),
	}));
}

/**
 * @param {SqlJsDatabase} db
 * @param {{ detail: any; nowIso: string; purchaseId: string; summary: any; userId: string }} options
 * @returns {void}
 */
export function upsertOrderBundle(
	db,
	{ detail, nowIso, purchaseId, summary, userId },
) {
	const totals = detail?.totals ?? {};
	const primaryPayment = Array.isArray(detail?.payments)
		? (detail.payments[0] ?? null)
		: null;
	const localTime = parseLocalDateTime(
		detail?.creation_time ?? summary?.received_at ?? '',
	);
	const itemSummary =
		summary?.items_summary ??
		(Array.isArray(detail?.items)
			? /** @type {any[]} */ (detail.items)
					.map((item) => item?.name)
					.filter(Boolean)
					.join(', ')
			: null);

	db.run(
		`INSERT INTO orders (
			user_id,
			purchase_id,
			order_number,
			status,
			payment_time_ts,
			order_local_datetime,
			order_local_date,
			order_local_month,
			order_local_weekday,
			order_local_hour,
			creation_time_raw,
			delivery_time_raw,
			received_at_raw,
			currency,
			total_amount_minor,
			subtotal_minor,
			items_amount_minor,
			delivery_fee_minor,
			service_fee_minor,
			fees_minor,
			credits_minor,
			tokens_minor,
			discount_amount_minor,
			surcharge_amount_minor,
			delivery_method,
			delivery_city,
			delivery_alias,
			venue_id,
			venue_name,
			venue_country,
			venue_address,
			venue_product_line,
			items_summary,
			payment_provider,
			payment_method_type,
			payment_method_name,
			raw_json,
			synced_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, purchase_id) DO UPDATE SET
			order_number = excluded.order_number,
			status = excluded.status,
			payment_time_ts = excluded.payment_time_ts,
			order_local_datetime = excluded.order_local_datetime,
			order_local_date = excluded.order_local_date,
			order_local_month = excluded.order_local_month,
			order_local_weekday = excluded.order_local_weekday,
			order_local_hour = excluded.order_local_hour,
			creation_time_raw = excluded.creation_time_raw,
			delivery_time_raw = excluded.delivery_time_raw,
			received_at_raw = excluded.received_at_raw,
			currency = excluded.currency,
			total_amount_minor = excluded.total_amount_minor,
			subtotal_minor = excluded.subtotal_minor,
			items_amount_minor = excluded.items_amount_minor,
			delivery_fee_minor = excluded.delivery_fee_minor,
			service_fee_minor = excluded.service_fee_minor,
			fees_minor = excluded.fees_minor,
			credits_minor = excluded.credits_minor,
			tokens_minor = excluded.tokens_minor,
			discount_amount_minor = excluded.discount_amount_minor,
			surcharge_amount_minor = excluded.surcharge_amount_minor,
			delivery_method = excluded.delivery_method,
			delivery_city = excluded.delivery_city,
			delivery_alias = excluded.delivery_alias,
			venue_id = excluded.venue_id,
			venue_name = excluded.venue_name,
			venue_country = excluded.venue_country,
			venue_address = excluded.venue_address,
			venue_product_line = excluded.venue_product_line,
			items_summary = excluded.items_summary,
			payment_provider = excluded.payment_provider,
			payment_method_type = excluded.payment_method_type,
			payment_method_name = excluded.payment_method_name,
			raw_json = excluded.raw_json,
			synced_at = excluded.synced_at`,
		[
			userId,
			purchaseId,
			detail?.order_number ?? null,
			detail?.status ?? summary?.status ?? 'unknown',
			Number(summary?.payment_time_ts ?? 0),
			localTime.datetime,
			localTime.date,
			localTime.month,
			localTime.weekday,
			localTime.hour,
			detail?.creation_time ?? null,
			detail?.delivery_time ?? null,
			summary?.received_at ?? null,
			detail?.currency ?? 'EUR',
			extractMinor(totals.total),
			extractMinor(totals.subtotal),
			extractMinor(totals.items),
			extractMinor(totals.delivery),
			extractMinor(totals.service_fee),
			extractMinor(totals.delivery) + extractMinor(totals.service_fee),
			extractMinor(totals.credits),
			extractMinor(totals.tokens),
			sumCollectionAmounts(detail?.discounts),
			sumCollectionAmounts(detail?.surcharges),
			detail?.delivery_method ?? null,
			detail?.delivery?.city ?? null,
			detail?.delivery?.alias ?? null,
			detail?.venue?.id ?? null,
			detail?.venue?.name ?? summary?.venue_name ?? null,
			detail?.venue?.country ?? null,
			detail?.venue?.address ?? null,
			detail?.venue?.product_line ?? null,
			itemSummary,
			primaryPayment?.provider ?? null,
			primaryPayment?.method_type ?? null,
			primaryPayment?.name ?? null,
			JSON.stringify(detail),
			nowIso,
		],
	);

	db.run(
		'DELETE FROM order_item_option_values WHERE user_id = ? AND purchase_id = ?',
		[userId, purchaseId],
	);
	db.run('DELETE FROM order_items WHERE user_id = ? AND purchase_id = ?', [
		userId,
		purchaseId,
	]);
	db.run('DELETE FROM order_payments WHERE user_id = ? AND purchase_id = ?', [
		userId,
		purchaseId,
	]);

	for (const [paymentIndex, payment] of normalizeArray(
		detail?.payments,
	).entries()) {
		db.run(
			`INSERT INTO order_payments (
				user_id,
				purchase_id,
				payment_index,
				method_id,
				provider,
				method_type,
				method_name,
				amount_minor,
				payment_time_raw
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				userId,
				purchaseId,
				paymentIndex,
				payment?.method_id ?? null,
				payment?.provider ?? null,
				payment?.method_type ?? null,
				payment?.name ?? null,
				extractMinor(payment?.amount),
				payment?.payment_time ?? null,
			],
		);
	}

	for (const [itemIndex, item] of normalizeArray(detail?.items).entries()) {
		db.run(
			`INSERT INTO order_items (
				user_id,
				purchase_id,
				item_index,
				item_id,
				item_name,
				quantity,
				unit_price_minor,
				line_total_minor
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				userId,
				purchaseId,
				itemIndex,
				item?.id ?? null,
				item?.name ?? 'Unknown item',
				Number(item?.count ?? 0),
				extractMinor(item?.price),
				extractMinor(item?.line_total),
			],
		);

		for (const [optionIndex, option] of normalizeArray(
			item?.options,
		).entries()) {
			for (const [valueIndex, value] of normalizeArray(
				option?.values,
			).entries()) {
				db.run(
					`INSERT INTO order_item_option_values (
						user_id,
						purchase_id,
						item_index,
						option_index,
						value_index,
						option_group_id,
						option_group_name,
						option_value_id,
						option_value_name,
						quantity,
						price_minor
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						userId,
						purchaseId,
						itemIndex,
						optionIndex,
						valueIndex,
						option?.id ?? null,
						option?.name ?? null,
						value?.id ?? null,
						value?.name ?? null,
						Number(value?.count ?? 1),
						extractMinor(value?.price),
					],
				);
			}
		}
	}
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} sql
 * @param {import('sql.js').BindParams} [params=[]]
 * @returns {SqlRow[]}
 */
export function queryAll(db, sql, params = []) {
	const statement = db.prepare(sql, params);
	/** @type {SqlRow[]} */
	const rows = [];
	while (statement.step()) {
		rows.push(/** @type {SqlRow} */ (statement.getAsObject()));
	}
	statement.free();
	return rows;
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} sql
 * @param {import('sql.js').BindParams} [params=[]]
 * @returns {SqlRow | null}
 */
export function queryFirst(db, sql, params = []) {
	return queryAll(db, sql, params)[0] ?? null;
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} sql
 * @param {import('sql.js').BindParams} [params=[]]
 * @returns {SqlScalar | null}
 */
export function queryValue(db, sql, params = []) {
	const row = queryFirst(db, sql, params);
	return row ? row.value : null;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampInteger(value, min, max) {
	if (!Number.isFinite(value)) {
		return max;
	}
	return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * @param {string} outputPath
 * @param {SqlJsDatabase} db
 * @returns {void}
 */
export function writeDatabaseSnapshot(outputPath, db) {
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, Buffer.from(db.export()));
}

/**
 * @param {unknown} value
 * @returns {any}
 */
function parseStoredJson(value) {
	const raw = String(value ?? '').trim();
	if (!raw) {
		return {};
	}

	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/**
 * @param {unknown} rawValue
 * @returns {{ date: string | null; datetime: string | null; hour: number | null; month: string | null; weekday: number | null }}
 */
function parseLocalDateTime(rawValue) {
	const raw = String(rawValue ?? '').trim();
	const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})$/);
	if (!match) {
		return {
			date: null,
			datetime: null,
			hour: null,
			month: null,
			weekday: null,
		};
	}

	const [, day, month, year, hour, minute] = match;
	const date = `${year}-${month}-${day}`;
	return {
		date,
		datetime: `${date}T${hour}:${minute}:00`,
		hour: Number(hour),
		month: `${year}-${month}`,
		weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
	};
}

/**
 * @param {any} candidate
 * @returns {number}
 */
function extractMinor(candidate) {
	if (typeof candidate === 'number') {
		return candidate;
	}
	if (!candidate || typeof candidate !== 'object') {
		return 0;
	}
	if (typeof candidate.amount === 'number') {
		return candidate.amount;
	}
	if (candidate.amount && typeof candidate.amount.amount === 'number') {
		return candidate.amount.amount;
	}
	if (candidate.value && typeof candidate.value.amount === 'number') {
		return candidate.value.amount;
	}
	if (candidate.line_total && typeof candidate.line_total.amount === 'number') {
		return candidate.line_total.amount;
	}
	return 0;
}

/**
 * @param {unknown} entries
 * @returns {number}
 */
function sumCollectionAmounts(entries) {
	return normalizeArray(entries).reduce(
		(sum, entry) => sum + extractMinor(entry),
		0,
	);
}

/**
 * @param {unknown} value
 * @returns {any[]}
 */
function normalizeArray(value) {
	return Array.isArray(value) ? value : [];
}

/**
 * @param {SqlJsDatabase} db
 * @param {string} tableName
 * @param {string} columnName
 * @param {string} definition
 * @returns {void}
 */
function ensureColumn(db, tableName, columnName, definition) {
	const columns = queryAll(db, `PRAGMA table_info(${tableName})`);
	if (columns.some((column) => column.name === columnName)) {
		return;
	}

	db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
