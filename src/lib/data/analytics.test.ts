import { describe, expect, it } from 'vitest';

import { computeTrendPulse } from '$lib/data/analytics';
import type { SeriesPoint } from '$lib/types';

describe('computeTrendPulse', () => {
	it('compares the last six months against the previous six months per currency', () => {
		const medianSeries = buildSeries(
			'EUR',
			[1200, 1220, 1240, 1260, 1280, 1300, 1500, 1520, 1540, 1560, 1580, 1600],
		);
		const spendSeries = buildSeries(
			'EUR',
			[
				20000, 20200, 20400, 20600, 20800, 21000, 26000, 26200, 26400, 26600,
				26800, 27000,
			],
		);
		const orderSeries = buildSeries(
			'EUR',
			[10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
		);

		const [pulse] = computeTrendPulse(medianSeries, spendSeries, orderSeries);

		expect(pulse.currency).toBe('EUR');
		expect(pulse.recentMedianMinor).toBe(1550);
		expect(pulse.previousMedianMinor).toBe(1250);
		expect(pulse.medianDeltaRatio).toBeCloseTo(0.24, 5);
		expect(pulse.spendDeltaRatio).toBeCloseTo(0.2926829, 5);
		expect(pulse.orderDeltaRatio).toBeCloseTo(0.2727272, 5);
	});

	it('sorts currencies by the size of the median shift', () => {
		const eurMedian = buildSeries(
			'EUR',
			[1000, 1000, 1000, 1000, 1000, 1000, 1300, 1300, 1300, 1300, 1300, 1300],
		);
		const eurSpend = buildSeries(
			'EUR',
			[
				10000, 10000, 10000, 10000, 10000, 10000, 12000, 12000, 12000, 12000,
				12000, 12000,
			],
		);
		const eurOrders = buildSeries(
			'EUR',
			[10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11],
		);

		const gelMedian = buildSeries(
			'GEL',
			[3000, 3000, 3000, 3000, 3000, 3000, 4500, 4500, 4500, 4500, 4500, 4500],
		);
		const gelSpend = buildSeries(
			'GEL',
			[
				20000, 20000, 20000, 20000, 20000, 20000, 34000, 34000, 34000, 34000,
				34000, 34000,
			],
		);
		const gelOrders = buildSeries('GEL', [8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9]);

		const rows = computeTrendPulse(
			[...eurMedian, ...gelMedian],
			[...eurSpend, ...gelSpend],
			[...eurOrders, ...gelOrders],
		);

		expect(rows.map((row) => row.currency)).toEqual(['GEL', 'EUR']);
	});
});

function buildSeries(currency: string, values: number[]): SeriesPoint[] {
	return values.map((value, index) => ({
		label: `2025-${String(index + 1).padStart(2, '0')}`,
		series: currency,
		value,
	}));
}
