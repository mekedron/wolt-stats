<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	import LineChart from '$lib/components/LineChart.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { MenuMemoryItem, SeriesPoint, VenueSnapshot } from '$lib/types';
	import {
		formatCountryName,
		formatCount,
		formatCurrencyBreakdown,
		formatDateLabel,
		formatMoney,
		formatPercent,
		groupSeriesByKey,
	} from '$lib/utils/format';

	type ProductSelectDetail = {
		itemName: string;
		source: 'venue';
		venueId: string | null;
		venueName: string;
	};

	export let canClear = false;
	export let menuMemoryItems: MenuMemoryItem[] = [];
	export let monthlyMedian: SeriesPoint[] = [];
	export let monthlyOrders: SeriesPoint[] = [];
	export let sourceLabel = 'Pinned from the ledger';
	export let snapshot: VenueSnapshot | null = null;
	export let venueName: string | null = null;

	const dispatch = createEventDispatcher<{
		clear: void;
		productselect: ProductSelectDetail;
	}>();

	const palette = ['#009de0', '#1fc70a', '#fc6200', '#0f2594'];

	$: medianGroups = groupSeriesByKey(monthlyMedian);
	$: orderGroups = groupSeriesByKey(monthlyOrders);
	$: headerVenueName = snapshot?.venueName ?? venueName ?? 'Venue spotlight';

	function menuSubtitle(item: MenuMemoryItem) {
		const detail: string[] = [
			`${formatCount(item.orderCount)} orders`,
			`${formatCount(item.unitCount)} units`,
		];

		if (item.lastSeen) {
			detail.push(`Last seen ${formatDateLabel(item.lastSeen)}`);
		}

		return detail.join(' · ');
	}

	function menuPrice(value: number | null, currency: string) {
		return value === null ? '—' : formatMoney(value, currency);
	}

	function latestPriceSummary(item: MenuMemoryItem) {
		const line = menuPrice(item.latestLinePriceMinor, item.currency);
		const paid = menuPrice(item.latestNetPriceMinor, item.currency);

		if (
			item.latestLinePriceMinor === null &&
			item.latestNetPriceMinor === null
		) {
			return '—';
		}

		if (
			item.latestLinePriceMinor !== null &&
			item.latestNetPriceMinor !== null
		) {
			if (item.latestLinePriceMinor === item.latestNetPriceMinor) {
				return `${paid} paid = line`;
			}

			return `${paid} paid · ${line} line`;
		}

		return item.latestNetPriceMinor !== null ? `${paid} paid` : `${line} line`;
	}

	function trackItem(itemName: string) {
		dispatch('productselect', {
			itemName,
			source: 'venue',
			venueId: snapshot?.venueId ?? null,
			venueName: headerVenueName,
		});
	}
</script>

<section class="panel grid gap-5 p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="grid gap-1">
			<p class="eyebrow">Venue replay</p>
			<h2 class="text-[clamp(1.9rem,4vw,2.35rem)] text-ink">
				Rebuild one venue from memory
			</h2>
			<p class="max-w-[62ch] leading-7 text-ink-soft">
				This stays history-only: repeat visits, menu-memory items, typical
				basket, and how often the venue shows up over time.
			</p>
		</div>

		{#if canClear}
			<button
				type="button"
				class="rounded-full border border-ink/12 bg-white/75 px-4 py-2 text-sm text-ink transition hover:-translate-y-0.5 hover:border-accent/30"
				on:click={() => dispatch('clear')}
			>
				Clear venue
			</button>
		{/if}
	</div>

	{#if !snapshot && !venueName}
		<div
			class="rounded-[1.3rem] border border-dashed border-ink/18 bg-white/55 px-4 py-5 text-sm leading-7 text-ink-soft"
		>
			Choose a venue from the filter bar or pin one from a recent order.
		</div>
	{:else if !snapshot}
		<div
			class="rounded-[1.3rem] border border-dashed border-ink/18 bg-white/55 px-4 py-5 text-sm leading-7 text-ink-soft"
		>
			No detailed venue history for <span class="font-semibold text-ink"
				>{venueName}</span
			> inside the current slice.
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="rounded-full border border-accent/18 bg-accent/8 px-3 py-2 text-sm font-semibold text-accent-deep"
			>
				{headerVenueName}
			</span>
			<span
				class="rounded-full border border-ink/10 bg-white/78 px-3 py-2 text-sm text-ink-soft"
			>
				{formatCountryName(snapshot.country)}
				{#if snapshot.city}
					· {snapshot.city}
				{/if}
				{#if snapshot.productLine}
					· {snapshot.productLine}
				{/if}
			</span>
			<span
				class="rounded-full border border-ink/10 bg-white/78 px-3 py-2 text-sm text-ink-soft"
			>
				{sourceLabel}
			</span>
		</div>

		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatCard
				eyebrow="Visits"
				title="Orders at this venue"
				value={formatCount(snapshot.totalOrders)}
				detail={`${formatCount(snapshot.activeMonths)} active months in the record`}
			/>
			<StatCard
				eyebrow="Spend"
				title="Total paid here"
				value={formatCurrencyBreakdown(snapshot.totalSpend)}
				detail="Kept per currency from actual paid orders."
			/>
			<StatCard
				eyebrow="Ticket"
				title="Typical basket here"
				value={formatCurrencyBreakdown(snapshot.medianOrderValue)}
				detail="Monthly spikes removed by using medians."
			/>
			<StatCard
				eyebrow="Fees"
				title="Average fee share"
				value={formatPercent(snapshot.avgFeeRate)}
				detail={snapshot.firstSeen
					? `Seen since ${formatDateLabel(snapshot.firstSeen)}${snapshot.lastSeen ? ` · Last seen ${formatDateLabel(snapshot.lastSeen)}` : ''}`
					: 'No time window available'}
			/>
		</div>

		<div class="grid gap-4 xl:grid-cols-2 xl:items-start">
			<section class="grid min-w-0 content-start gap-4">
				<div class="grid gap-1">
					<h3 class="text-2xl text-ink">Venue price curve</h3>
					<p class="text-sm leading-6 text-ink-soft">
						Typical monthly basket value for this venue.
					</p>
				</div>

				{#if medianGroups.length === 0}
					<p
						class="rounded-[1.1rem] border border-dashed border-ink/18 bg-white/58 px-4 py-4 text-sm leading-6 text-ink-soft"
					>
						No monthly basket series inside this slice.
					</p>
				{:else}
					<div class="grid gap-4">
						{#each medianGroups as group, index}
							<LineChart
								accent={palette[index % palette.length]}
								currency={group.key}
								data={group.rows.map((row) => ({
									label: row.label,
									value: row.value,
								}))}
								format="currency"
								granularity="month"
								subtitle="Monthly median order total at this venue."
								title={group.key}
							/>
						{/each}
					</div>
				{/if}
			</section>

			<section class="grid min-w-0 content-start gap-4">
				<div class="grid gap-1">
					<h3 class="text-2xl text-ink">Venue cadence</h3>
					<p class="text-sm leading-6 text-ink-soft">
						How often the venue appears in your history, grouped by month.
					</p>
				</div>

				{#if orderGroups.length === 0}
					<p
						class="rounded-[1.1rem] border border-dashed border-ink/18 bg-white/58 px-4 py-4 text-sm leading-6 text-ink-soft"
					>
						No order-count series inside this slice.
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
								subtitle="Distinct orders from this venue."
								title={group.key}
							/>
						{/each}
					</div>
				{/if}
			</section>
		</div>

		<section class="card-surface min-w-0 overflow-hidden grid gap-4 p-5">
			<div class="grid gap-1">
				<h3 class="text-2xl text-ink">Menu memory</h3>
				<p class="text-sm leading-6 text-ink-soft">
					Most repeated items from paid orders only. Click one to open its price
					trend.
				</p>
			</div>

			{#if menuMemoryItems.length === 0}
				<p class="text-sm leading-6 text-ink-soft">
					No remembered menu rows inside this slice.
				</p>
			{:else}
				<ol class="grid gap-3 xl:grid-cols-2">
					{#each menuMemoryItems as item, index}
						<li class="rounded-[1.2rem] border border-ink/10 bg-white/78 p-3">
							<div class="flex items-start gap-3">
								<span
									class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-olive/12 font-bold text-olive"
								>
									{index + 1}
								</span>
								<div class="min-w-0 flex-1">
									<button
										type="button"
										class="break-words text-left text-base font-semibold text-ink underline decoration-accent/35 underline-offset-4 transition hover:text-accent-deep"
										on:click={() => trackItem(item.name)}
									>
										{item.name}
									</button>
									<p class="mt-1 break-words text-sm leading-6 text-ink-soft">
										{menuSubtitle(item)}
									</p>
								</div>
							</div>

							<div class="mt-3 flex flex-wrap gap-2 text-sm">
								<div
									class="inline-flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-[1rem] border border-accent/16 bg-accent/7 px-3 py-2"
								>
									<span
										class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent-deep/78"
									>
										Latest
									</span>
									<strong class="break-words text-ink">
										{latestPriceSummary(item)}
									</strong>
								</div>
								<div
									class="inline-flex min-w-[11rem] items-center gap-2 rounded-[1rem] border border-ink/10 bg-white/85 px-3 py-2"
								>
									<span class="text-ink-soft">Typical paid</span>
									<strong class="text-ink">
										{menuPrice(item.medianNetPriceMinor, item.currency)}
									</strong>
								</div>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}
</section>
