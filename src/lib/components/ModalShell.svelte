<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	export let title = 'Detail view';

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	let dialog: HTMLDivElement | null = null;
	let previousBodyOverflow = '';

	function requestClose() {
		dispatch('close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			return;
		}

		event.preventDefault();
		requestClose();
	}

	onMount(() => {
		previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialog?.focus();

		return () => {
			document.body.style.overflow = previousBodyOverflow;
		};
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div
	class="fixed inset-0 z-[90] bg-ink/42 px-3 py-4 backdrop-blur-[6px] sm:px-5 sm:py-6"
>
	<button
		aria-label="Close detail view"
		class="absolute inset-0 border-0 bg-transparent p-0"
		type="button"
		on:click={requestClose}
	></button>

	<div
		bind:this={dialog}
		aria-label={title}
		aria-modal="true"
		class="relative z-10 mx-auto flex h-full w-full max-w-[min(74rem,100%)] flex-col outline-none"
		role="dialog"
		tabindex="-1"
	>
		<button
			aria-label="Close detail view"
			class="absolute right-4 top-4 z-10 inline-flex size-11 items-center justify-center rounded-full border border-white/42 bg-white/90 text-2xl leading-none text-ink shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)] transition hover:-translate-y-0.5 hover:bg-white"
			type="button"
			on:click={requestClose}
		>
			<span aria-hidden="true">×</span>
		</button>

		<div class="min-h-0 overflow-y-auto pr-0 sm:pr-1">
			<slot />
		</div>
	</div>
</div>
