<script lang="ts">
	import './layout.css';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Intentionally seed from the server-rendered cookie value; client toggles own the state afterwards.
	// svelte-ignore state_referenced_locally
	let theme = $state(data.theme);

	function toggleTheme() {
		const next = theme === 'dark' ? 'light' : 'dark';
		const apply = () => {
			theme = next;
			document.documentElement.dataset.theme = next;
			document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=strict`;
		};
		// Palette swap via View Transitions (UA cross-fade; instant where unsupported).
		if (document.startViewTransition) document.startViewTransition(apply);
		else apply();
	}
</script>

<svelte:head>
	<!-- Apply persisted theme before paint to avoid a flash of the wrong theme. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- data.theme is a server-validated 'light'|'dark' literal -->
	{@html `<script>document.documentElement.dataset.theme="${data.theme}"</script>`}
</svelte:head>

<div class="flex min-h-svh flex-col bg-background text-foreground">
	{@render children()}
	<footer class="flex items-center justify-between gap-4 px-6 py-5 text-xs text-muted-foreground">
		<span
			>mellon · private portal — access by port-forward, never by URL<span class="text-brand"
				>;</span
			></span
		>
		<ThemeToggle {theme} onToggle={toggleTheme} />
	</footer>
</div>
