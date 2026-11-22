<script lang="ts">
	import { ChevronDown, FileDiff } from 'lucide-svelte';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * TraceRow — the shadcn Trace's collapsible line in GitHub's file-diff
	 * header's dress (the owner's reference, 2026-11-22): the chevron LEFT
	 * (the collapse affordance), the icon chip, the mono title, the
	 * +/- stats in the description's slot, the row = the trigger, the
	 * content = the detail. The independent $bindable open — no shared
	 * state, no forced accordion. The sticky trigger: inside the page's
	 * scroll region the header pins while the body scrolls past.
	 */
	let {
		title,
		description,
		open = $bindable(false),
		children
	}: {
		title: string;
		description?: string;
		open?: boolean;
		children?: Snippet;
	} = $props();
</script>

<Collapsible.Root bind:open>
	<Collapsible.Trigger
		class="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border/60 bg-muted px-3 py-2 text-left transition-colors hover:bg-muted/70"
	>
		<ChevronDown
			class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {open
				? ''
				: '-rotate-90'}"
			aria-hidden="true"
		/>
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
	</Collapsible.Trigger>
	<Collapsible.Content class="data-[state=closed]:hidden">
		{@render children?.()}
	</Collapsible.Content>
</Collapsible.Root>
