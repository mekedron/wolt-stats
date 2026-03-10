<script lang="ts">
	import type { RankItem } from '$lib/types';

	export let title = '';
	export let subtitle = '';
	export let items: RankItem[] = [];
</script>

<section class="card-surface min-w-0 overflow-hidden grid gap-4 p-5">
	<div class="grid gap-1">
		<h2 class="text-2xl text-ink">{title}</h2>
		{#if subtitle}
			<p class="text-sm leading-6 text-ink-soft">{subtitle}</p>
		{/if}
	</div>

	{#if items.length === 0}
		<p class="text-sm text-ink-soft">No rows inside this filter window.</p>
	{:else}
		<ol class="grid gap-4">
			{#each items as item, index}
				<li class="grid gap-2">
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<span
								class="inline-flex size-8 items-center justify-center rounded-full bg-accent/12 font-bold text-accent-deep"
								>{index + 1}</span
							>
							<div>
								<h3 class="break-words text-base text-ink">{item.title}</h3>
								<p class="break-words text-sm text-ink-soft">{item.subtitle}</p>
							</div>
						</div>
						<div class="flex flex-col items-end gap-0.5 text-right">
							<strong class="text-sm text-ink">{item.valueLabel}</strong>
							{#if item.meta}
								<small class="break-words text-xs text-ink-soft"
									>{item.meta}</small
								>
							{/if}
						</div>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-ink/8">
						<span
							class="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-mustard))]"
							style={`width: ${Math.max(12, item.intensity * 100)}%`}
						></span>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
