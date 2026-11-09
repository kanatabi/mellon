<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown, GripVertical } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/**
	 * One labeled pane of a config sidebar — a single shell that never leaves
	 * the layout: the body slides open/closed IN PLACE (vertical accordion,
	 * owner call after the pill and edge-tab experiments), the chevron points
	 * where it will go. Reorder is handled by the container's `reorderable`
	 * action (FLIP lift + ghost slot); this component only declares itself
	 * draggable (movable panes) and answers Alt+arrows for keyboard parity.
	 */
	type IconCmp = typeof import('lucide-svelte').Send;

	let {
		id,
		label,
		icon: Icon,
		open,
		pinned = false,
		dirty = false,
		order = 0,
		reorderable = true,
		ontoggle,
		onmove,
		children
	}: {
		id: string;
		label: string;
		icon?: IconCmp;
		open: boolean;
		pinned?: boolean;
		dirty?: boolean;
		order?: number;
		reorderable?: boolean;
		ontoggle: () => void;
		onmove?: (dir: -1 | 1) => void;
		children?: Snippet;
	} = $props();

	function keydown(e: KeyboardEvent) {
		if (!e.altKey || pinned || !reorderable || !onmove) return;
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			onmove(-1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			onmove(1);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<article
	role="group"
	data-pane={id}
	draggable={!pinned && reorderable}
	tabindex={pinned || !reorderable ? undefined : 0}
	onkeydown={keydown}
	style="order:{order}"
	class="group flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
	aria-label="{label} section{pinned || !reorderable
		? ''
		: ' — Alt+arrows to move, drag to reorder'}"
>
	<header class="-mx-1 flex items-center justify-between">
		<div class="flex items-center gap-1.5">
			{#if !pinned && reorderable}
				<GripVertical
					class="size-3.5 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
					aria-hidden="true"
				/>
			{/if}
			{#if Icon}
				<Icon class="size-3.5 text-muted-foreground/70" aria-hidden="true" />
			{/if}
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{label}</p>
			{#if dirty && !open}
				<span class="size-1.5 rounded-full bg-accent-amber" aria-label="unsaved changes"></span>
			{/if}
		</div>
		<button
			type="button"
			onclick={ontoggle}
			aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
			class="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground"
		>
			<ChevronDown class={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
		</button>
	</header>

	{#if open}
		<div class="flex flex-col gap-2.5" transition:slide={{ duration: 220, easing: cubicOut }}>
			{@render children?.()}
		</div>
	{/if}
</article>
