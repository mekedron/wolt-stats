import { queryAll, queryFirst, type SqlDatabase } from '$lib/data/sql';
import type {
	CurrencyAmount,
	DashboardFilters,
	MenuMemoryItem,
	MetricSeriesPoint,
	OrderLedgerPage,
	OrderLineItem,
	OrderRecord,
	ProductProfile,
	SeriesPoint,
	VenueSnapshot,
} from '$lib/types';

type SqlScalar = number | string | null | Uint8Array | undefined;
type SqlRow = Record<string, SqlScalar>;

type ProductObservation = {
	currency: string;
	label: string;
	listedUnitPriceMinor: number;
	lineUnitPriceMinor: number;
	netUnitPriceMinor: number;
	orderLocalDate: string | null;
	paymentTimeTs: number;
	purchaseId: string;
	quantity: number;
	venueId: string | null;
};

export function getOrderLedgerPage(
	db: SqlDatabase,
	filters: DashboardFilters,
	{
		limit = 25,
		offset = 0,
	}: {
		limit?: number | null;
		offset?: number;
	} = {},
): OrderLedgerPage {
	const scope = buildOrderScope(filters);
	const totalOrders = asNumber(
		queryFirst<SqlRow>(
			db,
			`SELECT COUNT(*) AS total_orders
			FROM orders
			${scope.where}`,
			scope.params,
		)?.total_orders,
	);
	const safeLimit =
		typeof limit === 'number' && Number.isFinite(limit) && limit > 0
			? Math.floor(limit)
			: null;
	const safeOffset =
		safeLimit === null || totalOrders === 0
			? 0
			: Math.min(
					Math.max(0, Math.floor(offset)),
					Math.floor((totalOrders - 1) / safeLimit) * safeLimit,
				);

	if (totalOrders === 0) {
		return {
			limit: safeLimit,
			offset: 0,
			orders: [],
			totalOrders: 0,
		};
	}

	const orderRows = queryAll<SqlRow>(
		db,
		`SELECT
			purchase_id,
			order_number,
			payment_time_ts,
			order_local_date,
			order_local_datetime,
			currency,
			total_amount_minor,
			fees_minor,
			delivery_city,
			venue_id,
			COALESCE(venue_name, 'Unknown venue') AS venue_name,
			COALESCE(venue_country, 'UNK') AS venue_country,
			venue_product_line,
			COALESCE(payment_method_name, payment_provider) AS payment_method_name,
			items_summary
		FROM orders
		${scope.where}
		ORDER BY payment_time_ts DESC
		${safeLimit === null ? '' : 'LIMIT ? OFFSET ?'}`,
		safeLimit === null
			? scope.params
			: [...scope.params, safeLimit, safeOffset],
	);

	return {
		limit: safeLimit,
		offset: safeOffset,
		orders: hydrateOrderRecords(db, scope, orderRows),
		totalOrders,
	};
}

export function getRecentOrders(
	db: SqlDatabase,
	filters: DashboardFilters,
	limit = 18,
): OrderRecord[] {
	return getOrderLedgerPage(db, filters, { limit, offset: 0 }).orders;
}

export function getProductPriceSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
	itemName: string,
): SeriesPoint[] {
	const observations = loadProductObservations(db, filters, itemName);
	return groupMedianSeries(observations, (row) => row.netUnitPriceMinor);
}

export function getProductPriceBreakdownSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
	itemName: string,
): MetricSeriesPoint[] {
	const observations = loadProductObservations(db, filters, itemName);
	return groupMetricMedianSeries(observations);
}

export function getProductOrderCountSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
	itemName: string,
): SeriesPoint[] {
	const observations = loadProductObservations(db, filters, itemName);
	const grouped = new Map<string, Set<string>>();

	for (const row of observations) {
		const key = `${row.label}\u0000${row.currency}`;
		const bucket = grouped.get(key) ?? new Set<string>();
		bucket.add(row.purchaseId);
		grouped.set(key, bucket);
	}

	return [...grouped.entries()]
		.map(([key, purchases]) => {
			const [label, series] = key.split('\u0000');
			return {
				label,
				series,
				value: purchases.size,
			} satisfies SeriesPoint;
		})
		.sort(compareSeriesPoint);
}

export function getProductProfile(
	db: SqlDatabase,
	filters: DashboardFilters,
	itemName: string,
): ProductProfile | null {
	if (!itemName) {
		return null;
	}

	const observations = loadProductObservations(db, filters, itemName);
	if (observations.length === 0) {
		return null;
	}

	const scope = buildOrderScope(filters);
	const overview = queryFirst<SqlRow>(
		db,
		`SELECT
			COUNT(DISTINCT o.purchase_id) AS order_count,
			COALESCE(SUM(i.quantity), 0) AS unit_count,
			COUNT(DISTINCT COALESCE(o.venue_id, o.venue_name)) AS venue_count,
			MIN(o.order_local_date) AS first_seen,
			MAX(o.order_local_date) AS last_seen
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${appendCondition(replaceOrdersAlias(scope.where, 'o'), 'i.item_name = ?')}`,
		[...scope.params, itemName],
	);

	return {
		firstSeen: nullableString(overview?.first_seen),
		lastSeen: nullableString(overview?.last_seen),
		latestListedPrices: toCurrencyAmounts(
			observations,
			selectLatestListedValue,
		),
		latestObservedPrices: toCurrencyAmounts(observations, selectLatestNetValue),
		medianListedPrices: toCurrencyAmounts(
			observations,
			selectMedianListedValue,
		),
		medianObservedPrices: toCurrencyAmounts(observations, selectMedianNetValue),
		name: itemName,
		orderCount: asNumber(overview?.order_count),
		unitCount: asNumber(overview?.unit_count),
		venueCount: asNumber(overview?.venue_count),
	};
}

export function getVenueSnapshot(
	db: SqlDatabase,
	filters: DashboardFilters,
): VenueSnapshot | null {
	const scope = buildOrderScope(filters);
	const overview = queryFirst<SqlRow>(
		db,
		`SELECT
			COALESCE(venue_id, '') AS venue_id,
			COALESCE(venue_name, 'Unknown venue') AS venue_name,
			COALESCE(venue_country, 'UNK') AS venue_country,
			${cityExpression()} AS delivery_city,
			venue_product_line,
			COUNT(*) AS total_orders,
			COUNT(DISTINCT order_local_month) AS active_months,
			MIN(order_local_date) AS first_seen,
			MAX(order_local_date) AS last_seen,
			COALESCE(
				AVG(
					CASE
						WHEN total_amount_minor > 0 THEN CAST(fees_minor AS REAL) / total_amount_minor
						ELSE NULL
					END
				),
				0
			) AS avg_fee_rate
		FROM orders
		${scope.where}
		GROUP BY venue_id, venue_name, venue_country, delivery_city, venue_product_line
		ORDER BY total_orders DESC, MAX(payment_time_ts) DESC
		LIMIT 1`,
		scope.params,
	);

	if (!overview) {
		return null;
	}

	const totalSpend = queryAll<SqlRow>(
		db,
		`SELECT currency, SUM(total_amount_minor) AS amount_minor
		FROM orders
		${scope.where}
		GROUP BY currency
		ORDER BY amount_minor DESC`,
		scope.params,
	).map(toCurrencyAmount);

	const medianOrderValue = queryAll<SqlRow>(
		db,
		`WITH ranked AS (
			SELECT
				currency,
				total_amount_minor,
				ROW_NUMBER() OVER (PARTITION BY currency ORDER BY total_amount_minor ASC) AS rn,
				COUNT(*) OVER (PARTITION BY currency) AS cnt
			FROM orders
			${scope.where}
		)
		SELECT currency, AVG(total_amount_minor) AS amount_minor
		FROM ranked
		WHERE rn IN (CAST((cnt + 1) / 2 AS INTEGER), CAST((cnt + 2) / 2 AS INTEGER))
		GROUP BY currency
		ORDER BY amount_minor DESC`,
		scope.params,
	).map(toCurrencyAmount);

	return {
		activeMonths: asNumber(overview.active_months),
		avgFeeRate: asNumber(overview.avg_fee_rate),
		city: nullableString(overview.delivery_city),
		country: asString(overview.venue_country) ?? 'UNK',
		firstSeen: nullableString(overview.first_seen),
		lastSeen: nullableString(overview.last_seen),
		medianOrderValue,
		productLine: nullableString(overview.venue_product_line),
		totalOrders: asNumber(overview.total_orders),
		totalSpend,
		venueId: nullableString(overview.venue_id),
		venueName: asString(overview.venue_name) ?? 'Unknown venue',
	};
}

export function getMenuMemoryItems(
	db: SqlDatabase,
	filters: DashboardFilters,
	limit = 10,
): MenuMemoryItem[] {
	const scope = buildOrderScope(filters);
	const rows = queryAll<SqlRow>(
		db,
		`SELECT
			o.purchase_id,
			i.item_name,
			i.quantity,
			i.unit_price_minor,
			i.line_total_minor,
			o.currency,
			o.payment_time_ts,
			o.order_local_date
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${replaceOrdersAlias(scope.where, 'o')}
		ORDER BY o.payment_time_ts DESC, i.item_index ASC`,
		scope.params,
	);

	const grouped = new Map<
		string,
		{
			currency: string;
			latestPaymentTimeTs: number;
			lastSeen: string | null;
			latestUnitPriceMinor: number | null;
			name: string;
			orderIds: Set<string>;
			prices: number[];
			unitCount: number;
		}
	>();

	for (const row of rows) {
		const name = asString(row.item_name) ?? 'Unknown item';
		const currency = asString(row.currency) ?? 'EUR';
		const key = `${name}\u0000${currency}`;
		const unitPriceMinor = resolveUnitPriceMinor(row);
		const purchaseId = asString(row.purchase_id) ?? '';
		const next = grouped.get(key) ?? {
			currency,
			latestPaymentTimeTs: -1,
			lastSeen: null as string | null,
			latestUnitPriceMinor: null,
			name,
			orderIds: new Set<string>(),
			prices: [],
			unitCount: 0,
		};
		const paymentTimeTs = asNumber(row.payment_time_ts);
		if (paymentTimeTs >= next.latestPaymentTimeTs) {
			next.latestPaymentTimeTs = paymentTimeTs;
			next.latestUnitPriceMinor = unitPriceMinor;
			next.lastSeen = nullableString(row.order_local_date);
		}
		next.orderIds.add(purchaseId);
		if (unitPriceMinor !== null) {
			next.prices.push(unitPriceMinor);
		}
		next.unitCount += Math.max(1, asNumber(row.quantity));
		grouped.set(key, next);
	}

	return [...grouped.values()]
		.map((row) => ({
			currency: row.currency,
			lastSeen: row.lastSeen,
			latestUnitPriceMinor: row.latestUnitPriceMinor,
			medianUnitPriceMinor: row.prices.length ? median(row.prices) : null,
			name: row.name,
			orderCount: row.orderIds.size,
			unitCount: row.unitCount,
		}))
		.sort(
			(left, right) =>
				right.orderCount - left.orderCount ||
				right.unitCount - left.unitCount ||
				left.name.localeCompare(right.name),
		)
		.slice(0, limit);
}

function loadProductObservations(
	db: SqlDatabase,
	filters: DashboardFilters,
	itemName: string,
): ProductObservation[] {
	if (!itemName) {
		return [];
	}

	const scope = buildOrderScope(filters);
	const unitPriceSql = unitPriceExpression('i');
	const rows = queryAll<SqlRow>(
		db,
		`SELECT
			o.order_local_month AS label,
			o.order_local_date,
			o.payment_time_ts,
			o.purchase_id,
			o.currency,
			o.discount_amount_minor,
			o.items_amount_minor,
			o.venue_id,
			i.line_total_minor,
			i.quantity,
			${unitPriceSql} AS unit_price_minor
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${appendCondition(replaceOrdersAlias(scope.where, 'o'), `i.item_name = ? AND ${unitPriceSql} IS NOT NULL`)}
		ORDER BY o.order_local_month ASC, o.payment_time_ts ASC`,
		[...scope.params, itemName],
	);

	return rows.map((row) => ({
		currency: asString(row.currency) ?? 'EUR',
		label: asString(row.label) ?? '',
		listedUnitPriceMinor: resolveListedUnitPriceMinor(row),
		lineUnitPriceMinor: resolveLineUnitPriceMinor(row),
		netUnitPriceMinor: resolveNetUnitPriceMinor(row),
		orderLocalDate: nullableString(row.order_local_date),
		paymentTimeTs: asNumber(row.payment_time_ts),
		purchaseId: asString(row.purchase_id) ?? '',
		quantity: Math.max(1, asNumber(row.quantity)),
		venueId: nullableString(row.venue_id),
	}));
}

function groupMedianSeries(
	rows: ProductObservation[],
	valueAccessor: (row: ProductObservation) => number,
): SeriesPoint[] {
	const grouped = new Map<string, number[]>();

	for (const row of rows) {
		const key = `${row.label}\u0000${row.currency}`;
		const next = grouped.get(key) ?? [];
		next.push(valueAccessor(row));
		grouped.set(key, next);
	}

	return [...grouped.entries()]
		.map(([key, values]) => {
			const [label, series] = key.split('\u0000');
			return {
				label,
				series,
				value: median(values) ?? 0,
			} satisfies SeriesPoint;
		})
		.sort(compareSeriesPoint);
}

function groupMetricMedianSeries(
	rows: ProductObservation[],
): MetricSeriesPoint[] {
	const grouped = new Map<string, number[]>();

	for (const row of rows) {
		const metrics = [
			['Listed price', row.listedUnitPriceMinor],
			['Line price', row.lineUnitPriceMinor],
			['Net after discounts', row.netUnitPriceMinor],
		] as const;

		for (const [metric, value] of metrics) {
			const key = `${row.label}\u0000${row.currency}\u0000${metric}`;
			const next = grouped.get(key) ?? [];
			next.push(value);
			grouped.set(key, next);
		}
	}

	return [...grouped.entries()]
		.map(([key, values]) => {
			const [label, currency, metric] = key.split('\u0000');
			return {
				currency,
				label,
				metric,
				value: median(values) ?? 0,
			} satisfies MetricSeriesPoint;
		})
		.sort(
			(left, right) =>
				left.currency.localeCompare(right.currency) ||
				left.label.localeCompare(right.label) ||
				left.metric.localeCompare(right.metric),
		);
}

function toCurrencyAmounts(
	rows: ProductObservation[],
	picker: (values: ProductObservation[]) => number | null,
): CurrencyAmount[] {
	const grouped = new Map<string, ProductObservation[]>();

	for (const row of rows) {
		const next = grouped.get(row.currency) ?? [];
		next.push(row);
		grouped.set(row.currency, next);
	}

	return [...grouped.entries()]
		.map(([currency, values]) => ({
			amountMinor: picker(values) ?? 0,
			currency,
		}))
		.sort((left, right) => right.amountMinor - left.amountMinor);
}

function selectLatestListedValue(values: ProductObservation[]) {
	return (
		[...values].sort(
			(left, right) => right.paymentTimeTs - left.paymentTimeTs,
		)[0]?.listedUnitPriceMinor ?? null
	);
}

function selectLatestNetValue(values: ProductObservation[]) {
	return (
		[...values].sort(
			(left, right) => right.paymentTimeTs - left.paymentTimeTs,
		)[0]?.netUnitPriceMinor ?? null
	);
}

function selectMedianListedValue(values: ProductObservation[]) {
	return median(values.map((value) => value.listedUnitPriceMinor));
}

function selectMedianNetValue(values: ProductObservation[]) {
	return median(values.map((value) => value.netUnitPriceMinor));
}

function toCurrencyAmount(row: SqlRow): CurrencyAmount {
	return {
		amountMinor: asNumber(row.amount_minor),
		currency: asString(row.currency) ?? 'EUR',
	};
}

function resolveUnitPriceMinor(row: SqlRow) {
	const unitPriceMinor = asNumber(row.unit_price_minor);
	if (unitPriceMinor > 0) {
		return unitPriceMinor;
	}

	const quantity = Math.max(1, asNumber(row.quantity));
	const lineTotalMinor = asNumber(row.line_total_minor);
	return lineTotalMinor > 0 ? Math.round(lineTotalMinor / quantity) : null;
}

function resolveListedUnitPriceMinor(row: SqlRow) {
	return resolveUnitPriceMinor(row) ?? 0;
}

function resolveLineUnitPriceMinor(row: SqlRow) {
	const quantity = Math.max(1, asNumber(row.quantity));
	const lineTotalMinor = asNumber(row.line_total_minor);
	if (lineTotalMinor > 0) {
		return Math.round(lineTotalMinor / quantity);
	}

	return resolveListedUnitPriceMinor(row);
}

function resolveNetUnitPriceMinor(row: SqlRow) {
	const quantity = Math.max(1, asNumber(row.quantity));
	const lineTotalMinor = asNumber(row.line_total_minor);
	const lineUnitPriceMinor = resolveLineUnitPriceMinor(row);
	const itemsAmountMinor = Math.max(0, asNumber(row.items_amount_minor));
	const discountAmountMinor = Math.max(
		0,
		Math.min(asNumber(row.discount_amount_minor), itemsAmountMinor),
	);

	if (
		discountAmountMinor === 0 ||
		itemsAmountMinor === 0 ||
		lineTotalMinor <= 0
	) {
		return lineUnitPriceMinor;
	}

	const allocatedDiscountMinor = Math.round(
		(lineTotalMinor / itemsAmountMinor) * discountAmountMinor,
	);
	return Math.max(
		0,
		Math.round((lineTotalMinor - allocatedDiscountMinor) / quantity),
	);
}

function unitPriceExpression(alias: string) {
	return `CASE
		WHEN COALESCE(${alias}.unit_price_minor, 0) > 0 THEN CAST(${alias}.unit_price_minor AS REAL)
		WHEN COALESCE(${alias}.quantity, 0) > 0 AND COALESCE(${alias}.line_total_minor, 0) > 0
			THEN CAST(${alias}.line_total_minor AS REAL) / ${alias}.quantity
		ELSE NULL
	END`;
}

function buildOrderScope(filters: DashboardFilters) {
	const conditions: string[] = [];
	const params: Array<string> = [];

	if (filters.userId !== 'all') {
		conditions.push('user_id = ?');
		params.push(filters.userId);
	}

	if (filters.country !== 'all') {
		conditions.push('venue_country = ?');
		params.push(filters.country);
	}

	if (filters.currency !== 'all') {
		conditions.push('currency = ?');
		params.push(filters.currency);
	}

	if (filters.city !== 'all') {
		conditions.push(`${cityExpression()} = ?`);
		params.push(filters.city);
	}

	if (filters.venueId !== 'all') {
		conditions.push('venue_id = ?');
		params.push(filters.venueId);
	}

	if (filters.productLine !== 'all') {
		conditions.push('venue_product_line = ?');
		params.push(filters.productLine);
	}

	if (filters.dayKind !== 'all') {
		conditions.push(
			`CASE
				WHEN order_local_weekday IN (0, 6) THEN 'weekend'
				ELSE 'weekday'
			END = ?`,
		);
		params.push(filters.dayKind);
	}

	if (filters.daypart !== 'all') {
		conditions.push(`${daypartExpression()} = ?`);
		params.push(filters.daypart);
	}

	if (filters.startDate) {
		conditions.push('order_local_date >= ?');
		params.push(filters.startDate);
	}

	if (filters.endDate) {
		conditions.push('order_local_date <= ?');
		params.push(filters.endDate);
	}

	return {
		params,
		where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
	};
}

function replaceOrdersAlias(whereClause: string, alias: string) {
	if (!whereClause) {
		return '';
	}

	return whereClause.replaceAll(
		/\b(user_id|venue_country|currency|order_local_date|delivery_city|venue_id|venue_product_line|order_local_weekday|order_local_hour)\b/g,
		`${alias}.$1`,
	);
}

function daypartExpression() {
	return `CASE
		WHEN order_local_hour BETWEEN 5 AND 10 THEN 'breakfast'
		WHEN order_local_hour BETWEEN 11 AND 14 THEN 'lunch'
		WHEN order_local_hour BETWEEN 15 AND 17 THEN 'afternoon'
		WHEN order_local_hour BETWEEN 18 AND 22 THEN 'dinner'
		ELSE 'late_night'
	END`;
}

function cityExpression() {
	return `COALESCE(NULLIF(TRIM(delivery_city), ''), 'Unknown')`;
}

function hydrateOrderRecords(
	db: SqlDatabase,
	scope: ReturnType<typeof buildOrderScope>,
	orderRows: SqlRow[],
) {
	if (orderRows.length === 0) {
		return [];
	}

	const purchaseIds = orderRows.map((row) => asString(row.purchase_id) ?? '');
	const placeholders = purchaseIds.map(() => '?').join(', ');
	const itemRows = queryAll<SqlRow>(
		db,
		`SELECT
			i.purchase_id,
			i.item_index,
			i.item_name,
			i.quantity,
			i.unit_price_minor,
			i.line_total_minor
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${appendCondition(replaceOrdersAlias(scope.where, 'o'), `o.purchase_id IN (${placeholders})`)}
		ORDER BY o.payment_time_ts DESC, i.item_index ASC`,
		[...scope.params, ...purchaseIds],
	);

	const itemsByPurchase = new Map<string, OrderLineItem[]>();
	for (const row of itemRows) {
		const purchaseId = asString(row.purchase_id) ?? '';
		const bucket = itemsByPurchase.get(purchaseId) ?? [];
		bucket.push({
			itemName: asString(row.item_name) ?? 'Unknown item',
			lineTotalMinor: asNumber(row.line_total_minor),
			quantity: Math.max(1, asNumber(row.quantity)),
			unitPriceMinor: resolveUnitPriceMinor(row) ?? 0,
		});
		itemsByPurchase.set(purchaseId, bucket);
	}

	return orderRows.map((row) => {
		const totalMinor = asNumber(row.total_amount_minor);
		const feesMinor = asNumber(row.fees_minor);
		return {
			currency: asString(row.currency) ?? 'EUR',
			deliveryCity: nullableString(row.delivery_city),
			feeShare: totalMinor > 0 ? feesMinor / totalMinor : null,
			feesMinor,
			items: itemsByPurchase.get(asString(row.purchase_id) ?? '') ?? [],
			itemsSummary: nullableString(row.items_summary),
			orderLocalDate: nullableString(row.order_local_date),
			orderLocalDateTime: nullableString(row.order_local_datetime),
			orderNumber: nullableString(row.order_number),
			paymentMethodName: nullableString(row.payment_method_name),
			paymentTimeTs: asNumber(row.payment_time_ts),
			productLine: nullableString(row.venue_product_line),
			purchaseId: asString(row.purchase_id) ?? '',
			totalMinor,
			venueCountry: asString(row.venue_country) ?? 'UNK',
			venueId: nullableString(row.venue_id),
			venueName: asString(row.venue_name) ?? 'Unknown venue',
		} satisfies OrderRecord;
	});
}

function appendCondition(whereClause: string, condition: string) {
	return whereClause ? `${whereClause} AND ${condition}` : `WHERE ${condition}`;
}

function compareSeriesPoint(left: SeriesPoint, right: SeriesPoint) {
	return (
		left.label.localeCompare(right.label) ||
		left.series.localeCompare(right.series)
	);
}

function asNumber(value: SqlScalar): number {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value === 'string') {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : 0;
	}

	return 0;
}

function asString(value: SqlScalar): string | null {
	return typeof value === 'string' ? value : null;
}

function nullableString(value: SqlScalar): string | null {
	const next = asString(value);
	return next && next.trim() ? next : null;
}

function median(values: number[]) {
	if (values.length === 0) {
		return null;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 1) {
		return sorted[middle];
	}

	return (sorted[middle - 1] + sorted[middle]) / 2;
}
