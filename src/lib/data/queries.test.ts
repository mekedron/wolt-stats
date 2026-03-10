import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

import {
	getCurrencyTrendPulse,
	getFilterMetadata,
	getFreshness,
	getMonthlyFeeSeries,
	getMonthlyMedianFeeSeries,
	getMonthlyMedianSeries,
	getMonthlyOrderCountSeries,
	getSummaryMetrics,
} from '$lib/data/queries';
import type { DashboardFilters } from '$lib/types';
import {
	ensureSchema,
	upsertUser,
} from '../../../scripts/lib/wolt-sync-db.mjs';

const filters: DashboardFilters = {
	city: 'all',
	country: 'all',
	currency: 'all',
	dayKind: 'all',
	daypart: 'all',
	endDate: '2025-12-31',
	productLine: 'all',
	startDate: '2025-01-01',
	userId: 'user-1',
	venueId: 'all',
};

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
	SQL = await initSqlJs();
});

describe('query helpers', () => {
	it('builds monthly median and order-count series, plus summary medians', () => {
		const db = createSeedDatabase();

		expect(getMonthlyMedianSeries(db, filters)).toContainEqual({
			label: '2025-01',
			series: 'EUR',
			value: 1200,
		});
		expect(getMonthlyOrderCountSeries(db, filters)).toContainEqual({
			label: '2025-12',
			series: 'EUR',
			value: 3,
		});

		const summary = getSummaryMetrics(db, filters);
		expect(summary.medianOrderValue).toEqual([
			{ amountMinor: 1400, currency: 'EUR' },
		]);
		expect(summary.totalSpend[0]).toEqual({
			amountMinor: 50400,
			currency: 'EUR',
		});
		expect(
			getMonthlyMedianFeeSeries(db, filters).find(
				(row) => row.label === '2025-01',
			),
		).toEqual({
			label: '2025-01',
			series: 'Typical fee share',
			value: 0.125,
		});
		expect(
			getMonthlyFeeSeries(db, filters).find((row) => row.label === '2025-12')
				?.value,
		).toBeCloseTo(0.093995098, 6);
	});

	it('computes freshness and six-month pulse from sync state', () => {
		const db = createSeedDatabase();

		const freshness = getFreshness(db);
		expect(freshness.catalogOrders).toBe(36);
		expect(freshness.totalOrders).toBe(36);
		expect(freshness.expectedOrders).toBe(36);
		expect(freshness.missingDetails).toBe(0);
		expect(freshness.coverageStart).toBe('2025-01-05');
		expect(freshness.coverageEnd).toBe('2025-12-07');

		const [pulse] = getCurrencyTrendPulse(db, filters);
		expect(pulse.currency).toBe('EUR');
		expect(pulse.recentMedianMinor).toBe(1550);
		expect(pulse.previousMedianMinor).toBe(1250);
		expect(pulse.medianDeltaRatio).toBeCloseTo(0.24, 5);
	});

	it('groups venue filter options by country and city', () => {
		const db = createSeedDatabase();

		insertOrder(db, {
			city: '',
			monthIndex: 9,
			paymentTimeTs: Date.UTC(2025, 9, 7),
			purchaseId: 'order-unknown-city-1',
			totalAmountMinor: 1800,
			venueCountry: 'FIN',
			venueId: 'venue-4',
			venueName: 'Mystery Venue',
		});
		insertOrder(db, {
			city: 'Kraków',
			currency: 'PLN',
			monthIndex: 10,
			paymentTimeTs: Date.UTC(2025, 10, 16),
			purchaseId: 'order-poland-1',
			totalAmountMinor: 3200,
			venueCountry: 'POL',
			venueId: 'venue-2',
			venueName: 'Pierogi Place',
		});
		insertOrder(db, {
			city: "T'bilisi",
			currency: 'GEL',
			monthIndex: 8,
			paymentTimeTs: Date.UTC(2025, 8, 4),
			purchaseId: 'order-georgia-1',
			totalAmountMinor: 4100,
			venueCountry: 'GEO',
			venueId: 'venue-3',
			venueName: 'Khinkali House',
		});

		const metadata = getFilterMetadata(db, 'user-1');
		expect(metadata.cities).toContainEqual({
			label: 'Unknown',
			value: 'Unknown',
		});
		expect(metadata.cities).not.toContainEqual({
			label: '',
			value: '',
		});
		expect(metadata.venues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					city: 'Unknown',
					country: 'FIN',
					options: expect.arrayContaining([
						expect.objectContaining({ value: 'venue-4' }),
					]),
				}),
				expect.objectContaining({
					city: 'Espoo',
					country: 'FIN',
					options: expect.arrayContaining([
						expect.objectContaining({ value: 'venue-1' }),
					]),
				}),
				expect.objectContaining({
					city: 'Kraków',
					country: 'POL',
					options: expect.arrayContaining([
						expect.objectContaining({ value: 'venue-2' }),
					]),
				}),
				expect.objectContaining({
					city: "T'bilisi",
					country: 'GEO',
					options: expect.arrayContaining([
						expect.objectContaining({ value: 'venue-3' }),
					]),
				}),
			]),
		);

		expect(
			getMonthlyOrderCountSeries(db, {
				...filters,
				city: 'Kraków',
				country: 'POL',
				currency: 'PLN',
				venueId: 'venue-2',
			}),
		).toEqual([{ label: '2025-11', series: 'PLN', value: 1 }]);
	});
});

function createSeedDatabase() {
	const db = new SQL.Database();
	ensureSchema(db);
	upsertUser(db, {
		nowIso: '2026-03-10T12:00:00Z',
		userEmail: 'demo@example.com',
		userId: 'user-1',
		userLabel: 'demo',
	});

	db.run(
		`INSERT INTO sync_state (
			user_id,
			newest_payment_time_ts,
			full_backfill_completed,
			catalog_order_count,
			detail_order_count,
			expected_order_count,
			last_sync_started_at,
			last_sync_finished_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			'user-1',
			1733536800000,
			1,
			36,
			36,
			36,
			'2026-03-10T11:55:00Z',
			'2026-03-10T12:00:00Z',
			'2026-03-10T12:00:00Z',
		],
	);

	for (const monthIndex of Array.from({ length: 12 }, (_, index) => index)) {
		const month = String(monthIndex + 1).padStart(2, '0');
		const base =
			monthIndex < 6 ? 1200 + monthIndex * 20 : 1500 + (monthIndex - 6) * 20;
		for (const [offset] of [-100, 0, 100].entries()) {
			const day = 5 + offset;
			insertOrder(db, {
				day,
				monthIndex,
				paymentTimeTs: Date.UTC(2025, monthIndex, day),
				purchaseId: `order-${month}-${offset}`,
				totalAmountMinor: base + (offset - 1) * 100,
			});
		}
	}

	return db;
}

function insertOrder(
	db: InstanceType<typeof SQL.Database>,
	{
		city = 'Espoo',
		currency = 'EUR',
		day = 5,
		monthIndex,
		paymentTimeTs,
		purchaseId,
		totalAmountMinor,
		venueCountry = 'FIN',
		venueId = 'venue-1',
		venueName = 'Venue One',
	}: {
		city?: string;
		currency?: string;
		day?: number;
		monthIndex: number;
		paymentTimeTs: number;
		purchaseId: string;
		totalAmountMinor: number;
		venueCountry?: string;
		venueId?: string;
		venueName?: string;
	},
) {
	const month = String(monthIndex + 1).padStart(2, '0');
	const dayValue = String(day).padStart(2, '0');

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
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			'user-1',
			purchaseId,
			String(paymentTimeTs),
			'delivered',
			paymentTimeTs,
			`2025-${month}-${dayValue}T12:00:00`,
			`2025-${month}-${dayValue}`,
			`2025-${month}`,
			monthIndex % 7,
			12,
			`${dayValue}/${month}/2025, 12:00`,
			`${dayValue}/${month}/2025, 12:30`,
			`${dayValue}/${month}/2025, 12:35`,
			currency,
			totalAmountMinor,
			totalAmountMinor,
			totalAmountMinor,
			100,
			50,
			150,
			0,
			0,
			0,
			0,
			'homedelivery',
			city,
			'Home',
			venueId,
			venueName,
			venueCountry,
			'Venue Street 1',
			'restaurant',
			'Order summary',
			'card',
			'card',
			'Visa',
			'{}',
			'2026-03-10T12:00:00Z',
		],
	);
}
