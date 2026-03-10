<script lang="ts">
	import { line as d3Line, max, scaleLinear, scaleUtc } from 'd3';
	import { onMount } from 'svelte';

	import {
		formatCount,
		formatMoney,
		formatMonthLabel,
		formatPercent,
	} from '$lib/utils/format';

	export let accent = '#009de0';
	export let currency = 'EUR';
	export let data: Array<{ label: string; value: number }> = [];
	export let format: 'count' | 'currency' | 'percent' = 'count';
	export let granularity: 'day' | 'month' = 'day';
	export let subtitle = '';
	export let title = '';

	type ChartPoint = {
		date: Date;
		label: string;
		value: number;
	};

	const height = 250;
	const margin = { bottom: 34, left: 50, right: 14, top: 16 };
	let container: HTMLDivElement;
	let width = 480;
	let activePoint: ChartPoint | null = null;

	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			width = Math.max(entry.contentRect.width, 280);
		});

		observer.observe(container);
		return () => observer.disconnect();
	});

	$: points = data
		.map((point) => ({
			...point,
			date: parseLabel(point.label),
		}))
		.filter((point) => !Number.isNaN(point.date.getTime())) as ChartPoint[];

	$: innerWidth = Math.max(width - margin.left - margin.right, 10);
	$: yMax = Math.max(max(points, (point) => point.value) ?? 0, 1);
	$: xDomain = resolveXDomain(
		points.map((point) => point.date),
		granularity,
	);
	$: xScale = scaleUtc(xDomain, [margin.left, width - margin.right]);
	$: yScale = scaleLinear(
		[0, yMax * 1.08],
		[height - margin.bottom, margin.top],
	).nice();
	$: chartId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'chart';
	$: path = d3Line<(typeof points)[number]>()
		.x((point) => xScale(point.date))
		.y((point) => yScale(point.value))(points);
	$: yTicks = yScale.ticks(4);
	$: xTicks = xScale.ticks(
		Math.min(6, Math.max(2, Math.floor(innerWidth / 100))),
	);
	$: tooltipLeft = activePoint
		? clampValue(xScale(activePoint.date), 72, width - 72)
		: 0;
	$: tooltipTop = activePoint
		? Math.max(10, yScale(activePoint.value) - 62)
		: 0;

	function parseLabel(label: string) {
		return granularity === 'month'
			? new Date(`${label}-01T00:00:00Z`)
			: new Date(`${label}T00:00:00Z`);
	}

	function formatValue(value: number) {
		if (format === 'currency') {
			return formatMoney(value, currency);
		}
		if (format === 'percent') {
			return formatPercent(value);
		}
		return formatCount(value);
	}

	function formatTick(date: Date) {
		if (granularity === 'month') {
			return formatMonthLabel(date.toISOString().slice(0, 7));
		}
		return new Intl.DateTimeFormat(undefined, {
			day: 'numeric',
			month: 'short',
		}).format(date);
	}

	function resolveXDomain(dates: Date[], kind: 'day' | 'month'): [Date, Date] {
		if (dates.length === 0) {
			const today = new Date();
			return [today, today];
		}

		if (dates.length === 1) {
			const start = dates[0];
			const end = new Date(start);
			end.setUTCDate(end.getUTCDate() + (kind === 'month' ? 31 : 1));
			return [start, end];
		}

		return [dates[0], dates[dates.length - 1]];
	}

	function clampValue(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function handlePointerMove(event: PointerEvent) {
		if (points.length === 0) {
			return;
		}

		const bounds = (
			event.currentTarget as SVGSVGElement
		).getBoundingClientRect();
		const localX = clampValue(
			event.clientX - bounds.left,
			margin.left,
			width - margin.right,
		);

		activePoint = points.reduce((nearest, point) =>
			Math.abs(xScale(point.date) - localX) <
			Math.abs(xScale(nearest.date) - localX)
				? point
				: nearest,
		);
	}

	function clearHover() {
		activePoint = null;
	}
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

	{#if points.length === 0}
		<p class="text-sm text-ink-soft">
			No data inside the current filter window.
		</p>
	{:else}
		<div class="relative">
			{#if activePoint}
				<div
					class="pointer-events-none absolute z-10 min-w-[8rem] rounded-[0.95rem] border border-ink/10 bg-white/96 px-3 py-2 shadow-[var(--shadow-card)]"
					style={`left:${tooltipLeft}px; top:${tooltipTop}px; transform:translateX(-50%);`}
				>
					<p
						class="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-accent-deep"
					>
						{formatTick(activePoint.date)}
					</p>
					<p class="text-sm font-semibold text-ink">
						{formatValue(activePoint.value)}
					</p>
				</div>
			{/if}

			<svg
				{width}
				{height}
				aria-label={title}
				role="img"
				class="block overflow-visible"
				on:pointerdown={handlePointerMove}
				on:pointerleave={clearHover}
				on:pointermove={handlePointerMove}
			>
				<defs>
					<linearGradient
						id={`chart-fill-${chartId}`}
						x1="0%"
						x2="0%"
						y1="0%"
						y2="100%"
					>
						<stop offset="0%" stop-color={accent} stop-opacity="0.22" />
						<stop offset="100%" stop-color={accent} stop-opacity="0.02" />
					</linearGradient>
				</defs>

				{#each yTicks as tick}
					<line
						x1={margin.left}
						x2={width - margin.right}
						y1={yScale(tick)}
						y2={yScale(tick)}
						stroke="rgba(32, 33, 37, 0.1)"
						stroke-dasharray="3 6"
					/>
					<text
						x={margin.left - 10}
						y={yScale(tick) + 4}
						fill="rgba(32, 33, 37, 0.76)"
						font-size="11"
						text-anchor="end"
					>
						{formatValue(tick)}
					</text>
				{/each}

				{#if activePoint}
					<line
						x1={xScale(activePoint.date)}
						x2={xScale(activePoint.date)}
						y1={margin.top}
						y2={height - margin.bottom}
						stroke={accent}
						stroke-dasharray="4 6"
						stroke-opacity="0.3"
					/>
				{/if}

				<path
					d={path ?? ''}
					fill="none"
					stroke={accent}
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="3"
				/>

				{#each points as point}
					<circle
						cx={xScale(point.date)}
						cy={yScale(point.value)}
						fill={accent}
						r={activePoint?.label === point.label
							? 5
							: points.length <= 32
								? 3
								: 2}
						stroke={activePoint?.label === point.label ? 'white' : 'none'}
						stroke-width="2"
					/>
				{/each}

				{#each xTicks as tick}
					<text
						x={xScale(tick)}
						y={height - 10}
						fill="rgba(32, 33, 37, 0.78)"
						font-size="11"
						text-anchor="middle"
					>
						{formatTick(tick)}
					</text>
				{/each}
			</svg>
		</div>
	{/if}
</div>
