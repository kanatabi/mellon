<script lang="ts">
	import { Moon, Sun } from 'lucide-svelte';

	interface Props {
		theme: 'light' | 'dark';
		onToggle: () => void;
	}

	let { theme, onToggle }: Props = $props();
</script>

<button
	type="button"
	class="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted"
	aria-label="Toggle light and dark mode"
	onclick={onToggle}
>
	{#if theme === 'dark'}
		<Moon class="size-4" />
	{:else}
		<Sun class="size-4" />
	{/if}
</button>
