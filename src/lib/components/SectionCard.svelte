<script lang="ts">
	import type { Snippet } from 'svelte';

	type IconCmp = typeof import('lucide-svelte').Send;
	import { GripVertical, PanelRightClose } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	/**
	 * One labeled pane of a config sidebar: expanded card, or the vertical
	 * pill when collapsed (icon atop, label in true vertical writing-mode —
	 * the collapsed-rail vocabulary, at section granularity). Movable panes
	 * carry a grip, answer Alt+↑/↓, and accept drag drops with a visible
	 * insertion line; the pinned pane refuses all of it structurally.
	 */
	let {
		id,
		label,
		icon: Icon,
		open,
		pinned = false,
		dirty = false,
		order = 0,
		ontoggle,
		onmove,
		ondrop,
		children
	}: {
		id: string;
		label: string;
		icon?: IconCmp;
		open: boolean;
		pinned?: boolean;
		dirty?: boolean;
		order?: number;
		ontoggle: () => void;
		onmove?: (dir: -1 | 1) => void;
		ondrop?: (dragId: string, after: boolean) => void;
		children: Snippet;
	} = $props();

	let dropEdge = $state<'' | 'top' | 'bottom'>('');

	function keydown(e: KeyboardEvent) {
		if (!e.altKey || pinned || !onmove) return;
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			onmove(-1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			onmove(1);
		}
	}

	function dragstart(e: DragEvent) {
		if (pinned) return;
		e.dataTransfer?.setData('text/mellon-pane', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function dragover(e: DragEvent) {
		if (pinned || !ondrop) return;
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropEdge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
	}

	function drop(e: DragEvent) {
		if (pinned || !ondrop) return;
		e.preventDefault();
		const dragId = e.dataTransfer?.getData('text/mellon-pane') ?? '';
		ondrop(dragId, dropEdge === 'bottom');
		dropEdge = '';
	}

	const rootClass = 'group relative outline-none focus-visible:ring-2 focus-visible:ring-brand/40';
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
	<article
		role="group"
		data-pane={id}
		draggable={!pinned}
		tabindex={pinned ? undefined : 0}
		onkeydown={keydown}
		ondragstart={dragstart}
		ondragover={dragover}
		ondragleave={() => (dropEdge = '')}
		ondrop={drop}
		transition:slide={{ duration: 180 }}
		style="order:{order}"
		class="{rootClass} flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4"
		aria-label="{label} section{pinned ? '' : ' — Alt+arrows to move, drag to reorder'}"
	>
		{#if dropEdge === 'top'}
			<span
				class="pointer-events-none absolute inset-x-2 -top-1.5 h-0.5 rounded bg-brand"
				aria-hidden="true"
			></span>
		{:else if dropEdge === 'bottom'}
			<span
				class="pointer-events-none absolute inset-x-2 -bottom-1.5 h-0.5 rounded bg-brand"
				aria-hidden="true"
			></span>
		{/if}

		<header class="-mx-1 flex items-center justify-between">
			<div class="flex items-center gap-1.5">
				{#if !pinned}
					<GripVertical
						class="size-3.5 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
						aria-hidden="true"
					/>
				{/if}
				<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
					{label}
				</p>
			</div>
			<button
				type="button"
				onclick={ontoggle}
				aria-label="Collapse {label}"
				class="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
			>
				<PanelRightClose class="size-3.5" />
			</button>
		</header>

		<div class="flex flex-col gap-2.5">{@render children()}</div>
	</article>
{:else}
	<button
		type="button"
		draggable={!pinned}
		onclick={ontoggle}
		onkeydown={keydown}
		ondragstart={dragstart}
		ondragover={dragover}
		ondragleave={() => (dropEdge = '')}
		ondrop={drop}
		transition:slide={{ duration: 180 }}
		style="order:{order}"
		aria-label="Expand {label}{pinned ? '' : ' — Alt+arrows to move'}"
		data-pane={id}
		class="{rootClass} flex w-fit flex-col items-center gap-2 self-start rounded-lg border border-border bg-card px-1.5 py-2.5 hover:border-muted-foreground/40"
	>
		{#if dropEdge === 'top'}
			<span
				class="pointer-events-none absolute inset-x-1 -top-1.5 h-0.5 rounded bg-brand"
				aria-hidden="true"
			></span>
		{:else if dropEdge === 'bottom'}
			<span
				class="pointer-events-none absolute inset-x-1 -bottom-1.5 h-0.5 rounded bg-brand"
				aria-hidden="true"
			></span>
		{/if}
		{#if dirty}
			<span class="size-1.5 rounded-full bg-accent-amber" aria-label="unsaved changes"></span>
		{/if}
		{#if !pinned}
			<GripVertical class="size-3 text-muted-foreground/30" aria-hidden="true" />
		{/if}
		{#if Icon}
			<Icon class="size-4 text-muted-foreground" aria-hidden="true" />
		{/if}
		<span
			class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase [writing-mode:vertical-rl]"
		>
			{label}
		</span>
	</button>
{/if}
