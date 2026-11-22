<script lang="ts">
	import { ChevronRight, FileDiff } from 'lucide-svelte';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * TraceRow — the shadcn Trace's collapsible line, ported to the kit
	 * (the base registry's Trace = React/TSX; the ANATOMY ports one-to-one
	 * onto the vendored bits-ui Collapsible, owner round 2026-11-22).
	 *
	 * One line: the leading icon, the title (a sentence that says what the
	 * row IS), the optional muted description, the chevron as the state
	 * indicator. The row = the trigger; the content = the detail. Used by
	 * the diff page's mobile full view (the saved/pending documents as two
	 * trace rows), where the scroll lives INSIDE the open body — the
	 * header never leaves the viewport.
	 */
	let {
		title,
		description,
		open = false,
		onOpenChange,
		children
	}: {
		title: string;
		description?: string;
		open?: boolean;
		onOpenChange?: (v: boolean) => void;
		children?: Snippet;
	} = $props();
</script>

<Collapsible.Root {open} {onOpenChange}>
	<Collapsible.Trigger
		class="flex w-full items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50"
	>
		<span
			class="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-card"
			aria-hidden="true"
		>
			<FileDiff class="size-3 text-muted-foreground" />
		</span>
		<span class="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{title}</span>
		{#if description}
			<span class="shrink-0 font-mono text-[10px] text-muted-foreground/70">{description}</span>
		{/if}
		<ChevronRight
			class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {open
				? 'rotate-90'
				: ''}"
			aria-hidden="true"
		/>
	</Collapsible.Trigger>
	<Collapsible.Content class="data-[state=closed]:hidden">
		<div class="min-h-0 overflow-y-auto overscroll-contain">
			{@render children?.()}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
