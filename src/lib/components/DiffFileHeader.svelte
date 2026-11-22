<script lang="ts">
	import { ChevronDown, FileDiff } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * DiffFileHeader — the GitHub file-header, ONE row over ONE body (the
	 * owner's reference, 2026-11-22): the chevron LEFT (the collapse
	 * affordance, only when the caller binds `open`), the FileDiff icon
	 * chip, the mono identity, and at the right edge the COLORED stats
	 * (+adds in the diff-add green, −dels in the diff-del red) with the
	 * muted note after them. The `actions` snippet rides the right edge —
	 * the reserved slot for the future's controls (the unified inline
	 * view's toggle room).
	 *
	 * Built mode-agnostic ON PURPOSE: it serves the mobile Changed-only
	 * view today and the unified inline diff tomorrow — one header over
	 * one body. The split view's two-cell arrangement stays its own thing
	 * (the cells sit over their panes; migrating them onto this component
	 * is a deliberate step when the unified mode lands).
	 */
	interface Props {
		/** The identity — what this diff IS ('pending', a file path…). */
		title: string;
		/** The colored counts; absent = no stats rendered. */
		stats?: { adds: number; dels: number };
		/** The muted note after the stats ('forked from rev N'). */
		note?: string;
		/** Bind to collapse the body the header fronts; unbound = no chevron. */
		open?: boolean;
		/** The right-edge action slots (after the note). */
		actions?: Snippet;
	}

	let { title, stats, note, open = $bindable(undefined), actions }: Props = $props();

	const collapsible = $derived(open !== undefined);
</script>

<div class="flex items-center gap-2 border-b border-border/60 bg-muted px-3 py-2">
	{#if collapsible}
		<button
			type="button"
			class="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
			aria-expanded={open ?? false}
			aria-label={open ? 'Collapse diff' : 'Expand diff'}
			onclick={() => (open = !open)}
		>
			<ChevronDown class="size-3.5 transition-transform duration-200 {open ? '' : '-rotate-90'}" />
		</button>
	{/if}
	<span
		class="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-card"
		aria-hidden="true"
	>
		<FileDiff class="size-3 text-muted-foreground" />
	</span>
	<h2 class="min-w-0 truncate font-mono text-[11px] text-foreground">{title}</h2>
	<span class="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
		{#if stats}
			<span class="text-diff-add">+{stats.adds}</span>
			<span class="text-diff-del">−{stats.dels}</span>
		{/if}
		{#if note}
			<span class="truncate font-mono text-[10px] text-muted-foreground/70"
				>{stats ? '· ' : ''}{note}</span
			>
		{/if}
		{@render actions?.()}
	</span>
</div>
