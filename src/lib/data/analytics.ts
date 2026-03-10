import type { CurrencyTrendPulse, SeriesPoint } from '$lib/types';

const COMPARISON_WINDOW_MONTHS = 6;

export function computeTrendPulse(
	medianSeries: SeriesPoint[],
	spendSeries: SeriesPoint[],
	orderCountSeries: SeriesPoint[],
): CurrencyTrendPulse[] {
	const months = [
		...new Set(
			[...medianSeries, ...spendSeries, ...orderCountSeries].map(
				(row) => row.label,
			),
		),
	]
		.filter(Boolean)
		.sort();
	const recentMonths = new Set(months.slice(-COMPARISON_WINDOW_MONTHS));
	const previousMonths = new Set(
		months.slice(-COMPARISON_WINDOW_MONTHS * 2, -COMPARISON_WINDOW_MONTHS),
	);
	const currencies = [
		...new Set(
			[...medianSeries, ...spendSeries, ...orderCountSeries].map(
				(row) => row.series,
			),
		),
	]
		.filter(Boolean)
		.sort();

	return currencies
		.map((currency) => {
			const recentMedianMinor = median(
				selectValues(medianSeries, currency, recentMonths),
			);
			if (recentMedianMinor === null) {
				return null;
			}

			const previousMedianMinor = median(
				selectValues(medianSeries, currency, previousMonths),
			);
			const recentAvgMonthlySpendMinor =
				average(selectValues(spendSeries, currency, recentMonths)) ?? 0;
			const previousAvgMonthlySpendMinor = average(
				selectValues(spendSeries, currency, previousMonths),
			);
			const recentAvgMonthlyOrders =
				average(selectValues(orderCountSeries, currency, recentMonths)) ?? 0;
			const previousAvgMonthlyOrders = average(
				selectValues(orderCountSeries, currency, previousMonths),
			);

			return {
				currency,
				medianDeltaRatio: ratioChange(recentMedianMinor, previousMedianMinor),
				orderDeltaRatio: ratioChange(
					recentAvgMonthlyOrders,
					previousAvgMonthlyOrders,
				),
				previousAvgMonthlyOrders,
				previousAvgMonthlySpendMinor,
				previousMedianMinor,
				recentAvgMonthlyOrders,
				recentAvgMonthlySpendMinor,
				recentMedianMinor,
				spendDeltaRatio: ratioChange(
					recentAvgMonthlySpendMinor,
					previousAvgMonthlySpendMinor,
				),
			} satisfies CurrencyTrendPulse;
		})
		.filter((row): row is CurrencyTrendPulse => row !== null)
		.sort(
			(left, right) =>
				Math.abs(right.medianDeltaRatio ?? 0) -
					Math.abs(left.medianDeltaRatio ?? 0) ||
				right.recentAvgMonthlySpendMinor - left.recentAvgMonthlySpendMinor,
		);
}

function selectValues(
	rows: SeriesPoint[],
	currency: string,
	months: Set<string>,
) {
	return rows
		.filter((row) => row.series === currency && months.has(row.label))
		.sort((left, right) => left.label.localeCompare(right.label))
		.map((row) => row.value);
}

function average(values: number[]) {
	if (values.length === 0) {
		return null;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function ratioChange(current: number, previous: number | null) {
	if (previous === null || previous === 0) {
		return null;
	}

	return (current - previous) / previous;
}
