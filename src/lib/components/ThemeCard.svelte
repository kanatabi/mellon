<script lang="ts">
	// ONE theme card (the theming round, 2026-11-23): name + dual mini-panes
	// (light | dark) so the picker answers "what will this look like" BEFORE
	// the click. The panes are REAL mockups painted with the theme's own
	// tokens — the card carries the theme's swatch values as INLINE custom
	// properties, so the house utility classes (bg-card, text-foreground,
	// bg-brand…) resolve inside its scope. No CSS duplication, no iframe.
	// aria-pressed buttons in a labeled group: every card stays tabbable
	// (a radio group without arrow-key roving would be broken AT).
	import type { Snippet } from 'svelte';
	import { Check } from 'lucide-svelte';
	import type { ThemeDef } from '#lib/theme-registry.ts';
	import ThemePane from '#lib/components/ThemePane.svelte';
	import type { ThemeMode } from '#lib/theme.ts';

	interface Props {
		theme: ThemeDef;
		selected: boolean;
		onSelect: () => void;
		/** Custom themes' manage row (copy/rename/delete) — the built-ins
		 *  render none. The actions belong to the PAGE, not this card. */
		actions?: Snippet;
	}

	let { theme, selected, onSelect, actions }: Props = $props();
</script>

<button
	type="button"
	aria-pressed={selected}
	aria-label="Theme {theme.name}"
	onclick={onSelect}
	class="flex w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors {selected
		? 'border-brand ring-1 ring-brand'
		: 'border-border hover:border-brand/50'}"
>
	<span class="flex items-center justify-between gap-2">
		<span
			class="truncate font-mono text-xs {selected ? 'text-foreground' : 'text-muted-foreground'}"
		>
			{theme.name}
		</span>
		<span class="flex shrink-0 items-center gap-1">
			{#if selected}
				<Check class="size-3.5 text-brand" aria-hidden="true" />
			{/if}
			{@render actions?.()}
		</span>
	</span>
	<!-- the panes render the theme's OWN modes, STACKED full card width
	     (4-up grid: side-by-side dual panes can't breathe) — the shared
	     ThemePane paints the complete inventory -->
	<span class="flex flex-col gap-1.5">
		{#each theme.modes as mode (mode)}
			<span class="flex flex-col gap-1">
				<span class="font-mono text-[10px] text-muted-foreground/60">{mode}</span>
				<span class="overflow-hidden rounded-lg border border-border">
					<ThemePane tokens={theme.preview[mode] ?? {}} />
				</span>
			</span>
		{/each}
	</span>
</button>
