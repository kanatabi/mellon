<script lang="ts">
	// The MODE control (within the current theme), extracted verbatim from
	// the Settings page (2026-11-16): one segmented grammar shared by
	// Settings and the account menu — never two diverging copies. Renders
	// only the modes the CURRENT theme ships (dark-only themes show one
	// indicator — the theming round's mode-aware step). Reads/writes the
	// global theme state directly; no props by design. The THEME picker
	// is the grouped grid beside this, not this control.
	import { Moon, Sun } from 'lucide-svelte';
	import { setMode, themeState } from '#lib/theme-state.svelte.ts';
	import { modesOf } from '#lib/theme-registry.ts';

	const modes = $derived(modesOf(themeState.theme));
</script>

<div
	class="flex w-fit shrink-0 rounded-lg border border-border bg-muted p-0.5"
	role="radiogroup"
	aria-label="Mode"
>
	{#each modes as m (m)}
		<button
			type="button"
			role="radio"
			aria-checked={themeState.mode === m}
			onclick={() => setMode(m)}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors {themeState.mode ===
			m
				? 'bg-card text-foreground ring-1 ring-border'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			{#if m === 'dark'}
				<Moon class="size-3.5" />
			{:else}
				<Sun class="size-3.5" />
			{/if}
			{m === 'dark' ? 'Dark' : 'Light'}
		</button>
	{/each}
</div>
