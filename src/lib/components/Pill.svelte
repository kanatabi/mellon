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

<!-- Vendored house pill (earendil kit): rounded-full bordered mono chip. -->
<button
	type="button"
	{onclick}
	{disabled}
	aria-pressed={disabled ? undefined : active ? 'true' : 'false'}
	class="flex w-fit items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs transition-colors disabled:pointer-events-none disabled:opacity-40 {active
		? 'border-brand bg-brand/10 text-foreground'
		: 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'} {cls}"
>
	{@render children()}
</button>
