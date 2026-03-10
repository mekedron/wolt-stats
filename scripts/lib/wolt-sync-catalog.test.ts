import { describe, expect, it } from 'vitest';

import {
	formatCatalogStopReason,
	getCatalogStopDecision,
	resolveCatalogScanMode,
} from './wolt-sync-catalog.mjs';

describe('wolt sync catalog planning', () => {
	it('uses incremental mode only when the catalog baseline is already present', () => {
		expect(
			resolveCatalogScanMode({
				expectedOrderCount: 870,
				forceFull: false,
				knownCatalogCount: 870,
				newestKnownPaymentTimeTs: 1000,
			}),
		).toBe('incremental');

		expect(
			resolveCatalogScanMode({
				expectedOrderCount: 870,
				forceFull: false,
				knownCatalogCount: 400,
				newestKnownPaymentTimeTs: 1000,
			}),
		).toBe('full');

		expect(
			resolveCatalogScanMode({
				expectedOrderCount: null,
				forceFull: true,
				knownCatalogCount: 870,
				newestKnownPaymentTimeTs: 1000,
			}),
		).toBe('full');
	});

	it('stops incremental paging once the page crosses known history', () => {
		expect(
			getCatalogStopDecision({
				knownPurchaseIds: new Set(['known-1']),
				newestKnownPaymentTimeTs: 5000,
				summaries: [
					{ payment_time_ts: 7000, purchase_id: 'new-1' },
					{ payment_time_ts: 5000, purchase_id: 'known-1' },
				],
			}),
		).toEqual({
			reason: 'known_purchase',
			shouldStopAfterPage: true,
		});

		expect(
			getCatalogStopDecision({
				knownPurchaseIds: new Set(['known-1']),
				newestKnownPaymentTimeTs: 5000,
				summaries: [
					{ payment_time_ts: 7000, purchase_id: 'new-1' },
					{ payment_time_ts: 4999, purchase_id: 'new-2' },
				],
			}),
		).toEqual({
			reason: 'checkpoint_reached',
			shouldStopAfterPage: true,
		});

		expect(
			getCatalogStopDecision({
				knownPurchaseIds: new Set(['known-1']),
				newestKnownPaymentTimeTs: 5000,
				summaries: [
					{ payment_time_ts: 7000, purchase_id: 'new-1' },
					{ payment_time_ts: 6000, purchase_id: 'new-2' },
				],
			}),
		).toEqual({
			reason: null,
			shouldStopAfterPage: false,
		});
	});

	it('formats stop reasons for sync logs', () => {
		expect(formatCatalogStopReason('known_purchase')).toContain(
			'already cataloged',
		);
		expect(formatCatalogStopReason('checkpoint_reached')).toContain(
			'newest cataloged order',
		);
		expect(formatCatalogStopReason(null)).toContain('available history');
	});
});
