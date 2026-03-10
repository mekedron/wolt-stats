<script lang="ts">
	import { onMount } from 'svelte';

	import BarChart from '$lib/components/BarChart.svelte';
	import HeatmapChart from '$lib/components/HeatmapChart.svelte';
	import LineChart from '$lib/components/LineChart.svelte';
	import ModalShell from '$lib/components/ModalShell.svelte';
	import OrderLedger from '$lib/components/OrderLedger.svelte';
	import ProductSpotlight from '$lib/components/ProductSpotlight.svelte';
	import RankList from '$lib/components/RankList.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import VenueSpotlight from '$lib/components/VenueSpotlight.svelte';
	import {
		getOrderLedgerPage,
		getMenuMemoryItems,
		getProductOrderCountSeries,
		getProductPriceBreakdownSeries,
		getProductProfile,
		getVenueSnapshot,
	} from '$lib/data/explore';
	import { loadDatabase } from '$lib/data/load-db';
	import {
		getCurrencyTrendPulse,
		getCountryOrderCounts,
		getFilterMetadata,
		getFreshness,
		getHeatmapSeries,
		getMonthlyFeeSeries,
		getMonthlyMedianFeeSeries,
		getMonthlyMedianSeries,
		getMonthlyOrderCountSeries,
		getMonthlySpendSeries,
		getSummaryMetrics,
		getTopItems,
		getTopVenues,
	} from '$lib/data/queries';
	import type { SqlDatabase } from '$lib/data/sql';
	import type {
		BarDatum,
		CurrencyTrendPulse,
		DashboardFilters,
		FilterMetadata,
		Freshness,
		HeatCell,
		ItemRank,
		MenuMemoryItem,
		MetricSeriesPoint,
		OrderLedgerPage,
		OrderRecord,
		ProductProfile,
		RankItem,
		SeriesPoint,
		SummaryMetrics,
		VenueSnapshot,
		VenueRank,
	} from '$lib/types';
	import {
		clampDate,
		formatCount,
		formatCountryName,
		formatCurrencyBreakdown,
		formatDateLabel,
		formatDateTime,
		formatMoney,
		formatPercent,
		formatSignedPercent,
		groupSeriesByKey,
		shiftDate,
	} from '$lib/utils/format';
	import {
		THEME_STORAGE_KEY,
		normalizeThemePreference,
		resolveAppliedTheme,
		resolveThemeColor,
		type AppliedTheme,
		type ThemePreference,
	} from '$lib/theme';

	const emptySummary: SummaryMetrics = {
		activeCountries: 0,
		activeDays: 0,
		avgFeeRate: 0,
		lastOrderDate: null,
		medianOrderValue: [],
		topItem: null,
		topVenue: null,
		totalOrders: 0,
		totalSpend: [],
	};

	type ProductFocusState = {
		itemName: string;
		scope: 'slice' | 'venue';
		venueId: string | null;
		venueName: string | null;
	};

	type ProductSelectDetail = {
		itemName: string;
		source: 'ledger' | 'venue';
		venueId: string | null;
		venueName: string;
	};

	type VenueFocusState = {
		venueId: string;
		venueName: string;
	};

	type DashboardView = 'orders' | 'overview' | 'venues';

	let database: SqlDatabase | null = null;
	let error = '';
	let freshness: Freshness = {
		catalogOrders: 0,
		catalogShortfall: 0,
		coverageEnd: null,
		coverageStart: null,
		lastSyncAt: null,
		missingDetails: 0,
		expectedOrders: null,
		syncedUsers: 0,
		totalOrders: 0,
	};
	let loading = true;
	let metadata: FilterMetadata = {
		countries: [{ value: 'all', label: 'All countries' }],
		currencies: [{ value: 'all', label: 'All currencies' }],
		cities: [{ value: 'all', label: 'All cities' }],
		dayKinds: [{ value: 'all', label: 'All days' }],
		dayparts: [{ value: 'all', label: 'All dayparts' }],
		maxDate: '',
		minDate: '',
		productLines: [{ value: 'all', label: 'All venue types' }],
		venues: [],
		users: [{ value: 'all', label: 'All users' }],
	};

	let filters: DashboardFilters = {
		city: 'all',
		country: 'all',
		currency: 'all',
		dayKind: 'all',
		daypart: 'all',
		endDate: '',
		productLine: 'all',
		startDate: '',
		userId: 'all',
		venueId: 'all',
	};

	let summary = emptySummary;
	let monthlyMedian: SeriesPoint[] = [];
	let monthlyMedianFee: SeriesPoint[] = [];
	let monthlyOrderCount: SeriesPoint[] = [];
	let monthlySpend: SeriesPoint[] = [];
	let monthlyFee: SeriesPoint[] = [];
	let countryOrders: BarDatum[] = [];
	let heatmap: HeatCell[] = [];
	let topVenues: VenueRank[] = [];
	let topItems: ItemRank[] = [];
	let trendPulse: CurrencyTrendPulse[] = [];
	let orderLedger: OrderLedgerPage = {
		limit: 25,
		offset: 0,
		orders: [],
		totalOrders: 0,
	};
	let orderPageSize: number | 'all' = 25;
	let productFocus: ProductFocusState | null = null;
	let productProfile: ProductProfile | null = null;
	let productPriceHistory: MetricSeriesPoint[] = [];
	let productOrderHistory: SeriesPoint[] = [];
	let venueFocus: VenueFocusState | null = null;
	let venueSnapshot: VenueSnapshot | null = null;
	let venueMenuMemory: MenuMemoryItem[] = [];
	let venueMonthlyMedian: SeriesPoint[] = [];
	let venueMonthlyOrders: SeriesPoint[] = [];
	let venueSpotlightName: string | null = null;
	let venueSpotlightSource = '';
	let activeView: DashboardView = 'overview';
	let themePreference: ThemePreference = 'system';
	let appliedTheme: AppliedTheme = 'light';

	const palette = [
		'var(--chart-accent-1)',
		'var(--chart-accent-2)',
		'var(--chart-accent-3)',
		'var(--chart-accent-4)',
		'var(--chart-accent-5)',
	];
	const themeOptions: Array<{ label: string; value: ThemePreference }> = [
		{ label: 'System', value: 'system' },
		{ label: 'Light', value: 'light' },
		{ label: 'Dark', value: 'dark' },
	];

	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleSystemThemeChange = () => {
			if (themePreference === 'system') {
				applyThemePreference(themePreference, mediaQuery);
			}
		};

		applyThemePreference(
			normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY)),
			mediaQuery,
		);

		mediaQuery.addEventListener('change', handleSystemThemeChange);

		void (async () => {
			try {
				database = await loadDatabase();
				freshness = getFreshness(database);
				metadata = getFilterMetadata(database, 'all');
				filters = {
					...filters,
					endDate: metadata.maxDate,
					startDate: metadata.minDate,
				};
				refreshDashboard();
			} catch (exception) {
				error =
					exception instanceof Error
						? exception.message
						: 'Could not load the dashboard database.';
			} finally {
				loading = false;
			}
		})();

		return () => {
			mediaQuery.removeEventListener('change', handleSystemThemeChange);
		};
	});

	$: monthlyMedianGroups = groupSeriesByKey(monthlyMedian);
	$: medianFeeSeries = monthlyMedianFee.map((point) => ({
		label: point.label,
		value: point.value,
	}));
	$: monthlyOrderGroups = groupSeriesByKey(monthlyOrderCount);
	$: monthlySpendGroups = groupSeriesByKey(monthlySpend);
	$: visibleVenueGroups = filterVenueGroups(
		metadata.venues,
		filters.country,
		filters.city,
	);
	$: feeSeries = monthlyFee.map((point) => ({
		label: point.label,
		value: point.value,
	}));
	$: countryChartData = countryOrders.map((row) => ({
		label: formatCountryName(row.label),
		value: row.value,
	}));
	$: trendPulseItems = toTrendPulseItems(trendPulse);
	$: topVenueItems = toVenueRankItems(topVenues);
	$: topItemRows = toItemRankItems(topItems);
	$: themeStatusLabel =
		themePreference === 'system'
			? `System · ${capitalizeTheme(appliedTheme)}`
			: capitalizeTheme(appliedTheme);
	$: catalogStatusLabel =
		freshness.catalogOrders > 0
			? freshness.missingDetails > 0
				? `Cataloged orders: ${formatCount(freshness.catalogOrders)} unique IDs, including ${formatCount(freshness.missingDetails)} without detailed payloads yet.`
				: `Cataloged orders: ${formatCount(freshness.catalogOrders)} unique IDs.`
			: '';

	function refreshDashboard({ resetOrderLedger = false } = {}) {
		if (!database) {
			return;
		}

		if (resetOrderLedger) {
			orderLedger = {
				...orderLedger,
				offset: 0,
			};
		}

		summary = getSummaryMetrics(database, filters);
		monthlyMedian = getMonthlyMedianSeries(database, filters);
		monthlyMedianFee = getMonthlyMedianFeeSeries(database, filters);
		monthlyOrderCount = getMonthlyOrderCountSeries(database, filters);
		monthlySpend = getMonthlySpendSeries(database, filters);
		monthlyFee = getMonthlyFeeSeries(database, filters);
		countryOrders = getCountryOrderCounts(database, filters);
		heatmap = getHeatmapSeries(database, filters);
		topVenues = getTopVenues(database, filters);
		topItems = getTopItems(database, filters);
		trendPulse = getCurrencyTrendPulse(database, filters);
		orderLedger = getOrderLedgerPage(database, filters, {
			limit: orderPageSize === 'all' ? null : orderPageSize,
			offset: orderPageSize === 'all' ? 0 : orderLedger.offset,
		});

		const activeVenueId =
			filters.venueId !== 'all'
				? filters.venueId
				: (venueFocus?.venueId ?? null);
		venueSpotlightName =
			filters.venueId !== 'all'
				? (findVenueLabel(metadata.venues, filters.venueId) ??
					venueFocus?.venueName ??
					'Selected venue')
				: (venueFocus?.venueName ?? null);
		venueSpotlightSource =
			filters.venueId !== 'all'
				? 'Driven by the current venue filter'
				: venueFocus
					? 'Pinned from the order ledger'
					: '';

		if (activeVenueId) {
			const venueFilters = { ...filters, venueId: activeVenueId };
			venueSnapshot = getVenueSnapshot(database, venueFilters);
			venueMenuMemory = getMenuMemoryItems(database, venueFilters, 12);
			venueMonthlyMedian = getMonthlyMedianSeries(database, venueFilters);
			venueMonthlyOrders = getMonthlyOrderCountSeries(database, venueFilters);
		} else {
			venueSnapshot = null;
			venueMenuMemory = [];
			venueMonthlyMedian = [];
			venueMonthlyOrders = [];
		}

		if (productFocus) {
			const productFilters = resolveProductFocusFilters(filters, productFocus);
			productProfile = getProductProfile(
				database,
				productFilters,
				productFocus.itemName,
			);
			productPriceHistory = getProductPriceBreakdownSeries(
				database,
				productFilters,
				productFocus.itemName,
			);
			productOrderHistory = getProductOrderCountSeries(
				database,
				productFilters,
				productFocus.itemName,
			);
		} else {
			productProfile = null;
			productPriceHistory = [];
			productOrderHistory = [];
		}
	}

	function handleUserChange(nextUserId: string) {
		if (!database) {
			return;
		}

		const scoped = getFilterMetadata(database, nextUserId);
		metadata = scoped;
		productFocus = null;
		venueFocus = null;
		filters = normalizeVenueSelection(
			{
				userId: nextUserId,
				city: hasOption(scoped.cities, filters.city) ? filters.city : 'all',
				country: hasOption(scoped.countries, filters.country)
					? filters.country
					: 'all',
				currency: hasOption(scoped.currencies, filters.currency)
					? filters.currency
					: 'all',
				dayKind: hasOption(scoped.dayKinds, filters.dayKind)
					? filters.dayKind
					: 'all',
				daypart: hasOption(scoped.dayparts, filters.daypart)
					? filters.daypart
					: 'all',
				productLine: hasOption(scoped.productLines, filters.productLine)
					? filters.productLine
					: 'all',
				startDate: scoped.minDate
					? clampDate(
							filters.startDate || scoped.minDate,
							scoped.minDate,
							scoped.maxDate,
						)
					: '',
				endDate: scoped.maxDate
					? clampDate(
							filters.endDate || scoped.maxDate,
							scoped.minDate,
							scoped.maxDate,
						)
					: '',
				venueId: hasGroupedOption(scoped.venues, filters.venueId)
					? filters.venueId
					: 'all',
			},
			scoped.venues,
		);
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleCountryChange(nextCountry: string) {
		filters = normalizeVenueSelection({ ...filters, country: nextCountry });
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleCurrencyChange(nextCurrency: string) {
		filters = { ...filters, currency: nextCurrency };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleCityChange(nextCity: string) {
		filters = normalizeVenueSelection({ ...filters, city: nextCity });
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleProductLineChange(nextProductLine: string) {
		filters = { ...filters, productLine: nextProductLine };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleVenueChange(nextVenueId: string) {
		venueFocus = null;
		filters = { ...filters, venueId: nextVenueId };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleDayKindChange(nextDayKind: string) {
		filters = { ...filters, dayKind: nextDayKind };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleDaypartChange(nextDaypart: string) {
		filters = { ...filters, daypart: nextDaypart };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleStartDateChange(nextDate: string) {
		const nextStart = metadata.minDate
			? clampDate(nextDate, metadata.minDate, metadata.maxDate)
			: nextDate;
		const nextEnd =
			filters.endDate && nextStart && filters.endDate < nextStart
				? nextStart
				: filters.endDate;
		filters = { ...filters, endDate: nextEnd, startDate: nextStart };
		refreshDashboard({ resetOrderLedger: true });
	}

	function handleEndDateChange(nextDate: string) {
		const nextEnd = metadata.maxDate
			? clampDate(nextDate, metadata.minDate, metadata.maxDate)
			: nextDate;
		const nextStart =
			filters.startDate && nextEnd && filters.startDate > nextEnd
				? nextEnd
				: filters.startDate;
		filters = { ...filters, endDate: nextEnd, startDate: nextStart };
		refreshDashboard({ resetOrderLedger: true });
	}

	function applyWindow(days: number | 'all') {
		if (!metadata.minDate || !metadata.maxDate) {
			return;
		}

		if (days === 'all') {
			filters = {
				...filters,
				endDate: metadata.maxDate,
				startDate: metadata.minDate,
			};
		} else {
			filters = {
				...filters,
				endDate: metadata.maxDate,
				startDate: clampDate(
					shiftDate(metadata.maxDate, -(days - 1)),
					metadata.minDate,
					metadata.maxDate,
				),
			};
		}

		refreshDashboard({ resetOrderLedger: true });
	}

	function hasOption(options: FilterMetadata['countries'], value: string) {
		return options.some((option) => option.value === value);
	}

	function hasGroupedOption(groups: FilterMetadata['venues'], value: string) {
		return groups.some((group) =>
			group.options.some((option) => option.value === value),
		);
	}

	function filterVenueGroups(
		groups: FilterMetadata['venues'],
		country: string,
		city: string,
	): FilterMetadata['venues'] {
		return groups.filter(
			(group) =>
				(country === 'all' || group.country === country) &&
				(city === 'all' || group.city === city),
		);
	}

	function normalizeVenueSelection(
		nextFilters: DashboardFilters,
		groups: FilterMetadata['venues'] = metadata.venues,
	): DashboardFilters {
		const visibleGroups = filterVenueGroups(
			groups,
			nextFilters.country,
			nextFilters.city,
		);
		if (
			nextFilters.venueId === 'all' ||
			hasGroupedOption(visibleGroups, nextFilters.venueId)
		) {
			return nextFilters;
		}

		return { ...nextFilters, venueId: 'all' };
	}

	function formatVenueGroupLabel(group: FilterMetadata['venues'][number]) {
		const countryLabel =
			group.country === 'UNK'
				? 'Unknown country'
				: formatCountryName(group.country);
		return group.city === 'Unknown'
			? countryLabel
			: `${countryLabel} / ${group.city}`;
	}

	function accent(index: number) {
		return palette[index % palette.length];
	}

	function capitalizeTheme(value: string) {
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	function applyThemePreference(
		nextPreference: ThemePreference,
		mediaQuery?: MediaQueryList,
	) {
		themePreference = nextPreference;
		appliedTheme = resolveAppliedTheme(
			nextPreference,
			mediaQuery?.matches ??
				window.matchMedia('(prefers-color-scheme: dark)').matches,
		);

		const root = document.documentElement;
		root.dataset.theme = appliedTheme;
		root.dataset.themePreference = nextPreference;
		root.style.colorScheme = appliedTheme;

		const meta = document.querySelector('meta[name="theme-color"]');
		meta?.setAttribute('content', resolveThemeColor(appliedTheme));

		if (nextPreference === 'system') {
			localStorage.removeItem(THEME_STORAGE_KEY);
		} else {
			localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
		}
	}

	function handleProductSelect(event: CustomEvent<ProductSelectDetail>) {
		productFocus = {
			itemName: event.detail.itemName,
			scope: event.detail.venueId ? 'venue' : 'slice',
			venueId: event.detail.venueId,
			venueName: event.detail.venueName,
		};
		activeView = event.detail.source === 'venue' ? 'venues' : 'orders';
		refreshDashboard();
	}

	function handleOrderLedgerPageChange(event: CustomEvent<number>) {
		if (orderPageSize === 'all') {
			return;
		}

		orderLedger = {
			...orderLedger,
			offset: Math.max(0, event.detail) * orderPageSize,
		};
		refreshDashboard();
	}

	function handleOrderLedgerPageSizeChange(event: CustomEvent<number | 'all'>) {
		orderPageSize = event.detail;
		orderLedger = {
			...orderLedger,
			offset: 0,
		};
		refreshDashboard();
	}

	function clearProductFocus() {
		productFocus = null;
		refreshDashboard();
	}

	function handleProductScopeChange(
		event: CustomEvent<ProductFocusState['scope']>,
	) {
		if (!productFocus || productFocus.scope === event.detail) {
			return;
		}

		productFocus = { ...productFocus, scope: event.detail };
		refreshDashboard();
	}

	function handleVenueSelect(event: CustomEvent<VenueFocusState>) {
		venueFocus = event.detail;
		activeView = 'venues';
		refreshDashboard();
	}

	function clearVenueFocus() {
		venueFocus = null;
		if (filters.venueId !== 'all') {
			filters = { ...filters, venueId: 'all' };
		}
		refreshDashboard();
	}

	function findVenueLabel(
		groups: FilterMetadata['venues'],
		venueId: string,
	): string | null {
		for (const group of groups) {
			const option = group.options.find((entry) => entry.value === venueId);
			if (option) {
				return option.label;
			}
		}

		return null;
	}

	function resolveProductFocusFilters(
		baseFilters: DashboardFilters,
		focus: ProductFocusState,
	): DashboardFilters {
		if (focus.scope === 'venue' && focus.venueId) {
			return { ...baseFilters, venueId: focus.venueId };
		}

		return baseFilters;
	}

	function setActiveView(nextView: DashboardView) {
		activeView = nextView;
	}

	function toVenueRankItems(rows: VenueRank[]): RankItem[] {
		const maxOrders = Math.max(...rows.map((row) => row.orderCount), 1);
		return rows.map((row) => ({
			intensity: row.orderCount / maxOrders,
			meta: formatMoney(row.totalMinor, row.currency),
			subtitle: formatCountryName(row.country),
			title: row.name,
			valueLabel: `${formatCount(row.orderCount)} orders`,
		}));
	}

	function toItemRankItems(rows: ItemRank[]): RankItem[] {
		const maxUnits = Math.max(...rows.map((row) => row.unitCount), 1);
		return rows.map((row) => ({
			intensity: row.unitCount / maxUnits,
			meta: `${formatCount(row.orderCount)} orders`,
			subtitle: row.currency,
			title: row.name,
			valueLabel: `${formatCount(row.unitCount)} units`,
		}));
	}

	function toTrendPulseItems(rows: CurrencyTrendPulse[]): RankItem[] {
		const maxShift = Math.max(
			...rows.map((row) => Math.abs(row.medianDeltaRatio ?? 0)),
			0.08,
		);
		return rows.map((row) => ({
			intensity: Math.abs(row.medianDeltaRatio ?? 0) / maxShift,
			meta: row.previousMedianMinor
				? `Prev ${formatMoney(row.previousMedianMinor, row.currency)} · Spend/mo ${formatSignedPercent(
						row.spendDeltaRatio,
					)} · Orders/mo ${formatSignedPercent(row.orderDeltaRatio)}`
				: 'Not enough earlier months for a comparison baseline yet.',
			subtitle: row.previousMedianMinor
				? `Typical basket ${formatSignedPercent(row.medianDeltaRatio)} vs previous six months`
				: 'Typical basket for the latest six-month window',
			title: row.currency,
			valueLabel: formatMoney(row.recentMedianMinor, row.currency),
		}));
	}
</script>

<svelte:head>
	<title>Wolt Ledger</title>
	<meta
		name="description"
		content="Track fee pressure, venue habits, repeat dishes, and price drift across your Wolt order history."
	/>
</svelte:head>

{#if loading}
	<div
		class="mx-auto grid min-h-screen max-w-5xl place-items-center px-4 py-10"
	>
		<div class="panel grid max-w-2xl gap-3 p-7">
			<p class="eyebrow">Loading</p>
			<h1 class="text-4xl text-ink">Opening the order ledger.</h1>
			<p class="text-base leading-7 text-ink-soft">
				Loading the synced order history and preparing the dashboard.
			</p>
		</div>
	</div>
{:else if error}
	<div
		class="mx-auto grid min-h-screen max-w-5xl place-items-center px-4 py-10"
	>
		<div class="panel grid max-w-2xl gap-3 border-accent/30 p-7">
			<p class="eyebrow">Missing data</p>
			<h1 class="text-4xl text-ink">
				The dashboard can’t see a synced history file yet.
			</h1>
			<p class="text-base leading-7 text-ink-soft">{error}</p>
			<code
				class="inline-flex w-fit rounded-full bg-ink/8 px-4 py-3 text-sm text-ink"
				>./scripts/sync-wolt-history.sh --userEmail you@example.com
				--expectedOrderCount 870</code
			>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-7xl px-4 py-10 sm:px-5 sm:pb-16">
		<header
			class="reveal grid gap-4 overflow-hidden rounded-[1.8rem] border border-white/35 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_32%),linear-gradient(180deg,#57bfe4_0%,#57bfe4_100%)] p-5 shadow-[0_28px_62px_rgba(0,61,94,0.2)] lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,20rem)]"
		>
			<div class="grid content-start gap-3">
				<p
					class="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-white/78"
				>
					Wolt history dashboard
				</p>
				<h1
					class="text-[clamp(3rem,6vw,5.3rem)] font-black leading-[0.88] tracking-[-0.05em] text-white"
				>
					wolt-stats
				</h1>
				<p class="max-w-[40ch] text-sm leading-6 text-white/82">
					Unofficial hobby dashboard. Not affiliated with Wolt.
				</p>

				<div class="flex flex-wrap gap-2.5">
					<span
						class="rounded-full border border-white/28 bg-white/16 px-3.5 py-1.5 text-sm text-white backdrop-blur-[2px]"
						>{formatCount(freshness.totalOrders)} detailed orders loaded</span
					>
					{#if freshness.catalogOrders > 0}
						<span
							class="rounded-full border border-white/28 bg-white/16 px-3.5 py-1.5 text-sm text-white backdrop-blur-[2px]"
							>{formatCount(freshness.catalogOrders)} order IDs cataloged</span
						>
					{/if}
					<span
						class="rounded-full border border-white/28 bg-white/16 px-3.5 py-1.5 text-sm text-white backdrop-blur-[2px]"
						>{formatCount(freshness.syncedUsers)} user profiles loaded</span
					>
					{#if freshness.coverageStart && freshness.coverageEnd}
						<span
							class="rounded-full border border-white/28 bg-white/16 px-3.5 py-1.5 text-sm text-white backdrop-blur-[2px]"
							>Detailed coverage: {formatDateLabel(freshness.coverageStart)} to {formatDateLabel(
								freshness.coverageEnd,
							)}</span
						>
					{/if}
					{#if summary.lastOrderDate}
						<span
							class="rounded-full border border-white/28 bg-white/16 px-3.5 py-1.5 text-sm text-white backdrop-blur-[2px]"
							>Latest order: {formatDateLabel(summary.lastOrderDate)}</span
						>
					{/if}
				</div>
			</div>

			<aside
				class="grid content-start gap-2.5 rounded-[1.3rem] border p-4 text-ink"
				style={`background:var(--hero-aside-background);border-color:var(--hero-aside-border);box-shadow:var(--hero-aside-shadow);`}
			>
				<div
					class="grid gap-2 rounded-[1rem] border border-ink/10 bg-white/78 p-3"
				>
					<div class="flex items-center justify-between gap-3">
						<p
							class="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-accent-deep"
						>
							Theme
						</p>
						<span class="text-xs text-ink-soft">{themeStatusLabel}</span>
					</div>

					<div class="grid grid-cols-3 gap-2">
						{#each themeOptions as option}
							<button
								type="button"
								aria-pressed={themePreference === option.value}
								class={`rounded-full px-3 py-2 text-sm font-semibold transition ${
									themePreference === option.value
										? 'border border-accent/20 bg-accent text-white shadow-sm'
										: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
								}`}
								on:click={() => applyThemePreference(option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="h-px bg-ink/8"></div>

				<p
					class="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-accent-deep"
				>
					Fresh through
				</p>
				<strong class="text-[1.25rem]"
					>{formatDateTime(freshness.lastSyncAt)}</strong
				>
				<p class="leading-6 text-ink">
					Current focus:
					<span class="font-semibold text-accent-deep"
						>{formatCurrencyBreakdown(summary.totalSpend)}</span
					>
				</p>
				{#if freshness.catalogOrders > 0}
					<p class="text-sm leading-6 text-ink-soft">{catalogStatusLabel}</p>
				{/if}
				{#if freshness.catalogShortfall > 0}
					<p class="text-sm leading-6 text-ink-soft">
						The catalog is still short by {formatCount(
							freshness.catalogShortfall,
						)} order IDs, so detail sync is paused until the full history scan catches
						up.
					</p>
				{:else if freshness.missingDetails > 0}
					<p class="text-sm leading-6 text-ink-soft">
						Detail sync is still filling {formatCount(freshness.missingDetails)} cataloged
						orders. Older countries and currencies can stay hidden until those details
						land.
					</p>
				{:else if freshness.catalogOrders > 0}
					<p class="text-sm leading-6 text-ink-soft">
						Catalog and detail tables are aligned.
					</p>
				{/if}
			</aside>
		</header>

		<section class="panel reveal mt-5 grid gap-4 p-5">
			<div class="grid gap-1">
				<h2 class="text-3xl text-ink">Slice the history</h2>
				<p class="leading-7 text-ink-soft">
					Filter the ledger by user, place, venue, currency, and time window to
					isolate the pattern you actually want to inspect.
				</p>
			</div>

			{#if freshness.catalogShortfall > 0 || freshness.missingDetails > 0}
				<div
					class="rounded-[1.25rem] border border-accent/20 bg-accent/8 px-4 py-4 text-sm leading-7 text-ink"
				>
					{#if freshness.catalogShortfall > 0}
						The ID catalog currently holds {formatCount(
							freshness.catalogOrders,
						)} unique orders. Expected baseline: {formatCount(
							freshness.expectedOrders ?? 0,
						)}. Detail fetches resume only after the catalog reaches that floor.
					{:else}
						Only {formatCount(freshness.totalOrders)} of {formatCount(
							freshness.catalogOrders,
						)} cataloged orders have detailed payloads loaded. Country and currency
						filters only reflect those detailed rows.
					{/if}
				</div>
			{/if}

			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				<label class="grid gap-2 text-sm text-ink-soft" for="filter-user">
					<span class="font-bold text-ink">User</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-user"
						name="userId"
						value={filters.userId}
						on:change={(event) => handleUserChange(event.currentTarget.value)}
					>
						{#each metadata.users as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-country">
					<span class="font-bold text-ink">Country</span>
					<select
						autocomplete="country-name"
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-country"
						name="country"
						value={filters.country}
						on:change={(event) =>
							handleCountryChange(event.currentTarget.value)}
					>
						{#each metadata.countries as option}
							<option value={option.value}>
								{option.value === 'all'
									? option.label
									: formatCountryName(option.label)}
							</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-currency">
					<span class="font-bold text-ink">Currency</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-currency"
						name="currency"
						value={filters.currency}
						on:change={(event) =>
							handleCurrencyChange(event.currentTarget.value)}
					>
						{#each metadata.currencies as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-city">
					<span class="font-bold text-ink">City</span>
					<select
						autocomplete="address-level2"
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-city"
						name="city"
						value={filters.city}
						on:change={(event) => handleCityChange(event.currentTarget.value)}
					>
						{#each metadata.cities as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label
					class="grid gap-2 text-sm text-ink-soft"
					for="filter-product-line"
				>
					<span class="font-bold text-ink">Venue type</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-product-line"
						name="productLine"
						value={filters.productLine}
						on:change={(event) =>
							handleProductLineChange(event.currentTarget.value)}
					>
						{#each metadata.productLines as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-venue">
					<span class="font-bold text-ink">Venue</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-venue"
						name="venueId"
						value={filters.venueId}
						on:change={(event) => handleVenueChange(event.currentTarget.value)}
					>
						<option value="all">All venues</option>
						{#each visibleVenueGroups as group}
							<optgroup label={formatVenueGroupLabel(group)}>
								{#each group.options as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-day-kind">
					<span class="font-bold text-ink">Week split</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-day-kind"
						name="dayKind"
						value={filters.dayKind}
						on:change={(event) =>
							handleDayKindChange(event.currentTarget.value)}
					>
						{#each metadata.dayKinds as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-daypart">
					<span class="font-bold text-ink">Daypart</span>
					<select
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-daypart"
						name="daypart"
						value={filters.daypart}
						on:change={(event) =>
							handleDaypartChange(event.currentTarget.value)}
					>
						{#each metadata.dayparts as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-start-date">
					<span class="font-bold text-ink">From</span>
					<input
						autocomplete="off"
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-start-date"
						name="startDate"
						type="date"
						value={filters.startDate}
						min={metadata.minDate}
						max={metadata.maxDate}
						on:change={(event) =>
							handleStartDateChange(event.currentTarget.value)}
					/>
				</label>

				<label class="grid gap-2 text-sm text-ink-soft" for="filter-end-date">
					<span class="font-bold text-ink">To</span>
					<input
						autocomplete="off"
						class="w-full rounded-2xl border border-ink/12 bg-white/85 px-4 py-3 text-ink outline-none transition focus:border-accent/40"
						id="filter-end-date"
						name="endDate"
						type="date"
						value={filters.endDate}
						min={metadata.minDate}
						max={metadata.maxDate}
						on:change={(event) =>
							handleEndDateChange(event.currentTarget.value)}
					/>
				</label>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="button"
					class="rounded-full border border-ink/9 bg-white/60 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/90"
					on:click={() => applyWindow('all')}>All time</button
				>
				<button
					type="button"
					class="rounded-full border border-ink/9 bg-white/60 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/90"
					on:click={() => applyWindow(365)}>365d</button
				>
				<button
					type="button"
					class="rounded-full border border-ink/9 bg-white/60 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/90"
					on:click={() => applyWindow(180)}>180d</button
				>
				<button
					type="button"
					class="rounded-full border border-ink/9 bg-white/60 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/90"
					on:click={() => applyWindow(90)}>90d</button
				>
				<button
					type="button"
					class="rounded-full border border-ink/9 bg-white/60 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-white/90"
					on:click={() => applyWindow(30)}>30d</button
				>
			</div>
		</section>

		{#if summary.totalOrders === 0}
			<section class="panel reveal mt-5 grid justify-items-start gap-2 p-5">
				<h2 class="text-3xl text-ink">No orders match this filter window.</h2>
				<p class="leading-7 text-ink-soft">
					Try widening the date range, currency, or country filters.
				</p>
			</section>
		{:else}
			<section class="reveal mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<StatCard
					eyebrow="Footprint"
					title="Orders in scope"
					value={formatCount(summary.totalOrders)}
					detail={`${formatCount(summary.activeDays)} active days across ${formatCount(summary.activeCountries)} countries`}
				/>
				<StatCard
					eyebrow="Spend"
					title="Total paid"
					value={formatCurrencyBreakdown(summary.totalSpend)}
					detail="Kept per currency to avoid fake FX math."
				/>
				<StatCard
					eyebrow="Ticket"
					title="Typical order"
					value={formatCurrencyBreakdown(summary.medianOrderValue)}
					detail="Median basket size, so one wild spike does not hijack the signal."
				/>
				<StatCard
					eyebrow="Fees"
					title="Fee pressure"
					value={formatPercent(summary.avgFeeRate)}
					detail="Average delivery + service fee share of each order total."
				/>
				<StatCard
					eyebrow="Venue"
					title="Top repeat venue"
					value={summary.topVenue ? summary.topVenue.name : '—'}
					detail={summary.topVenue
						? `${formatCountryName(summary.topVenue.country)} · ${formatCount(summary.topVenue.orderCount)} orders`
						: 'No venue inside this slice'}
				/>
				<StatCard
					eyebrow="Dish"
					title="Most repeated item"
					value={summary.topItem ? summary.topItem.name : '—'}
					detail={summary.topItem
						? `${formatCount(summary.topItem.unitCount)} units across ${formatCount(summary.topItem.orderCount)} orders`
						: 'No items inside this slice'}
				/>
			</section>

			<section class="panel reveal mt-5 grid gap-4 p-5">
				<div class="grid gap-1">
					<p class="eyebrow">Explore modes</p>
					<h2 class="text-3xl text-ink">
						Switch between overview and drilldowns
					</h2>
					<p class="max-w-[62ch] leading-7 text-ink-soft">
						Keep the macro trend view lean, then jump into recent orders,
						product price replay, or venue-specific memory only when you need
						the detail.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
							activeView === 'overview'
								? 'border border-accent/20 bg-accent text-white shadow-sm'
								: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
						}`}
						on:click={() => setActiveView('overview')}
					>
						Overview
					</button>
					<button
						type="button"
						class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
							activeView === 'orders'
								? 'border border-accent/20 bg-accent text-white shadow-sm'
								: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
						}`}
						on:click={() => setActiveView('orders')}
					>
						Orders
					</button>
					<button
						type="button"
						class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
							activeView === 'venues'
								? 'border border-accent/20 bg-accent text-white shadow-sm'
								: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
						}`}
						on:click={() => setActiveView('venues')}
					>
						Venues
					</button>
				</div>
			</section>

			{#if activeView === 'overview'}
				<section class="reveal mt-5">
					<RankList
						title="Six-month pulse"
						subtitle="Typical basket, monthly spend, and order cadence versus the previous six-month window, per currency."
						items={trendPulseItems}
					/>
				</section>

				<section class="reveal mt-5 grid gap-4">
					<div class="grid gap-1">
						<p class="eyebrow">Price signal</p>
						<h2 class="text-3xl text-ink">Typical basket by month</h2>
						<p class="max-w-[68ch] leading-7 text-ink-soft">
							This replaces the noisy day-level average with a monthly median
							per currency, which is a better read on what a normal order has
							been costing you.
						</p>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						{#each monthlyMedianGroups as group, index}
							<LineChart
								accent={accent(index)}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									value: row.value,
								}))}
								format="currency"
								granularity="month"
								subtitle="Monthly median order total"
								title={group.key}
							/>
						{/each}
					</div>
				</section>

				<section class="reveal mt-5 grid gap-4">
					<div class="grid gap-1">
						<p class="eyebrow">Cadence signal</p>
						<h2 class="text-3xl text-ink">Orders per month</h2>
						<p class="max-w-[68ch] leading-7 text-ink-soft">
							This separates “I’m ordering more often” from “each basket costs
							more,” which matters a lot when the spend curve starts climbing.
						</p>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						{#each monthlyOrderGroups as group, index}
							<LineChart
								accent={accent(index)}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									value: row.value,
								}))}
								format="count"
								granularity="month"
								subtitle="Order count per month"
								title={group.key}
							/>
						{/each}
					</div>
				</section>

				<section class="reveal mt-5 grid gap-4">
					<div class="grid gap-1">
						<p class="eyebrow">Monthly signal</p>
						<h2 class="text-3xl text-ink">Spend pace by month</h2>
						<p class="max-w-[68ch] leading-7 text-ink-soft">
							This shows how your spend accelerates or cools down, again split
							by currency so the y-axis stays honest.
						</p>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						{#each monthlySpendGroups as group, index}
							<LineChart
								accent={accent(index + 1)}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									value: row.value,
								}))}
								format="currency"
								granularity="month"
								subtitle="Total paid per month"
								title={group.key}
							/>
						{/each}
					</div>
				</section>

				<section class="reveal mt-5 grid gap-4">
					<div class="grid gap-1">
						<p class="eyebrow">Fee signal</p>
						<h2 class="text-3xl text-ink">How fee pressure changed</h2>
						<p class="max-w-[68ch] leading-7 text-ink-soft">
							The median line tracks the fee share of a typical order each
							month. The average line stays useful for the blended load, but the
							median shows the cleaner per-order trend.
						</p>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						<LineChart
							accent="var(--chart-accent-1)"
							data={medianFeeSeries}
							format="percent"
							granularity="month"
							subtitle="Median delivery + service fee share per order, grouped by month."
							title="Typical fee share"
						/>

						<LineChart
							accent="var(--chart-accent-5)"
							data={feeSeries}
							format="percent"
							granularity="month"
							subtitle="Average delivery + service fee share across all orders in the month."
							title="Average fee share"
						/>
					</div>
				</section>

				<section class="reveal mt-5">
					<BarChart
						accent="var(--chart-accent-2)"
						data={countryChartData}
						subtitle="Order count by venue country."
						title="Country mix"
					/>
				</section>

				<section class="reveal mt-5">
					<HeatmapChart
						data={heatmap}
						subtitle="Local order time. Fast way to spot weekday routines and weekend drift."
						theme={appliedTheme}
						title="When you order"
					/>
				</section>
			{/if}

			{#if activeView === 'orders'}
				<section class="reveal mt-5">
					<OrderLedger
						offset={orderLedger.offset}
						orders={orderLedger.orders}
						pageSize={orderPageSize}
						totalOrders={orderLedger.totalOrders}
						on:pagechange={handleOrderLedgerPageChange}
						on:pagesizechange={handleOrderLedgerPageSizeChange}
						on:productselect={handleProductSelect}
						on:venueselect={handleVenueSelect}
					/>
				</section>

				<section class="reveal mt-5">
					<RankList
						items={topItemRows}
						subtitle="Unit counts show what keeps coming back across the current slice."
						title="Top items in this slice"
					/>
				</section>
			{/if}

			{#if activeView === 'venues'}
				<section class="reveal mt-5">
					<VenueSpotlight
						canClear={Boolean(venueSpotlightName)}
						menuMemoryItems={venueMenuMemory}
						monthlyMedian={venueMonthlyMedian}
						monthlyOrders={venueMonthlyOrders}
						snapshot={venueSnapshot}
						sourceLabel={venueSpotlightSource}
						venueName={venueSpotlightName}
						on:clear={clearVenueFocus}
						on:productselect={handleProductSelect}
					/>
				</section>
				<section class="reveal mt-5">
					<RankList
						items={topVenueItems}
						subtitle="Sorted by repeat frequency, with total spend shown per venue currency."
						title="Top venues in this slice"
					/>
				</section>
			{/if}
		{/if}
	</div>

	{#if productFocus}
		<ModalShell title={productFocus.itemName} on:close={clearProductFocus}>
			<ProductSpotlight
				canToggleScope={Boolean(productFocus?.venueId)}
				dismissLabel="Close replay"
				itemName={productFocus?.itemName ?? null}
				orderCountSeries={productOrderHistory}
				priceBreakdownSeries={productPriceHistory}
				profile={productProfile}
				scopeMode={productFocus?.scope ?? 'slice'}
				showDismissButton={false}
				venueName={productFocus?.venueName ?? null}
				on:clear={clearProductFocus}
				on:scopechange={handleProductScopeChange}
			/>
		</ModalShell>
	{/if}
{/if}
