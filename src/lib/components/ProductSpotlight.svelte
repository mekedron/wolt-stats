<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	import LineChart from '$lib/components/LineChart.svelte';
	import MultiLineChart from '$lib/components/MultiLineChart.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type {
		MetricSeriesPoint,
		ProductProfile,
		SeriesPoint,
	} from '$lib/types';
	import {
		formatCount,
		formatCurrencyBreakdown,
		formatDateLabel,
		groupSeriesByKey,
	} from '$lib/utils/format';

	export let canToggleScope = false;
	export let dismissLabel = 'Clear product';
	export let itemName: string | null = null;
	export let orderCountSeries: SeriesPoint[] = [];
	export let priceBreakdownSeries: MetricSeriesPoint[] = [];
	export let profile: ProductProfile | null = null;
	export let showDismissButton = true;
	export let scopeMode: 'slice' | 'venue' = 'slice';
	export let venueName: string | null = null;

	const dispatch = createEventDispatcher<{
		clear: void;
		scopechange: 'slice' | 'venue';
	}>();

	const palette = ['#009de0', '#1fc70a', '#fc6200', '#0f2594'];

	$: priceGroups = groupMetricSeriesByCurrency(priceBreakdownSeries);
	$: orderGroups = groupSeriesByKey(orderCountSeries);
	$: scopeLabel =
		scopeMode === 'venue' && venueName
			? `Same venue only: ${venueName}`
			: 'Current dashboard slice';

	function groupMetricSeriesByCurrency(rows: MetricSeriesPoint[]) {
		const grouped = new Map<string, MetricSeriesPoint[]>();

		for (const row of rows) {
			const next = grouped.get(row.currency) ?? [];
			next.push(row);
			grouped.set(row.currency, next);
		}

		return [...grouped.entries()].map(([key, value]) => ({
			key,
			rows: value,
		}));
	}
</script>

<section class="panel grid gap-5 p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="grid gap-1">
			<p class="eyebrow">Product spotlight</p>
			<h2 class="text-[clamp(1.9rem,4vw,2.35rem)] text-ink">
				Replay one dish over time
			</h2>
			<p class="max-w-[62ch] leading-7 text-ink-soft">
				Pick an item from the order ledger or venue memory. The price line uses
				monthly medians so a single promo or surcharge does not distort the
				trend.
			</p>
		</div>

		{#if itemName && showDismissButton}
			<button
				type="button"
				class="rounded-full border border-ink/12 bg-white/75 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/30"
				on:click={() => dispatch('clear')}
			>
				{dismissLabel}
			</button>
		{/if}
	</div>

	{#if !itemName}
		<div
			class="rounded-[1.3rem] border border-dashed border-ink/18 bg-white/55 px-4 py-5 text-sm leading-7 text-ink-soft"
		>
			Choose an item from a recent order or a venue menu-memory row to inspect
			its price history.
		</div>
	{:else if !profile}
		<div
			class="rounded-[1.3rem] border border-dashed border-ink/18 bg-white/55 px-4 py-5 text-sm leading-7 text-ink-soft"
		>
			No priced observations for <span class="font-semibold text-ink"
				>{itemName}</span
			> inside the current scope.
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="rounded-full border border-accent/18 bg-accent/8 px-3 py-2 text-sm font-semibold text-accent-deep"
			>
				{itemName}
			</span>
			<span
				class="rounded-full border border-ink/10 bg-white/78 px-3 py-2 text-sm text-ink-soft"
			>
				Scope: {scopeLabel}
			</span>
		</div>

		{#if canToggleScope}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
						scopeMode === 'venue'
							? 'border border-accent/20 bg-accent text-white shadow-sm'
							: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
					}`}
					on:click={() => dispatch('scopechange', 'venue')}
				>
					Same venue
				</button>
				<button
					type="button"
					class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
						scopeMode === 'slice'
							? 'border border-accent/20 bg-accent text-white shadow-sm'
							: 'border border-ink/12 bg-white/78 text-ink hover:border-accent/28'
					}`}
					on:click={() => dispatch('scopechange', 'slice')}
				>
					Current slice
				</button>
			</div>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatCard
				eyebrow="Reach"
				title="Orders containing it"
				value={formatCount(profile.orderCount)}
				detail={`${formatCount(profile.unitCount)} units across ${formatCount(profile.venueCount)} venues`}
			/>
			<StatCard
				eyebrow="List"
				title="Latest listed price"
				value={formatCurrencyBreakdown(profile.latestListedPrices)}
				detail={`Latest paid ${formatCurrencyBreakdown(profile.latestObservedPrices)}`}
			/>
			<StatCard
				eyebrow="Median"
				title="Typical paid price"
				value={formatCurrencyBreakdown(profile.medianObservedPrices)}
				detail={`Typical listed ${formatCurrencyBreakdown(profile.medianListedPrices)}`}
			/>
			<StatCard
				eyebrow="Window"
				title="Seen between"
				value={profile.firstSeen ? formatDateLabel(profile.firstSeen) : '—'}
				detail={profile.lastSeen
					? `Last seen ${formatDateLabel(profile.lastSeen)}`
					: 'No recent observation'}
			/>
		</div>

		<div class="grid gap-4 xl:grid-cols-2">
			<section class="grid gap-4">
				<div class="grid gap-1">
					<h3 class="text-2xl text-ink">Price drift</h3>
					<p class="text-sm leading-6 text-ink-soft">
						Monthly medians split into list price, order-line price, and
						estimated paid price after order discounts.
					</p>
				</div>

				{#if priceGroups.length === 0}
					<p
						class="rounded-[1.1rem] border border-dashed border-ink/18 bg-white/58 px-4 py-4 text-sm leading-6 text-ink-soft"
					>
						No price series inside this scope.
					</p>
				{:else}
					<div class="grid gap-4">
						{#each priceGroups as group}
							<MultiLineChart
								colors={['#0f2594', '#009de0', '#1fc70a']}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									series: row.metric,
									value: row.value,
								}))}
								format="currency"
								granularity="month"
								subtitle="Legend: list price, order-line price, and estimated net after discounts."
								title={group.key}
							/>
						{/each}
					</div>
				{/if}
			</section>

			<section class="grid gap-4">
				<div class="grid gap-1">
					<h3 class="text-2xl text-ink">Repeat frequency</h3>
					<p class="text-sm leading-6 text-ink-soft">
						Distinct orders containing the product, grouped by month.
					</p>
				</div>

				{#if orderGroups.length === 0}
					<p
						class="rounded-[1.1rem] border border-dashed border-ink/18 bg-white/58 px-4 py-4 text-sm leading-6 text-ink-soft"
					>
						No repeat-frequency series inside this scope.
					</p>
				{:else}
					<div class="grid gap-4">
						{#each orderGroups as group, index}
							<LineChart
								accent={palette[(index + 1) % palette.length]}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									value: row.value,
								}))}
								format="count"
								granularity="month"
								subtitle="Distinct orders containing the product."
								title={group.key}
							/>
						{/each}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</section>
