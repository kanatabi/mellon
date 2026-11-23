<script lang="ts">
	// ONE theme card (the theming round, 2026-11-23): name + dual mini-panes
	// (light | dark) so the picker answers "what will this look like" BEFORE
	// the click. The panes are REAL mockups painted with the theme's own
	// tokens — the card carries the theme's swatch values as INLINE custom
	// properties, so the house utility classes (bg-card, text-foreground,
	// bg-brand…) resolve inside its scope. No CSS duplication, no iframe.
	// aria-pressed buttons in a labeled group: every card stays tabbable
	// (a radio group without arrow-key roving would be broken AT).
	import { Check } from 'lucide-svelte';
	import { PREVIEW_TOKENS, type ThemeDef } from '#lib/theme-registry.ts';
	import type { ThemeMode } from '#lib/theme.ts';

	interface Props {
		theme: ThemeDef;
		selected: boolean;
		onSelect: () => void;
	}

	let { theme, selected, onSelect }: Props = $props();

	/** The theme's token values as inline custom properties — the pane's
	 *  scoping seam. */
	const paneVars = (mode: ThemeMode) =>
		PREVIEW_TOKENS.map((k) => `--${k}: ${theme.preview[mode][k] ?? 'transparent'}`).join('; ');
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
		{#if selected}
			<Check class="size-3.5 shrink-0 text-brand" aria-hidden="true" />
		{/if}
	</span>
	<span class="grid grid-cols-2 gap-1.5">
		{#each ['light', 'dark'] as mode (mode)}
			<span
				class="flex flex-col gap-1 rounded-md bg-background p-1.5"
				style={paneVars(mode as ThemeMode)}
			>
				<!-- the mini mock: card on background, text line, the three voices -->
				<span class="flex flex-col gap-1 rounded border border-border bg-card p-1.5">
					<span class="h-1.5 w-3/4 rounded-full bg-foreground/70"></span>
					<span class="h-1.5 w-1/2 rounded-full bg-muted-foreground/40"></span>
					<span class="mt-0.5 flex items-center gap-1">
						<span class="h-2 w-4 rounded-full bg-brand"></span>
						<span class="size-1.5 rounded-full bg-danger"></span>
						<span class="size-1.5 rounded-full bg-accent-amber"></span>
					</span>
				</span>
			</span>
		{/each}
	</span>
</button>
