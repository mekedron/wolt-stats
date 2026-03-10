import type { CurrencyAmount } from '$lib/types';

const regionAliases: Record<string, string> = {
	FIN: 'FI',
	GEO: 'GE',
	POL: 'PL',
};

export function formatMoney(amountMinor: number, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		currency,
		maximumFractionDigits: 2,
		style: 'currency',
	}).format(amountMinor / 100);
}

export function formatPercent(value: number): string {
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: 1,
		style: 'percent',
	}).format(value);
}

export function formatSignedPercent(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return '—';
	}

	return `${value > 0 ? '+' : ''}${formatPercent(value)}`;
}

export function formatCount(value: number): string {
	return new Intl.NumberFormat().format(value);
}

export function formatCurrencyBreakdown(rows: CurrencyAmount[]): string {
	if (rows.length === 0) {
		return '—';
	}

	return rows
		.map((row) => formatMoney(row.amountMinor, row.currency))
		.join(' · ');
}

export function formatCountryName(code: string): string {
	if (!code || code === 'UNK') {
		return 'Unknown';
	}

	const names = new Intl.DisplayNames(undefined, { type: 'region' });
	const normalized = regionAliases[code] ?? code;
	try {
		return names.of(normalized) ?? code;
	} catch {
		return code;
	}
}

export function formatDateLabel(date: string): string {
	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(new Date(`${date}T00:00:00Z`));
}

export function formatMonthLabel(month: string): string {
	return new Intl.DateTimeFormat(undefined, {
		month: 'short',
		year: 'numeric',
	}).format(new Date(`${month}-01T00:00:00Z`));
}

export function formatDateTime(iso: string | null): string {
	if (!iso) {
		return 'Never';
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso));
}

export function shiftDate(date: string, days: number): string {
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

export function clampDate(
	date: string,
	minDate: string,
	maxDate: string,
): string {
	if (!date) {
		return minDate;
	}
	if (date < minDate) {
		return minDate;
	}
	if (date > maxDate) {
		return maxDate;
	}
	return date;
}

export function groupSeriesByKey<T extends { series: string }>(
	rows: T[],
): Array<{
	key: string;
	rows: T[];
}> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const next = groups.get(row.series) ?? [];
		next.push(row);
		groups.set(row.series, next);
	}

	return [...groups.entries()].map(([key, value]) => ({
		key,
		rows: value,
	}));
}
