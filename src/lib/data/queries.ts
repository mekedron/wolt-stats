import { computeTrendPulse } from '$lib/data/analytics';
import { queryAll, queryFirst, type SqlDatabase } from '$lib/data/sql';
import type {
	BarDatum,
	CurrencyTrendPulse,
	CurrencyAmount,
	DashboardFilters,
	FilterMetadata,
	Freshness,
	HeatCell,
	ItemRank,
	SeriesPoint,
	SummaryMetrics,
	VenueOptionGroup,
	VenueRank,
} from '$lib/types';

type SqlScalar = number | string | null | Uint8Array | undefined;
type SqlRow = Record<string, SqlScalar>;

export function getFreshness(db: SqlDatabase): Freshness {
	const row = queryFirst<SqlRow>(
		db,
		`SELECT
			MAX(last_sync_finished_at) AS last_sync_at,
			COUNT(*) AS synced_users,
			COALESCE(SUM(catalog_order_count), 0) AS catalog_orders,
			COALESCE(
				SUM(
					CASE
						WHEN expected_order_count IS NOT NULL AND catalog_order_count < expected_order_count
							THEN expected_order_count - catalog_order_count
						ELSE 0
					END
				),
				0
			) AS catalog_shortfall,
			CASE
				WHEN COUNT(*) = COUNT(expected_order_count) THEN SUM(expected_order_count)
				ELSE NULL
			END AS expected_orders,
			COALESCE(
				SUM(
					CASE
						WHEN catalog_order_count > detail_order_count THEN catalog_order_count - detail_order_count
						ELSE 0
					END
				),
				0
			) AS missing_details,
			(SELECT MIN(order_local_date) FROM orders) AS coverage_start,
			(SELECT MAX(order_local_date) FROM orders) AS coverage_end,
			COALESCE((SELECT COUNT(*) FROM orders), 0) AS total_orders
		FROM sync_state`,
	);

	return {
		catalogOrders: asNumber(row?.catalog_orders),
		catalogShortfall: asNumber(row?.catalog_shortfall),
		coverageEnd: asString(row?.coverage_end),
		coverageStart: asString(row?.coverage_start),
		lastSyncAt: asString(row?.last_sync_at),
		missingDetails: asNumber(row?.missing_details),
		expectedOrders:
			row?.expected_orders == null ? null : asNumber(row?.expected_orders),
		syncedUsers: asNumber(row?.synced_users),
		totalOrders: asNumber(row?.total_orders),
	};
}

export function getFilterMetadata(
	db: SqlDatabase,
	userId = 'all',
): FilterMetadata {
	const userScope = buildUserScope(userId);

	const users = queryAll<SqlRow>(
		db,
		'SELECT id, email FROM users ORDER BY email ASC',
	).map((row) => ({
		label: asString(row.email) ?? 'Unknown user',
		value: asString(row.id) ?? '',
	}));

	const countries = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT COALESCE(venue_country, 'UNK') AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => ({
		label: asString(row.value) ?? 'UNK',
		value: asString(row.value) ?? 'UNK',
	}));

	const currencies = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT currency AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => ({
		label: asString(row.value) ?? '',
		value: asString(row.value) ?? '',
	}));

	const cities = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT ${cityExpression()} AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => ({
		label: asString(row.value) ?? 'Unknown',
		value: asString(row.value) ?? 'Unknown',
	}));

	const venueRows = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT
			venue_id AS value,
			COALESCE(venue_name, 'Unknown venue') AS label,
			COALESCE(venue_country, 'UNK') AS country,
			${cityExpression()} AS city
		FROM orders
		${appendCondition(userScope.where, "venue_id IS NOT NULL AND venue_id <> ''")}
		ORDER BY country ASC, city ASC, label ASC`,
		userScope.params,
	);

	const venues = [...groupVenueOptions(venueRows)];

	const productLines = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT COALESCE(venue_product_line, 'unknown') AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => {
		const value = asString(row.value) ?? 'unknown';
		return {
			label: humanizeToken(value),
			value,
		};
	});

	const dayKinds = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT
			CASE
				WHEN order_local_weekday IN (0, 6) THEN 'weekend'
				ELSE 'weekday'
			END AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => {
		const value = asString(row.value) ?? 'weekday';
		return {
			label: humanizeToken(value),
			value,
		};
	});

	const dayparts = queryAll<SqlRow>(
		db,
		`SELECT DISTINCT
			${daypartExpression()} AS value
		FROM orders
		${userScope.where}
		ORDER BY value ASC`,
		userScope.params,
	).map((row) => {
		const value = asString(row.value) ?? 'dinner';
		return {
			label: humanizeToken(value),
			value,
		};
	});

	const bounds = queryFirst<SqlRow>(
		db,
		`SELECT
			MIN(order_local_date) AS min_date,
			MAX(order_local_date) AS max_date
		FROM orders
		${userScope.where}`,
		userScope.params,
	);

	return {
		users: [{ value: 'all', label: 'All users' }, ...users],
		countries: [{ value: 'all', label: 'All countries' }, ...countries],
		currencies: [{ value: 'all', label: 'All currencies' }, ...currencies],
		cities: [{ value: 'all', label: 'All cities' }, ...cities],
		venues,
		productLines: [{ value: 'all', label: 'All venue types' }, ...productLines],
		dayKinds: [{ value: 'all', label: 'All days' }, ...dayKinds],
		dayparts: [{ value: 'all', label: 'All dayparts' }, ...dayparts],
		minDate: asString(bounds?.min_date) ?? '',
		maxDate: asString(bounds?.max_date) ?? '',
	};
}

export function getSummaryMetrics(
	db: SqlDatabase,
	filters: DashboardFilters,
): SummaryMetrics {
	const scope = buildOrderScope(filters);

	const overview = queryFirst<SqlRow>(
		db,
		`SELECT
			COUNT(*) AS total_orders,
			COUNT(DISTINCT order_local_date) AS active_days,
			COUNT(DISTINCT venue_country) AS active_countries,
			COALESCE(
				AVG(
					CASE
						WHEN total_amount_minor > 0 THEN CAST(fees_minor AS REAL) / total_amount_minor
						ELSE NULL
					END
				),
				0
			) AS avg_fee_rate,
			MAX(order_local_date) AS last_order_date
		FROM orders
		${scope.where}`,
		scope.params,
	);

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

	const topVenueRow = queryFirst<SqlRow>(
		db,
		`SELECT
			venue_name AS name,
			COALESCE(venue_country, 'UNK') AS country,
			currency,
			COUNT(*) AS order_count,
			SUM(total_amount_minor) AS total_minor
		FROM orders
		${scope.where}
		GROUP BY venue_name, country, currency
		ORDER BY order_count DESC, total_minor DESC, MAX(payment_time_ts) DESC
		LIMIT 1`,
		scope.params,
	);

	const topItemRow = queryFirst<SqlRow>(
		db,
		`SELECT
			i.item_name AS name,
			o.currency AS currency,
			SUM(i.quantity) AS unit_count,
			COUNT(DISTINCT i.purchase_id) AS order_count
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${replaceOrdersAlias(scope.where, 'o')}
		GROUP BY name, currency
		ORDER BY unit_count DESC, order_count DESC
		LIMIT 1`,
		scope.params,
	);

	return {
		totalOrders: asNumber(overview?.total_orders),
		activeDays: asNumber(overview?.active_days),
		activeCountries: asNumber(overview?.active_countries),
		avgFeeRate: asNumber(overview?.avg_fee_rate),
		lastOrderDate: asString(overview?.last_order_date),
		totalSpend,
		medianOrderValue,
		topVenue: topVenueRow
			? {
					country: asString(topVenueRow.country) ?? 'UNK',
					currency: asString(topVenueRow.currency) ?? 'EUR',
					name: asString(topVenueRow.name) ?? 'Unknown venue',
					orderCount: asNumber(topVenueRow.order_count),
					totalMinor: asNumber(topVenueRow.total_minor),
				}
			: null,
		topItem: topItemRow
			? {
					currency: asString(topItemRow.currency) ?? 'EUR',
					name: asString(topItemRow.name) ?? 'Unknown item',
					orderCount: asNumber(topItemRow.order_count),
					unitCount: asNumber(topItemRow.unit_count),
				}
			: null,
	};
}

export function getMonthlyMedianSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): SeriesPoint[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`WITH ranked AS (
			SELECT
				order_local_month,
				currency,
				total_amount_minor,
				ROW_NUMBER() OVER (
					PARTITION BY order_local_month, currency
					ORDER BY total_amount_minor ASC
				) AS rn,
				COUNT(*) OVER (PARTITION BY order_local_month, currency) AS cnt
			FROM orders
			${scope.where}
		)
		SELECT
			order_local_month AS label,
			currency AS series,
			AVG(total_amount_minor) AS value
		FROM ranked
		WHERE rn IN (CAST((cnt + 1) / 2 AS INTEGER), CAST((cnt + 2) / 2 AS INTEGER))
		GROUP BY order_local_month, currency
		ORDER BY order_local_month ASC, currency ASC`,
		scope.params,
	).map(toSeriesPoint);
}

export function getMonthlySpendSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): SeriesPoint[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			order_local_month AS label,
			currency AS series,
			SUM(total_amount_minor) AS value
		FROM orders
		${scope.where}
		GROUP BY order_local_month, currency
		ORDER BY order_local_month ASC, currency ASC`,
		scope.params,
	).map(toSeriesPoint);
}

export function getMonthlyOrderCountSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): SeriesPoint[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			order_local_month AS label,
			currency AS series,
			COUNT(*) AS value
		FROM orders
		${scope.where}
		GROUP BY order_local_month, currency
		ORDER BY order_local_month ASC, currency ASC`,
		scope.params,
	).map(toSeriesPoint);
}

export function getMonthlyFeeSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): SeriesPoint[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			order_local_month AS label,
			'Fee share' AS series,
			AVG(
				CASE
					WHEN total_amount_minor > 0 THEN CAST(fees_minor AS REAL) / total_amount_minor
					ELSE NULL
				END
			) AS value
		FROM orders
		${scope.where}
		GROUP BY order_local_month
		ORDER BY order_local_month ASC`,
		scope.params,
	).map(toSeriesPoint);
}

export function getMonthlyMedianFeeSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): SeriesPoint[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`WITH ranked AS (
			SELECT
				order_local_month,
				CAST(fees_minor AS REAL) / total_amount_minor AS fee_share,
				ROW_NUMBER() OVER (
					PARTITION BY order_local_month
					ORDER BY CAST(fees_minor AS REAL) / total_amount_minor ASC
				) AS rn,
				COUNT(*) OVER (PARTITION BY order_local_month) AS cnt
			FROM orders
			${appendCondition(scope.where, 'total_amount_minor > 0')}
		)
		SELECT
			order_local_month AS label,
			'Typical fee share' AS series,
			AVG(fee_share) AS value
		FROM ranked
		WHERE rn IN (CAST((cnt + 1) / 2 AS INTEGER), CAST((cnt + 2) / 2 AS INTEGER))
		GROUP BY order_local_month
		ORDER BY order_local_month ASC`,
		scope.params,
	).map(toSeriesPoint);
}

export function getCountryOrderCounts(
	db: SqlDatabase,
	filters: DashboardFilters,
): BarDatum[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			COALESCE(venue_country, 'UNK') AS label,
			COUNT(*) AS value
		FROM orders
		${scope.where}
		GROUP BY label
		ORDER BY value DESC, label ASC`,
		scope.params,
	).map((row) => ({
		label: asString(row.label) ?? 'UNK',
		value: asNumber(row.value),
	}));
}

export function getHeatmapSeries(
	db: SqlDatabase,
	filters: DashboardFilters,
): HeatCell[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			((order_local_weekday + 6) % 7) AS weekday,
			order_local_hour AS hour,
			COUNT(*) AS value
		FROM orders
		${scope.where}
		GROUP BY weekday, hour
		ORDER BY weekday ASC, hour ASC`,
		scope.params,
	).map((row) => ({
		hour: asNumber(row.hour),
		value: asNumber(row.value),
		weekday: asNumber(row.weekday),
	}));
}

export function getTopVenues(
	db: SqlDatabase,
	filters: DashboardFilters,
): VenueRank[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			COALESCE(venue_id, '') AS venue_id,
			venue_name AS name,
			COALESCE(venue_country, 'UNK') AS country,
			currency,
			COUNT(*) AS order_count,
			SUM(total_amount_minor) AS total_minor
		FROM orders
		${scope.where}
		GROUP BY venue_id, venue_name, country, currency
		ORDER BY order_count DESC, total_minor DESC, MAX(payment_time_ts) DESC
		LIMIT 8`,
		scope.params,
	).map((row) => ({
		country: asString(row.country) ?? 'UNK',
		currency: asString(row.currency) ?? 'EUR',
		name: asString(row.name) ?? 'Unknown venue',
		orderCount: asNumber(row.order_count),
		totalMinor: asNumber(row.total_minor),
		venueId: asString(row.venue_id)?.trim() || null,
	}));
}

export function getTopItems(
	db: SqlDatabase,
	filters: DashboardFilters,
): ItemRank[] {
	const scope = buildOrderScope(filters);

	return queryAll<SqlRow>(
		db,
		`SELECT
			i.item_name AS name,
			o.currency AS currency,
			SUM(i.quantity) AS unit_count,
			COUNT(DISTINCT i.purchase_id) AS order_count
		FROM order_items i
		JOIN orders o
			ON o.user_id = i.user_id
			AND o.purchase_id = i.purchase_id
		${replaceOrdersAlias(scope.where, 'o')}
		GROUP BY name, currency
		ORDER BY unit_count DESC, order_count DESC
		LIMIT 8`,
		scope.params,
	).map((row) => ({
		currency: asString(row.currency) ?? 'EUR',
		name: asString(row.name) ?? 'Unknown item',
		orderCount: asNumber(row.order_count),
		unitCount: asNumber(row.unit_count),
	}));
}

export function getCurrencyTrendPulse(
	db: SqlDatabase,
	filters: DashboardFilters,
): CurrencyTrendPulse[] {
	return computeTrendPulse(
		getMonthlyMedianSeries(db, filters),
		getMonthlySpendSeries(db, filters),
		getMonthlyOrderCountSeries(db, filters),
	);
}

function buildUserScope(userId: string) {
	if (userId === 'all') {
		return { params: [] as Array<string>, where: '' };
	}

	return {
		params: [userId],
		where: 'WHERE user_id = ?',
	};
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

function humanizeToken(value: string) {
	return value
		.split(/[_-]+/g)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
}

function appendCondition(whereClause: string, condition: string) {
	return whereClause ? `${whereClause} AND ${condition}` : `WHERE ${condition}`;
}

function groupVenueOptions(rows: SqlRow[]): VenueOptionGroup[] {
	const groups = new Map<string, VenueOptionGroup>();

	for (const row of rows) {
		const country = asString(row.country) ?? 'UNK';
		const city = asString(row.city) ?? 'Unknown';
		const key = `${country}\u0000${city}`;
		const next = groups.get(key) ?? {
			city,
			country,
			options: [],
		};
		next.options.push({
			label: asString(row.label) ?? 'Unknown venue',
			value: asString(row.value) ?? '',
		});
		groups.set(key, next);
	}

	return [...groups.values()];
}

function toCurrencyAmount(row: SqlRow): CurrencyAmount {
	return {
		amountMinor: asNumber(row.amount_minor),
		currency: asString(row.currency) ?? 'EUR',
	};
}

function toSeriesPoint(row: SqlRow): SeriesPoint {
	return {
		label: asString(row.label) ?? '',
		series: asString(row.series) ?? '',
		value: asNumber(row.value),
	};
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
