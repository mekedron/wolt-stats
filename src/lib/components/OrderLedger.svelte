<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	import type { OrderLineItem, OrderRecord } from '$lib/types';
	import {
		formatCountryName,
		formatCount,
		formatDateLabel,
		formatDateTime,
		formatMoney,
		formatPercent,
	} from '$lib/utils/format';

	type ProductSelectDetail = {
		itemName: string;
		source: 'ledger';
		venueId: string | null;
		venueName: string;
	};

	type VenueSelectDetail = {
		venueId: string;
		venueName: string;
	};

	export let orders: OrderRecord[] = [];

	const dispatch = createEventDispatcher<{
		productselect: ProductSelectDetail;
		venueselect: VenueSelectDetail;
	}>();

	function trackItem(order: OrderRecord, item: OrderLineItem) {
		dispatch('productselect', {
			itemName: item.itemName,
			source: 'ledger',
			venueId: order.venueId,
			venueName: order.venueName,
		});
	}

	function pinVenue(order: OrderRecord) {
		if (!order.venueId) {
			return;
		}

		dispatch('venueselect', {
			venueId: order.venueId,
			venueName: order.venueName,
		});
	}

	function orderMoment(order: OrderRecord) {
		return order.orderLocalDateTime
			? formatDateTime(order.orderLocalDateTime)
			: order.orderLocalDate
				? formatDateLabel(order.orderLocalDate)
				: 'Unknown date';
	}
</script>

<section class="panel grid gap-5 p-5">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="grid gap-1">
			<p class="eyebrow">Order ledger</p>
			<h2 class="text-[clamp(1.9rem,4vw,2.35rem)] text-ink">
				Open any recent order
			</h2>
			<p class="max-w-[62ch] leading-7 text-ink-soft">
				Expand an order to inspect the basket, then jump straight into a product
				price trend or pin a venue-specific replay.
			</p>
		</div>
		<span
			class="rounded-full border border-ink/12 bg-white/75 px-4 py-2 text-sm text-ink"
		>
			{formatCount(orders.length)} recent orders
		</span>
	</div>

	{#if orders.length === 0}
		<div
			class="rounded-[1.3rem] border border-dashed border-ink/18 bg-white/55 px-4 py-5 text-sm leading-7 text-ink-soft"
		>
			No detailed orders inside the current slice yet.
		</div>
	{:else}
		<div class="grid gap-3">
			{#each orders as order, index}
				<details class="card-surface overflow-hidden" open={index === 0}>
					<summary
						class="grid cursor-pointer list-none gap-3 p-4 lg:grid-cols-[minmax(0,1.25fr)_auto]"
					>
						<div class="grid min-w-0 gap-2">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="break-words text-2xl text-ink">{order.venueName}</h3>
								{#if order.productLine}
									<span
										class="rounded-full bg-olive/12 px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-olive"
									>
										{order.productLine}
									</span>
								{/if}
							</div>
							<p class="break-words text-sm leading-6 text-ink-soft">
								{orderMoment(order)}
								{#if order.deliveryCity}
									· {order.deliveryCity}
								{/if}
								{#if order.venueCountry}
									· {formatCountryName(order.venueCountry)}
								{/if}
								{#if order.orderNumber}
									· #{order.orderNumber}
								{/if}
							</p>
						</div>

						<div
							class="grid justify-items-start gap-1 text-left lg:justify-items-end lg:text-right"
						>
							<strong class="text-[1.35rem] leading-none text-ink">
								{formatMoney(order.totalMinor, order.currency)}
							</strong>
							<p class="text-sm text-ink-soft">
								Fees {formatMoney(order.feesMinor, order.currency)}
								{#if order.feeShare !== null}
									· {formatPercent(order.feeShare)}
								{/if}
							</p>
						</div>
					</summary>

					<div class="border-t border-ink/8 px-4 pb-4 pt-4">
						<div class="flex flex-wrap gap-2">
							{#if order.venueId}
								<button
									type="button"
									class="rounded-full border border-accent/18 bg-accent/8 px-3 py-2 text-sm font-semibold text-accent-deep transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-accent/12"
									on:click={() => pinVenue(order)}
								>
									Pin venue dashboard
								</button>
							{/if}
							{#if order.paymentMethodName}
								<span
									class="rounded-full border border-ink/10 bg-white/78 px-3 py-2 text-sm text-ink-soft"
								>
									Paid with {order.paymentMethodName}
								</span>
							{/if}
							{#if order.itemsSummary}
								<span
									class="rounded-full border border-ink/10 bg-white/78 px-3 py-2 text-sm text-ink-soft"
								>
									{order.itemsSummary}
								</span>
							{/if}
						</div>

						{#if order.items.length === 0}
							<p class="mt-4 text-sm leading-6 text-ink-soft">
								Item rows are missing for this order.
							</p>
						{:else}
							<ul class="mt-4 grid gap-2">
								{#each order.items as item}
									<li
										class="rounded-[1.2rem] border border-ink/10 bg-white/72 p-3"
									>
										<div
											class="flex flex-wrap items-start justify-between gap-3"
										>
											<div class="min-w-0 flex-1">
												<button
													type="button"
													class="text-left text-base font-semibold text-ink underline decoration-accent/35 underline-offset-4 transition hover:text-accent-deep"
													on:click={() => trackItem(order, item)}
												>
													{item.itemName}
												</button>
												<p class="mt-1 text-sm leading-6 text-ink-soft">
													{formatCount(item.quantity)} unit{item.quantity === 1
														? ''
														: 's'}
													{#if item.unitPriceMinor > 0}
														· about {formatMoney(
															item.unitPriceMinor,
															order.currency,
														)} each
													{/if}
												</p>
											</div>
											<div class="text-right">
												<strong class="text-sm text-ink">
													{formatMoney(item.lineTotalMinor, order.currency)}
												</strong>
												<p class="mt-1 text-xs leading-5 text-ink-soft">
													Track product price
												</p>
											</div>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</section>
