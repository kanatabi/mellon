<script lang="ts">
	// ONE theme card (the theming round, 2026-11-23): name + an IN-CARD
	// variant toggle (the owner call — stacked dual panes made every card
	// a scroll of paired posters) + ONE pane. The pane is a REAL mockup
	// painted with the theme's own tokens — the card carries the theme's
	// preview values through the shared ThemePane's inline custom
	// properties, so the house utility classes (bg-card, text-foreground,
	// bg-brand…) resolve inside its scope. No CSS duplication, no iframe.
	// aria-pressed buttons in a labeled group: every card stays tabbable
	// (a radio group without arrow-key roving would be broken AT).
	// The variant toggle is a PREVIEW LENS, local to the card — the
	// header's segmented is the worn-mode control; this one never writes
	// the cookie. Default = the mode being worn, clamped to the theme's
	// own modes.
	import type { Snippet } from 'svelte';
	import { Check } from 'lucide-svelte';
	import type { ThemeDef } from '#lib/theme-registry.ts';
	import ThemePane from '#lib/components/ThemePane.svelte';
	import type { ThemeMode } from '#lib/theme.ts';

	interface Props {
		theme: ThemeDef;
		selected: boolean;
		/** The worn mode — the variant lens opens on it (clamped). */
		wornMode: ThemeMode;
		onSelect: () => void;
		/** Custom themes' manage row (copy/rename/delete) — the built-ins
		 *  render none. The actions belong to the PAGE, not this card. */
		actions?: Snippet;
	}

	let { theme, selected, wornMode, onSelect, actions }: Props = $props();

	// the card remounts per open; the worn mode IS the honest seed for the
	// preview lens
	// svelte-ignore state_referenced_locally
	let variant = $state<ThemeMode>(theme.modes.includes(wornMode) ? wornMode : theme.modes[0]);
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
			<!-- the variant lens: one mini segmented in the card's own header
			     row; single-mode themes render a plain indicator -->
			{#if theme.modes.length === 2}
				<span
					class="flex rounded-md border border-border bg-muted p-0.5"
					role="radiogroup"
					aria-label="{theme.name} variant"
				>
					{#each theme.modes as m (m)}
						<span
							class="rounded-sm px-1.5 py-0.5 font-mono text-[10px] transition-colors {variant === m
								? 'bg-card text-foreground ring-1 ring-border'
								: 'text-muted-foreground hover:text-foreground'}"
							role="radio"
							aria-checked={variant === m}
							tabindex="0"
							onclick={(e) => {
								e.stopPropagation();
								variant = m as ThemeMode;
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									variant = m as ThemeMode;
								}
							}}
						>
							{m === 'dark' ? 'Dark' : 'Light'}
						</span>
					{/each}
				</span>
			{:else}
				<span class="font-mono text-[10px] text-muted-foreground/50">
					{variant === 'dark' ? 'dark only' : 'light only'}
				</span>
			{/if}
			{#if selected}
				<Check class="size-3.5 text-brand" aria-hidden="true" />
			{/if}
			{@render actions?.()}
		</span>
	</span>
	<span class="overflow-hidden rounded-lg border border-border">
		<ThemePane tokens={theme.preview[variant] ?? {}} />
	</span>
</button>
