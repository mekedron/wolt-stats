<script lang="ts">
	export let eyebrow = '';
	export let title = '';
	export let value = '';
	export let detail = '';
</script>

<article class="card-surface min-w-0 overflow-hidden grid gap-2 p-4">
	{#if eyebrow}
		<p class="eyebrow">{eyebrow}</p>
	{/if}
	<h3 class="break-words text-base text-ink">{title}</h3>
	<p
		class="break-words text-[clamp(1.05rem,2vw,1.95rem)] font-bold leading-[1.05] text-ink"
	>
		{value}
	</p>
	{#if detail}
		<p class="break-words text-sm leading-6 text-ink-soft">{detail}</p>
	{/if}
</article>
