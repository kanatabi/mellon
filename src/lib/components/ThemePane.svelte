<script lang="ts">
	/**
	 * The theme pane — ONE shared miniature (2026-11-23): the complete
	 * token inventory painted from the given tokens (chrome bar, card with
	 * ink lines + verbs + input, muted strip, the accent hover row, the
	 * marker list rows, the diff bars). The theme card's dual panes and
	 * the editor's big preview are the SAME component — the card used to
	 * show 8 tokens while the editor showed 16, two truths. Generic
	 * anatomy, never named pages (the copy rule). Paints itself via INLINE
	 * custom properties — unset keys would inherit the worn theme and lie.
	 */
	interface Props {
		/** One mode's token values (the registry preview's shape). */
		tokens: Record<string, string>;
	}

	let { tokens }: Props = $props();

	const style = $derived(
		Object.entries(tokens)
			.map(([k, v]) => `--${k}: ${v}`)
			.join('; ')
	);
</script>

<div class="flex flex-col gap-2" {style}>
	<!-- chrome bar: chrome surface, brand mark, ink line, slate/blue dots -->
	<div class="flex items-center gap-1.5 rounded-lg bg-chrome px-2.5 py-2">
		<span class="size-2 rounded-full bg-brand"></span>
		<span class="h-1.5 w-10 rounded-full bg-foreground/30"></span>
		<span class="ml-auto flex items-center gap-1">
			<span class="size-2 rounded-full bg-accent-slate/70"></span>
			<span class="size-2 rounded-full bg-accent-blue/70"></span>
		</span>
	</div>
	<!-- the card: border, title + body ink, the verb pair, an input on
	     background, the muted strip -->
	<div class="rounded-lg border border-border bg-card p-3">
		<span class="block h-2 w-1/2 rounded-full bg-foreground/70"></span>
		<span class="mt-2 block h-1.5 w-5/6 rounded-full bg-foreground/35"></span>
		<span class="mt-1.5 block h-1.5 w-2/3 rounded-full bg-muted-foreground/40"></span>
		<div class="mt-3 flex items-center gap-2">
			<span class="rounded-sm bg-brand px-2.5 py-1 text-[9px] font-medium text-primary-foreground"
				>action</span
			>
			<span class="rounded-sm bg-danger/10 px-2 py-1 text-[9px] text-danger">danger</span>
			<span class="ml-auto h-5 w-20 rounded-md border border-border bg-background"></span>
		</div>
		<div class="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
			<span class="size-2 rounded-full bg-accent-amber"></span>
			<span class="h-1.5 flex-1 rounded-full bg-muted-foreground/30"></span>
		</div>
	</div>
	<!-- the hover wash row: --accent with a blue marker riding it -->
	<div class="flex items-center gap-2 rounded-lg bg-accent px-2.5 py-2">
		<span class="size-2.5 rounded-full bg-accent-blue"></span>
		<span class="h-1.5 w-2/3 rounded-full bg-foreground/40"></span>
	</div>
	<!-- the marker list rows: teal · amber · slate on the canvas -->
	<div class="flex flex-col gap-1.5 px-1">
		{#each ['accent-teal', 'accent-amber', 'accent-slate'] as hue (hue)}
			<div class="flex items-center gap-2">
				<span class="size-2.5 shrink-0 rounded-full bg-{hue}"></span>
				<span class="h-1.5 w-3/4 rounded-full bg-foreground/25"></span>
			</div>
		{/each}
	</div>
	<!-- the diff tints -->
	<div class="flex flex-col gap-1 rounded-lg border border-border p-2">
		<span class="h-2 w-11/12 rounded-full bg-diff-add/30"></span>
		<span class="h-2 w-3/4 rounded-full bg-diff-del/30"></span>
	</div>
</div>
