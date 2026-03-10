import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

import { backupExistingDatabase, populateDemoDatabase } from './demo-db.mjs';
import { queryFirst } from './wolt-sync-db.mjs';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

describe('demo db generator', () => {
	it('builds a one-year demo database with full detail coverage', () => {
		const db = new SQL.Database();
		const summary = populateDemoDatabase(db, {
			endDate: '2026-03-10T17:00:00Z',
			seed: 4242,
		});

		const counts = queryFirst(
			db,
			`SELECT
				(SELECT COUNT(*) FROM users) AS users_count,
				(SELECT COUNT(*) FROM order_catalog) AS catalog_count,
				(SELECT COUNT(*) FROM orders) AS detail_count,
				(SELECT MIN(order_local_date) FROM orders) AS min_date,
				(SELECT MAX(order_local_date) FROM orders) AS max_date,
				(SELECT COUNT(DISTINCT currency) FROM orders) AS currency_count`,
		);

		expect(Number(counts?.users_count ?? 0)).toBe(summary.users);
		expect(Number(counts?.catalog_count ?? 0)).toBe(summary.catalogOrders);
		expect(Number(counts?.detail_count ?? 0)).toBe(summary.detailOrders);
		expect(String(counts?.min_date ?? '') >= summary.startDate).toBe(true);
		expect(String(counts?.max_date ?? '') <= summary.endDate).toBe(true);
		expect(Number(counts?.currency_count ?? 0)).toBeGreaterThanOrEqual(3);

		const syncCounts = db.exec(
			'SELECT catalog_order_count, detail_order_count FROM sync_state ORDER BY user_id',
		)[0].values;
		for (const [catalogCount, detailCount] of syncCounts) {
			expect(catalogCount).toBe(detailCount);
		}
	});

	it('backs up an existing live database without touching the source file', () => {
		const directory = mkdtempSync(join(tmpdir(), 'wolt-stats-demo-db-'));
		const sourcePath = join(directory, 'wolt-history.sqlite');
		writeFileSync(sourcePath, Buffer.from('real-db'));

		const backupPath = backupExistingDatabase(sourcePath, {
			now: new Date('2026-03-10T12:00:00Z'),
		});

		expect(backupPath).toBeTruthy();
		expect(existsSync(backupPath ?? '')).toBe(true);
		expect(readFileSync(sourcePath, 'utf8')).toBe('real-db');
		expect(readFileSync(backupPath ?? '', 'utf8')).toBe('real-db');
	});
});
