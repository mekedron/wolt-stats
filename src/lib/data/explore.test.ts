import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

import {
	getMenuMemoryItems,
	getProductOrderCountSeries,
	getProductPriceBreakdownSeries,
	getProductPriceSeries,
	getProductProfile,
	getRecentOrders,
	getVenueSnapshot,
} from '$lib/data/explore';
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

describe('explore queries', () => {
	it('returns recent orders with expanded items and computed unit-price fallbacks', () => {
		const db = createExploreDatabase();

		const orders = getRecentOrders(db, filters, 2);
		expect(orders).toHaveLength(2);
		expect(orders[0]?.purchaseId).toBe('order-a3');
		expect(orders[0]?.venueName).toBe('Pasta Corner');
		expect(orders[0]?.feeShare).toBeCloseTo(200 / 3400, 6);
		expect(orders[0]?.items).toEqual([
			{
				itemName: 'Pasta',
				lineTotalMinor: 3000,
				quantity: 2,
				unitPriceMinor: 1500,
			},
			{
				itemName: 'Dessert',
				lineTotalMinor: 200,
				quantity: 1,
				unitPriceMinor: 200,
			},
		]);
		expect(orders[1]?.purchaseId).toBe('order-b1');
	});

	it('builds product price trends and distinct-order counts for repeated items', () => {
		const db = createExploreDatabase();

		expect(getProductPriceSeries(db, filters, 'Burger')).toEqual([
			{ label: '2025-01', series: 'EUR', value: 1000 },
			{ label: '2025-02', series: 'EUR', value: 1300 },
			{ label: '2025-03', series: 'EUR', value: 1344 },
		]);
		expect(getProductPriceBreakdownSeries(db, filters, 'Burger')).toEqual([
			{
				currency: 'EUR',
				label: '2025-01',
				metric: 'Line price',
				value: 1000,
			},
			{
				currency: 'EUR',
				label: '2025-01',
				metric: 'Listed price',
				value: 1000,
			},
			{
				currency: 'EUR',
				label: '2025-01',
				metric: 'Net after discounts',
				value: 1000,
			},
			{
				currency: 'EUR',
				label: '2025-02',
				metric: 'Line price',
				value: 1300,
			},
			{
				currency: 'EUR',
				label: '2025-02',
				metric: 'Listed price',
				value: 1300,
			},
			{
				currency: 'EUR',
				label: '2025-02',
				metric: 'Net after discounts',
				value: 1300,
			},
			{
				currency: 'EUR',
				label: '2025-03',
				metric: 'Line price',
				value: 1600,
			},
			{
				currency: 'EUR',
				label: '2025-03',
				metric: 'Listed price',
				value: 1600,
			},
			{
				currency: 'EUR',
				label: '2025-03',
				metric: 'Net after discounts',
				value: 1344,
			},
		]);
		expect(getProductOrderCountSeries(db, filters, 'Burger')).toEqual([
			{ label: '2025-01', series: 'EUR', value: 1 },
			{ label: '2025-02', series: 'EUR', value: 1 },
			{ label: '2025-03', series: 'EUR', value: 1 },
		]);

		expect(getProductProfile(db, filters, 'Burger')).toEqual({
			firstSeen: '2025-01-10',
			lastSeen: '2025-03-12',
			latestListedPrices: [{ amountMinor: 1600, currency: 'EUR' }],
			latestObservedPrices: [{ amountMinor: 1344, currency: 'EUR' }],
			medianListedPrices: [{ amountMinor: 1300, currency: 'EUR' }],
			medianObservedPrices: [{ amountMinor: 1272, currency: 'EUR' }],
			name: 'Burger',
			orderCount: 3,
			unitCount: 4,
			venueCount: 2,
		});
	});

	it('builds venue snapshots and menu memory with deduped order counts', () => {
		const db = createExploreDatabase();
		const venueFilters: DashboardFilters = { ...filters, venueId: 'venue-a' };

		expect(getVenueSnapshot(db, venueFilters)).toEqual({
			activeMonths: 3,
			avgFeeRate: expect.closeTo((200 / 1800 + 200 / 3000 + 200 / 3400) / 3, 6),
			city: 'Espoo',
			country: 'FIN',
			firstSeen: '2025-01-10',
			lastSeen: '2025-04-08',
			medianOrderValue: [{ amountMinor: 3000, currency: 'EUR' }],
			productLine: 'restaurant',
			totalOrders: 3,
			totalSpend: [{ amountMinor: 8200, currency: 'EUR' }],
			venueId: 'venue-a',
			venueName: 'Pasta Corner',
		});

		expect(getMenuMemoryItems(db, venueFilters, 3)).toEqual([
			{
				currency: 'EUR',
				lastSeen: '2025-02-05',
				latestUnitPriceMinor: 1400,
				medianUnitPriceMinor: 1200,
				name: 'Burger',
				orderCount: 2,
				unitCount: 3,
			},
			{
				currency: 'EUR',
				lastSeen: '2025-04-08',
				latestUnitPriceMinor: 1500,
				medianUnitPriceMinor: 1500,
				name: 'Pasta',
				orderCount: 1,
				unitCount: 2,
			},
			{
				currency: 'EUR',
				lastSeen: '2025-04-08',
				latestUnitPriceMinor: 200,
				medianUnitPriceMinor: 200,
				name: 'Dessert',
				orderCount: 1,
				unitCount: 1,
			},
		]);
	});
});

function createExploreDatabase() {
	const db = new SQL.Database();
	ensureSchema(db);
	upsertUser(db, {
		nowIso: '2026-03-10T12:00:00Z',
		userEmail: 'demo@example.com',
		userId: 'user-1',
		userLabel: 'demo',
	});

	insertOrderWithItems(db, {
		city: 'Espoo',
		currency: 'EUR',
		feesMinor: 200,
		items: [
			{
				itemName: 'Burger',
				lineTotalMinor: 1000,
				quantity: 1,
				unitPriceMinor: 1000,
			},
			{
				itemName: 'Fries',
				lineTotalMinor: 600,
				quantity: 1,
				unitPriceMinor: 600,
			},
		],
		orderLocalDate: '2025-01-10',
		paymentTimeTs: Date.UTC(2025, 0, 10, 12),
		purchaseId: 'order-a1',
		totalAmountMinor: 1800,
		venueCountry: 'FIN',
		venueId: 'venue-a',
		venueName: 'Pasta Corner',
	});

	insertOrderWithItems(db, {
		city: 'Espoo',
		currency: 'EUR',
		feesMinor: 200,
		items: [
			{
				itemName: 'Burger',
				lineTotalMinor: 1200,
				quantity: 1,
				unitPriceMinor: 1200,
			},
			{
				itemName: 'Burger',
				lineTotalMinor: 1400,
				quantity: 1,
				unitPriceMinor: 1400,
			},
			{
				itemName: 'Soda',
				lineTotalMinor: 200,
				quantity: 1,
				unitPriceMinor: 200,
			},
		],
		orderLocalDate: '2025-02-05',
		paymentTimeTs: Date.UTC(2025, 1, 5, 12),
		purchaseId: 'order-a2',
		totalAmountMinor: 3000,
		venueCountry: 'FIN',
		venueId: 'venue-a',
		venueName: 'Pasta Corner',
	});

	insertOrderWithItems(db, {
		city: 'Helsinki',
		currency: 'EUR',
		discountAmountMinor: 400,
		feesMinor: 100,
		items: [
			{
				itemName: 'Burger',
				lineTotalMinor: 1600,
				quantity: 1,
				unitPriceMinor: 1600,
			},
			{
				itemName: 'Salad',
				lineTotalMinor: 900,
				quantity: 1,
				unitPriceMinor: 900,
			},
		],
		orderLocalDate: '2025-03-12',
		paymentTimeTs: Date.UTC(2025, 2, 12, 12),
		purchaseId: 'order-b1',
		totalAmountMinor: 2200,
		venueCountry: 'FIN',
		venueId: 'venue-b',
		venueName: 'Nordic Greens',
	});

	insertOrderWithItems(db, {
		city: 'Espoo',
		currency: 'EUR',
		feesMinor: 200,
		items: [
			{
				itemName: 'Pasta',
				lineTotalMinor: 3000,
				quantity: 2,
				unitPriceMinor: 0,
			},
			{
				itemName: 'Dessert',
				lineTotalMinor: 200,
				quantity: 1,
				unitPriceMinor: 200,
			},
		],
		orderLocalDate: '2025-04-08',
		paymentTimeTs: Date.UTC(2025, 3, 8, 12),
		purchaseId: 'order-a3',
		totalAmountMinor: 3400,
		venueCountry: 'FIN',
		venueId: 'venue-a',
		venueName: 'Pasta Corner',
	});

	return db;
}

function insertOrderWithItems(
	db: InstanceType<typeof SQL.Database>,
	{
		city,
		currency,
		discountAmountMinor = 0,
		feesMinor,
		items,
		orderLocalDate,
		paymentTimeTs,
		purchaseId,
		totalAmountMinor,
		venueCountry,
		venueId,
		venueName,
	}: {
		city: string;
		currency: string;
		discountAmountMinor?: number;
		feesMinor: number;
		items: Array<{
			itemName: string;
			lineTotalMinor: number;
			quantity: number;
			unitPriceMinor: number;
		}>;
		orderLocalDate: string;
		paymentTimeTs: number;
		purchaseId: string;
		totalAmountMinor: number;
		venueCountry: string;
		venueId: string;
		venueName: string;
	},
) {
	const moment = new Date(paymentTimeTs);
	const month = orderLocalDate.slice(0, 7);
	const weekday = moment.getUTCDay();
	const hour = moment.getUTCHours();
	const itemsAmountMinor = items.reduce(
		(sum, item) => sum + item.lineTotalMinor,
		0,
	);

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
			purchaseId.toUpperCase(),
			'delivered',
			paymentTimeTs,
			`${orderLocalDate}T12:00:00`,
			orderLocalDate,
			month,
			weekday,
			hour,
			`${orderLocalDate}T12:00:00`,
			`${orderLocalDate}T12:25:00`,
			`${orderLocalDate}T12:35:00`,
			currency,
			totalAmountMinor,
			itemsAmountMinor,
			itemsAmountMinor,
			feesMinor,
			0,
			feesMinor,
			0,
			0,
			discountAmountMinor,
			0,
			'homedelivery',
			city,
			'Home',
			venueId,
			venueName,
			venueCountry,
			'Example street 1',
			'restaurant',
			items.map((item) => item.itemName).join(', '),
			'card',
			'card',
			'Visa',
			'{}',
			'2026-03-10T12:00:00Z',
		],
	);

	for (const [itemIndex, item] of items.entries()) {
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
				'user-1',
				purchaseId,
				itemIndex,
				`${purchaseId}-${itemIndex}`,
				item.itemName,
				item.quantity,
				item.unitPriceMinor,
				item.lineTotalMinor,
			],
		);
	}
}
