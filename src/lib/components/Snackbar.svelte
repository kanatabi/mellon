<script lang="ts">
	import { CircleCheck, TriangleAlert, X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { dismissFlash, flashState } from '#lib/flash.svelte.ts';

	/**
	 * THE SNACKBAR (the flash round, 2026-11-22): the portal's momentary
	 * notifications wear the shadcn Alert's anatomy — the bordered card, the
	 * leading icon, the one-line text, the default/destructive variants —
	 * floating at the bottom, auto-dismissed by the flash module. ONE
	 * instance, mounted in the app layout.
	 */
	const f = $derived(flashState.current);
</script>

{#if f}
	<div
		class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
		transition:fly={{ y: 16, duration: 200 }}
	>
		<div
			role={f.kind === 'danger' ? 'alert' : 'status'}
			class="flex items-center gap-2.5 rounded-lg border bg-card py-2 pr-1.5 pl-3 shadow-sm {f.kind ===
			'danger'
				? 'border-danger/50'
				: 'border-border'}"
		>
			{#if f.kind === 'danger'}
				<TriangleAlert class="size-4 shrink-0 text-danger" aria-hidden="true" />
			{:else}
				<CircleCheck class="size-4 shrink-0 text-brand" aria-hidden="true" />
			{/if}
			<p class="text-sm text-foreground">{f.text}</p>
			<button
				type="button"
				onclick={dismissFlash}
				aria-label="Dismiss notification"
				class="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
			>
				<X class="size-3.5" />
			</button>
		</div>
	</div>
{/if}
