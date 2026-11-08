<script lang="ts">
	import './layout.css';
	import { syncThemeFromServer } from '#lib/theme-state.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Seed the runtime store from the server-resolved cookie value; the
	// pre-paint inline script below applies it BEFORE first paint (no flash).
	$effect(() => syncThemeFromServer(data.theme));
</script>

<svelte:head>
	<!-- Apply persisted theme before paint to avoid a flash of the wrong theme. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- data.theme is a server-validated 'light'|'dark' literal -->
	{@html `<script>document.documentElement.dataset.theme="${data.theme}"</script>`}
</svelte:head>

<div class="flex min-h-svh flex-col bg-background text-foreground">
	{@render children()}
</div>
