<script lang="ts">
	// The MODE control (Light|Dark within the current theme), extracted
	// verbatim from the Settings page (2026-11-16): one segmented grammar
	// shared by Settings and the account menu — never two diverging copies.
	// Reads/writes the global theme state directly; no props by design.
	// The THEME picker (round 1) is the grid beside this, not this control.
	import { Moon, Sun } from 'lucide-svelte';
	import { setMode, themeState } from '#lib/theme-state.svelte.ts';
</script>

<div
	class="flex w-fit shrink-0 gap-1 rounded-full border border-border bg-card p-1"
	role="radiogroup"
	aria-label="Mode"
>
	<button
		type="button"
		role="radio"
		aria-checked={themeState.mode === 'light'}
		onclick={() => setMode('light')}
		class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {themeState.mode ===
		'light'
			? 'bg-brand/15 text-foreground'
			: 'text-muted-foreground hover:text-foreground'}"
	>
		<Sun class="size-3.5" />
		Light
	</button>
	<button
		type="button"
		role="radio"
		aria-checked={themeState.mode === 'dark'}
		onclick={() => setMode('dark')}
		class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {themeState.mode ===
		'dark'
			? 'bg-brand/15 text-foreground'
			: 'text-muted-foreground hover:text-foreground'}"
	>
		<Moon class="size-3.5" />
		Dark
	</button>
</div>
