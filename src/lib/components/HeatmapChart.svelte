<script lang="ts">
	import { max, scaleLinear } from 'd3';

	import type { AppliedTheme } from '$lib/theme';
	import type { HeatCell } from '$lib/types';
	import { formatCount } from '$lib/utils/format';

	export let data: HeatCell[] = [];
	export let subtitle = '';
	export let theme: AppliedTheme = 'light';
	export let title = '';

	const hours = Array.from({ length: 24 }, (_, index) => index);
	const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	$: maxValue = Math.max(max(data, (cell) => cell.value) ?? 0, 1);
	$: color = scaleLinear<string>()
		.domain([0, 1])
		.range(theme === 'dark' ? ['#002636', '#57bfe4'] : ['#f5fbfe', '#009de0']);
	$: cells = weekdays.flatMap((weekday, weekdayIndex) =>
		hours.map((hour) => {
			const entry = data.find(
				(cell) => cell.weekday === weekdayIndex && cell.hour === hour,
			);
			const value = entry?.value ?? 0;
			return {
				color: color(value / maxValue),
				hour,
				value,
				weekday,
			};
		}),
	);
</script>

<section class="card-surface min-w-0 overflow-hidden grid gap-4 p-5">
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
		<div
			class="grid items-center gap-1"
			role="img"
			aria-label={title}
			style="grid-template-columns: 52px repeat(24, minmax(0, 1fr));"
		>
			<div></div>
			{#each hours as hour}
				<div class="text-center text-[0.72rem] text-ink-soft">{hour}</div>
			{/each}

			{#each weekdays as weekday}
				<div class="text-left text-[0.72rem] text-ink-soft">{weekday}</div>
				{#each cells.filter((cell) => cell.weekday === weekday) as cell}
					<div
						class="flex aspect-square items-center justify-center rounded-xl text-[0.68rem] font-bold max-[720px]:text-transparent"
						style={`background:${cell.color};color:var(--heatmap-cell-text);`}
						title={`${weekday}, ${String(cell.hour).padStart(2, '0')}:00 · ${formatCount(cell.value)} orders`}
					>
						<span>{cell.value > 0 ? formatCount(cell.value) : ''}</span>
					</div>
				{/each}
			{/each}
		</div>
	{/if}
</section>
