<script lang="ts">
	import { CircleCheck, CircleAlert, TriangleAlert, X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { dismissFlash, flashState } from '#lib/flash.svelte.ts';

	/**
	 * THE SNACKBAR v2 (the flash round, 2026-11-22): the shadcn Alert's
	 * anatomy as a floating card — the circled leading icon, the bold
	 * title, the muted description lines, the dismiss — bottom-RIGHT
	 * (the owner's spec), ~360px, easily visible. The danger kind is
	 * sticky (an error must not dissolve while unread); the actionable
	 * kinds carry their in-card button (the save conflict's diff door).
	 * ONE instance, mounted in the app layout.
	 */
	const f = $derived(flashState.current);
</script>

{#if f}
	<div
		class="fixed right-6 bottom-6 z-50 w-[22rem] max-w-[calc(100vw-3rem)]"
		transition:fly={{ x: 24, duration: 200 }}
	>
		<div
			role={f.kind === 'danger' ? 'alert' : 'status'}
			class="flex items-start gap-3 rounded-xl border bg-card p-4 pr-2 shadow-sm {f.kind ===
			'danger'
				? 'border-danger/50'
				: f.kind === 'warn'
					? 'border-accent'
					: 'border-border'}"
		>
			<div class="pt-0.5">
				{#if f.kind === 'danger'}
					<TriangleAlert class="size-4.5 text-danger" aria-hidden="true" />
				{:else if f.kind === 'warn'}
					<CircleAlert class="size-4.5 text-accent-amber" aria-hidden="true" />
				{:else}
					<CircleCheck class="size-4.5 text-brand" aria-hidden="true" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-medium text-foreground">{f.title}</p>
				{#if f.description}
					<p class="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
				{/if}
				{#if f.action}
					<button
						type="button"
						class="mt-2 rounded-md border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
						onclick={() => {
							dismissFlash();
							f.action?.run();
						}}
					>
						{f.action.label}
					</button>
				{/if}
			</div>
			<button
				type="button"
				onclick={dismissFlash}
				aria-label="Dismiss notification"
				class="rounded p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground"
			>
				<X class="size-4" />
			</button>
		</div>
	</div>
{/if}
