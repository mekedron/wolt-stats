/**
 * @typedef {'checkpoint_reached' | 'known_purchase' | null} CatalogStopReason
 */

/**
 * @param {{
 *   expectedOrderCount: number | null;
 *   forceFull: boolean;
 *   knownCatalogCount: number;
 *   newestKnownPaymentTimeTs: number;
 * }} options
 * @returns {'full' | 'incremental'}
 */
export function resolveCatalogScanMode({
	expectedOrderCount,
	forceFull,
	knownCatalogCount,
	newestKnownPaymentTimeTs,
}) {
	if (forceFull) {
		return 'full';
	}

	if (knownCatalogCount <= 0 || newestKnownPaymentTimeTs <= 0) {
		return 'full';
	}

	if (expectedOrderCount !== null && knownCatalogCount < expectedOrderCount) {
		return 'full';
	}

	return 'incremental';
}

/**
 * @param {{
 *   knownPurchaseIds: ReadonlySet<string>;
 *   newestKnownPaymentTimeTs: number;
 *   summaries: any[];
 * }} options
 * @returns {{ reason: CatalogStopReason; shouldStopAfterPage: boolean }}
 */
export function getCatalogStopDecision({
	knownPurchaseIds,
	newestKnownPaymentTimeTs,
	summaries,
}) {
	if (summaries.length === 0 || newestKnownPaymentTimeTs <= 0) {
		return { reason: null, shouldStopAfterPage: false };
	}

	for (const summary of summaries) {
		const purchaseId = String(summary?.purchase_id ?? '').trim();
		if (purchaseId && knownPurchaseIds.has(purchaseId)) {
			return {
				reason: 'known_purchase',
				shouldStopAfterPage: true,
			};
		}
	}

	for (const summary of summaries) {
		const paymentTimeTs = Number(summary?.payment_time_ts ?? 0);
		if (
			Number.isFinite(paymentTimeTs) &&
			paymentTimeTs > 0 &&
			paymentTimeTs < newestKnownPaymentTimeTs
		) {
			return {
				reason: 'checkpoint_reached',
				shouldStopAfterPage: true,
			};
		}
	}

	return { reason: null, shouldStopAfterPage: false };
}

/**
 * @param {CatalogStopReason} reason
 * @returns {string}
 */
export function formatCatalogStopReason(reason) {
	switch (reason) {
		case 'checkpoint_reached':
			return 'reached history older than the newest cataloged order';
		case 'known_purchase':
			return 'hit already cataloged history';
		default:
			return 'scanned through the available history';
	}
}
