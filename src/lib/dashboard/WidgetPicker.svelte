<script lang="ts">
	import { X } from 'lucide-svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { widgetHeld, type WidgetDef } from './widgets/registry.ts';

	/**
	 * The widget PICKER — the "Add Widget" side panel (the tray's
	 * replacement, Round D). Rows carry a STATIC preview (the widget's
	 * icon + description over skeleton bars — the real body NEVER mounts
	 * here, so opening the panel fires zero relay calls), a checkbox per
	 * row (multi-select), and a footer that commits the whole selection
	 * in one action. Placed widgets show badged and inert — deletion
	 * lives on the canvas card, not here. Esc/backdrop/X dismiss.
	 */
	interface Props {
		registry: WidgetDef[];
		/** The currently placed ids (from the store). */
		placedIds: string[];
		held: (scope?: string) => boolean;
		open: boolean;
		onAdd: (ids: string[]) => void;
		onClose: () => void;
	}

	let { registry, placedIds, held, open, onAdd, onClose }: Props = $props();

	let selected = $state<string[]>([]);

	const available = $derived(registry.filter((w) => widgetHeld(w, held)));
	const unplaced = $derived(available.filter((w) => !placedIds.includes(w.id)));

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
	}

	function commit() {
		if (selected.length === 0) return;
		onAdd([...selected]); // selection order = placement order
		selected = [];
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) onClose();
	}
</script>

<svelte:window onkeydown={keydown} />

{#if open}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-40 bg-background/70"
		aria-hidden="true"
		onclick={onClose}
	></div>
	<div
		transition:fly={{ x: 420, duration: 220, easing: cubicOut, opacity: 1 }}
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card"
		role="dialog"
		aria-modal="true"
		aria-label="Add widgets to the dashboard"
	>
		<header class="flex items-center justify-between gap-3 border-b border-border p-4">
			<div>
				<h2 class="font-brand text-lg font-semibold">Add widgets</h2>
				<p class="font-mono text-[10px] text-muted-foreground/70">
					select one or many · they land at the first free slot
				</p>
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label="Close the widget panel"
				class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<X class="size-4" />
			</button>
		</header>

		<div class="flex-1 overflow-y-auto p-4">
			{#if available.length === 0}
				<p
					class="rounded-lg border border-border bg-background p-4 text-center font-mono text-xs text-muted-foreground"
				>
					your account has no widget access yet — ask an administrator for scopes
				</p>
			{:else}
				<ul class="flex flex-col gap-3" role="list">
					{#each available as w (w.id)}
						{@const isPlaced = placedIds.includes(w.id)}
						<li>
							<button
								type="button"
								disabled={isPlaced}
								aria-pressed={!isPlaced && selected.includes(w.id)}
								aria-label="{w.title} widget row"
								onclick={() => !isPlaced && toggle(w.id)}
								class="w-full rounded-lg border text-left transition-colors {isPlaced
									? 'cursor-default border-border bg-muted/30 opacity-70'
									: selected.includes(w.id)
										? 'border-brand bg-brand/5'
										: 'border-border hover:border-brand/50'}"
							>
								<!-- the STATIC preview: the card shell's look with the
								     widget's icon over skeleton bars — zero fetches -->
								<div class="flex items-center gap-2 border-b border-border/60 px-3 py-2">
									{#if w.icon}
										<w.icon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
									{/if}
									<p
										class="truncate text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
									>
										{w.title}
									</p>
									{#if isPlaced}
										<span
											class="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
										>
											on the dashboard
										</span>
									{:else}
										<span
											class="ml-auto size-4 shrink-0 rounded-sm border {selected.includes(w.id)
												? 'border-brand bg-brand'
												: 'border-muted-foreground/40'}"
											aria-hidden="true"
										></span>
									{/if}
								</div>
								<!-- the STATIC-STRUCTURE preview: the REAL body in
								     preview mode — the user sees the shape they'll
								     get, with placeholder content and ZERO relay
								     calls (bodies never fetch in preview mode) -->
								<div class="pointer-events-none overflow-hidden p-2" aria-hidden="true">
									<w.body preview={true} />
								</div>
								<p class="px-3 pb-3 font-mono text-[10px] text-muted-foreground/70">
									{w.description}
									{#if w.scope || w.scopes?.length}
										· needs {(w.scope ? [w.scope] : (w.scopes ?? [])).join(' · ')}
									{/if}
								</p>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if unplaced.length > 0}
			<footer class="flex items-center justify-between gap-3 border-t border-border p-4">
				<p class="font-mono text-[10px] text-muted-foreground/70">
					{selected.length}
					of {unplaced.length} selected
				</p>
				<button
					type="button"
					disabled={selected.length === 0}
					onclick={commit}
					class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Add {selected.length === 0 ? '' : selected.length}
					widget{selected.length === 1 ? '' : 's'}
				</button>
			</footer>
		{/if}
	</div>
{/if}
