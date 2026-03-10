<script lang="ts">
	import { max, scaleBand, scaleLinear } from 'd3';
	import { onMount } from 'svelte';

	import { formatCount } from '$lib/utils/format';

	export let accent = 'var(--chart-accent-1)';
	export let data: Array<{ label: string; value: number }> = [];
	export let subtitle = '';
	export let title = '';

	const height = 280;
	const margin = { bottom: 56, left: 44, right: 12, top: 16 };
	let container: HTMLDivElement;
	let width = 480;

	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			width = Math.max(entry.contentRect.width, 280);
		});

		observer.observe(container);
		return () => observer.disconnect();
	});

	$: yMax = Math.max(max(data, (entry) => entry.value) ?? 0, 1);
	$: xScale = scaleBand(
		data.map((entry) => entry.label),
		[margin.left, width - margin.right],
	).padding(0.26);
	$: yScale = scaleLinear(
		[0, yMax * 1.1],
		[height - margin.bottom, margin.top],
	).nice();
	$: yTicks = yScale.ticks(4);
	$: labelStride = Math.max(1, Math.ceil(data.length / 6));
</script>

<div
	class="card-surface min-w-0 overflow-hidden grid gap-4 p-5"
	bind:this={container}
>
	<div class="grid gap-1">
		<h3 class="text-2xl text-ink">{title}</h3>
		{#if subtitle}
			<p class="text-sm leading-6 text-ink-soft">{subtitle}</p>
		{/if}
	</div>

	{#if data.length === 0}
		<p class="text-sm text-ink-soft">
			No data inside the current filter window.
		</p>
	{:else}
		<svg
			{width}
			{height}
			aria-label={title}
			role="img"
			class="block overflow-visible"
		>
			{#each yTicks as tick}
				<line
					x1={margin.left}
					x2={width - margin.right}
					y1={yScale(tick)}
					y2={yScale(tick)}
					stroke="var(--chart-grid)"
					stroke-dasharray="3 6"
				/>
				<text
					x={margin.left - 10}
					y={yScale(tick) + 4}
					fill="var(--chart-axis)"
					font-size="11"
					text-anchor="end"
				>
					{formatCount(tick)}
				</text>
			{/each}

			{#each data as datum}
				<rect
					x={xScale(datum.label) ?? 0}
					y={yScale(datum.value)}
					width={xScale.bandwidth()}
					height={height - margin.bottom - yScale(datum.value)}
					fill={accent}
					rx="10"
				>
					<title>{`${datum.label} · ${formatCount(datum.value)} orders`}</title>
				</rect>
			{/each}

			{#each data as datum, index}
				{#if index % labelStride === 0}
					<text
						x={(xScale(datum.label) ?? 0) + xScale.bandwidth() / 2}
						y={height - 16}
						fill="var(--chart-axis)"
						font-size="11"
						text-anchor="middle"
						transform={`rotate(-18 ${(xScale(datum.label) ?? 0) + xScale.bandwidth() / 2} ${height - 16})`}
					>
						{datum.label}
					</text>
				{/if}
			{/each}
		</svg>
	{/if}
</div>
