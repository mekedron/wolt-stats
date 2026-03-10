<script lang="ts">
	import { line as d3Line, max, scaleLinear, scaleUtc } from 'd3';
	import { onMount } from 'svelte';

	import {
		formatCount,
		formatMoney,
		formatMonthLabel,
		formatPercent,
	} from '$lib/utils/format';

	export let colors: string[] = [
		'var(--chart-accent-5)',
		'var(--chart-accent-1)',
		'var(--chart-accent-2)',
	];
	export let currency = 'EUR';
	export let data: Array<{ label: string; series: string; value: number }> = [];
	export let format: 'count' | 'currency' | 'percent' = 'count';
	export let granularity: 'day' | 'month' = 'day';
	export let subtitle = '';
	export let title = '';

	type ChartPoint = {
		date: Date;
		label: string;
		series: string;
		value: number;
	};

	type TooltipEntry = {
		color: string;
		point: ChartPoint;
		series: string;
	};

	const height = 280;
	const margin = { bottom: 34, left: 50, right: 14, top: 16 };
	let container: HTMLDivElement;
	let width = 480;
	let activeLabel: string | null = null;

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
	$: yTicks = yScale.ticks(4);
	$: xTicks = xScale.ticks(
		Math.min(6, Math.max(2, Math.floor(innerWidth / 100))),
	);
	$: groupedSeries = buildGroupedSeries(points);
	$: colorBySeries = new Map(
		groupedSeries.map((series, index) => [
			series.key,
			colors[index % colors.length],
		]),
	);
	$: hoverPoints = buildHoverPoints(points);
	$: activeEntries = activeLabel
		? groupedSeries.reduce<TooltipEntry[]>((entries, series) => {
				const point = series.rows.find((row) => row.label === activeLabel);
				if (!point) {
					return entries;
				}

				entries.push({
					color: colorBySeries.get(series.key) ?? colors[0],
					point,
					series: series.key,
				});
				return entries;
			}, [])
		: [];
	$: activeDate = activeEntries[0]?.point.date ?? null;
	$: tooltipLeft = activeDate
		? clampValue(xScale(activeDate), 100, width - 100)
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

	function buildGroupedSeries(rows: ChartPoint[]) {
		const grouped = new Map<string, typeof rows>();

		for (const row of rows) {
			const next = grouped.get(row.series) ?? [];
			next.push(row);
			grouped.set(row.series, next);
		}

		return [...grouped.entries()].map(([key, value]) => ({
			key,
			rows: value,
		}));
	}

	function buildHoverPoints(rows: ChartPoint[]) {
		const deduped = new Map<string, { date: Date; label: string }>();

		for (const row of rows) {
			if (!deduped.has(row.label)) {
				deduped.set(row.label, {
					date: row.date,
					label: row.label,
				});
			}
		}

		return [...deduped.values()].sort(
			(left, right) => left.date.getTime() - right.date.getTime(),
		);
	}

	function clampValue(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function handlePointerMove(event: PointerEvent) {
		if (hoverPoints.length === 0) {
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

		activeLabel = hoverPoints.reduce((nearest, point) =>
			Math.abs(xScale(point.date) - localX) <
			Math.abs(xScale(nearest.date) - localX)
				? point
				: nearest,
		).label;
	}

	function clearHover() {
		activeLabel = null;
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

	{#if groupedSeries.length === 0}
		<p class="text-sm text-ink-soft">
			No data inside the current filter window.
		</p>
	{:else}
		<div class="flex flex-wrap gap-3">
			{#each groupedSeries as series}
				<div class="flex items-center gap-2 text-sm text-ink-soft">
					<span
						class="inline-flex size-3 rounded-full"
						style={`background:${colorBySeries.get(series.key)}`}
					></span>
					<span>{series.key}</span>
				</div>
			{/each}
		</div>

		<div class="relative">
			{#if activeDate}
				<div
					class="pointer-events-none absolute left-0 top-2 z-10 min-w-[12rem] rounded-[0.95rem] border border-ink/10 bg-white/96 px-3 py-2 shadow-[var(--shadow-card)]"
					style={`left:${tooltipLeft}px; transform:translateX(-50%);`}
				>
					<p
						class="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-accent-deep"
					>
						{formatTick(activeDate)}
					</p>
					<div class="mt-1 grid gap-1.5">
						{#each activeEntries as entry}
							<div class="flex items-center justify-between gap-4 text-sm">
								<span class="flex items-center gap-2 text-ink-soft">
									<span
										class="inline-flex size-2.5 rounded-full"
										style={`background:${entry.color}`}
									></span>
									{entry.series}
								</span>
								<strong class="text-ink">
									{formatValue(entry.point.value)}
								</strong>
							</div>
						{/each}
					</div>
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
						{formatValue(tick)}
					</text>
				{/each}

				{#if activeDate}
					<line
						x1={xScale(activeDate)}
						x2={xScale(activeDate)}
						y1={margin.top}
						y2={height - margin.bottom}
						stroke="var(--color-accent-deep)"
						stroke-dasharray="4 6"
						stroke-opacity="0.25"
					/>
				{/if}

				{#each groupedSeries as series}
					<path
						d={d3Line<(typeof series.rows)[number]>()
							.x((point) => xScale(point.date))
							.y((point) => yScale(point.value))(series.rows) ?? ''}
						fill="none"
						stroke={colorBySeries.get(series.key)}
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="3"
					/>

					{#each series.rows as point}
						<circle
							cx={xScale(point.date)}
							cy={yScale(point.value)}
							fill={colorBySeries.get(series.key)}
							r={activeLabel === point.label
								? 5
								: series.rows.length <= 32
									? 3
									: 2}
							stroke={activeLabel === point.label ? 'white' : 'none'}
							stroke-width="2"
						/>
					{/each}
				{/each}

				{#each xTicks as tick}
					<text
						x={xScale(tick)}
						y={height - 10}
						fill="var(--chart-axis)"
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
