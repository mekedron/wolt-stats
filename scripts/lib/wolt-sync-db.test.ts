import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

import {
	ensureSchema,
	getCatalogCount,
	loadDetailQueue,
	loadDatabase,
	upsertOrderBundle,
	upsertOrderCatalogEntry,
	upsertUser,
} from './wolt-sync-db.mjs';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

describe('wolt sync db helpers', () => {
	it('deduplicates the catalog and returns missing details oldest first', () => {
		const db = new SQL.Database();
		ensureSchema(db);
		upsertUser(db, {
			nowIso: '2026-03-10T12:00:00Z',
			userEmail: 'demo@example.com',
			userId: 'user-1',
			userLabel: 'demo',
		});

		upsertOrderCatalogEntry(db, {
			nowIso: '2026-03-10T12:00:00Z',
			summary: {
				currency: 'EUR',
				payment_time_ts: 300,
				purchase_id: 'c',
				received_at: '03/01/2025, 12:00',
				status: 'delivered',
			},
			userId: 'user-1',
		});
		upsertOrderCatalogEntry(db, {
			nowIso: '2026-03-10T12:00:00Z',
			summary: {
				currency: 'EUR',
				payment_time_ts: 100,
				purchase_id: 'a',
				received_at: '01/01/2025, 12:00',
				status: 'delivered',
			},
			userId: 'user-1',
		});
		upsertOrderCatalogEntry(db, {
			nowIso: '2026-03-10T12:00:00Z',
			summary: {
				currency: 'EUR',
				payment_time_ts: 200,
				purchase_id: 'b',
				received_at: '02/01/2025, 12:00',
				status: 'delivered',
			},
			userId: 'user-1',
		});
		upsertOrderCatalogEntry(db, {
			nowIso: '2026-03-10T12:05:00Z',
			summary: {
				currency: 'EUR',
				payment_time_ts: 100,
				purchase_id: 'a',
				received_at: '01/01/2025, 12:00',
				status: 'refreshed',
			},
			userId: 'user-1',
		});

		upsertOrderBundle(db, {
			detail: {
				currency: 'EUR',
				delivery: { alias: 'Home', city: 'Espoo' },
				delivery_method: 'homedelivery',
				items: [],
				order_number: '1',
				payments: [],
				status: 'delivered',
				totals: {
					delivery: { amount: 100 },
					items: { amount: 900 },
					service_fee: { amount: 50 },
					subtotal: { amount: 1050 },
					total: { amount: 1050 },
				},
				venue: {
					address: 'Venue Street 1',
					country: 'POL',
					id: 'venue-1',
					name: 'Pierogi Place',
					product_line: 'restaurant',
				},
			},
			nowIso: '2026-03-10T12:10:00Z',
			purchaseId: 'b',
			summary: {
				items_summary: 'Pierogi',
				payment_time_ts: 200,
				received_at: '02/01/2025, 12:00',
				status: 'delivered',
				venue_name: 'Pierogi Place',
			},
			userId: 'user-1',
		});

		expect(getCatalogCount(db, 'user-1')).toBe(3);
		expect(
			loadDetailQueue(db, { forceFull: false, userId: 'user-1' }).map(
				(row) => row.purchaseId,
			),
		).toEqual(['a', 'c']);
		expect(
			loadDetailQueue(db, { forceFull: true, userId: 'user-1' }).map(
				(row) => row.purchaseId,
			),
		).toEqual(['a', 'b', 'c']);

		const country = db.exec(
			`SELECT venue_country FROM orders WHERE user_id = 'user-1' AND purchase_id = 'b'`,
		)[0].values[0][0];
		expect(country).toBe('POL');
	});

	it('can open a fresh in-memory database through loadDatabase', () => {
		const db = loadDatabase(SQL, '/tmp/non-existent-wolt-test.sqlite');
		expect(db).toBeDefined();
		db.close();
	});
});
