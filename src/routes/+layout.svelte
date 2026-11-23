<script lang="ts">
	import './layout.css';
	import { syncThemeFromServer, setTheme } from '#lib/theme-state.svelte.ts';
	import { getCustomTheme, initCustomThemes } from '#lib/custom-themes.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The custom themes' store loads at client init — BEFORE any effect —
	// so the grid, the palette and the ghost-cookie fallback all see the
	// same list (the pre-paint script reads the same keys synchronously).
	initCustomThemes();

	// Seed the runtime store from the server-resolved cookie pair; the
	// pre-paint inline script below applies it BEFORE first paint (no flash).
	// A cookie naming a custom theme this browser doesn't HAVE is a ghost:
	// fall back to the portal and rewrite the cookie so it stays gone. The
	// fallback must NOT call setTheme here — this effect already writes
	// themeState (syncThemeFromServer), and setTheme READS it: the self-loop
	// rule (an effect that reads state it writes re-triggers forever). The
	// minimal inline write keeps the loop impossible.
	$effect(() => {
		const pair = data.theme;
		if (pair.theme.startsWith('custom-') && !getCustomTheme(pair.theme)) {
			document.documentElement.dataset.theme = 'portal';
			document.documentElement.dataset.mode = pair.mode;
			document.cookie = `theme=portal-${pair.mode}; path=/; max-age=31536000; samesite=strict`;
			syncThemeFromServer({ theme: 'portal', mode: pair.mode });
			return;
		}
		syncThemeFromServer(pair);
	});
</script>

<svelte:head>
	<!-- Apply the persisted theme pair before paint to avoid a flash of the wrong theme. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- both values are server-validated allowlist literals (resolveThemePair) -->
	{@html `<script>var d=document.documentElement;d.dataset.theme="${data.theme.theme}";d.dataset.mode="${data.theme.mode}";if(d.dataset.theme.indexOf("custom-")===0){try{var b=JSON.parse(localStorage.getItem("mellon.theme.custom."+d.dataset.theme.slice(7))||"null");if(b&&b.tokens&&b.tokens[d.dataset.mode]){for(var k in b.tokens[d.dataset.mode])d.style.setProperty("--"+k,b.tokens[d.dataset.mode][k])}else{d.dataset.theme="portal"}}catch{d.dataset.theme="portal"}}</script>`}
</svelte:head>

<div class="flex min-h-svh flex-col bg-background text-foreground">
	{@render children()}
</div>
