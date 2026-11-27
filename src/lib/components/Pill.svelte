<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Toggle semantics: renders aria-pressed and the violet active skin. */
		active?: boolean;
		onclick: () => void;
		disabled?: boolean;
		class?: string;
		children: Snippet;
	}

	let { active = false, onclick, disabled = false, class: cls = '', children }: Props = $props();
</script>

<!-- Vendored house chip (earendil kit): 6px bordered mono tag. The 2026-11-27
     Linear round retired the full-round pill — filters and actions are
     rectangles now; only avatars/count badges stay circular. -->
<button
	type="button"
	{onclick}
	{disabled}
	aria-pressed={disabled ? undefined : active ? 'true' : 'false'}
	class="flex w-fit items-center gap-2 rounded-md border px-3 py-1 font-mono text-xs transition-colors disabled:pointer-events-none disabled:opacity-40 {active
		? 'border-brand bg-brand/10 text-foreground'
		: 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'} {cls}"
>
	{@render children()}
</button>
