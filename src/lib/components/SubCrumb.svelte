<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronRight } from 'lucide-svelte';

	/**
	 * The in-page back-crumb (owner call 2026-11-17): breadcrumbs left the
	 * topbar — sub-pages carry their own, ABOVE the title block, naming only
	 * the PARENT (parent pages show none). Grammar follows the photo detail's
	 * original crumb: mono-xs muted, lowercase label, chevron onward. The
	 * editor stops at the chevron (the title below is the current crumb);
	 * pages with no on-canvas title pass their current crumb as children.
	 */
	interface Props {
		href: string;
		label: string;
		/** Optional content after the parent hop — the current crumb, nav furniture. */
		children?: Snippet;
	}

	let { href, label, children }: Props = $props();
</script>

<nav
	class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
	aria-label="Breadcrumb"
>
	<a {href} class="transition-colors hover:text-foreground">{label}</a>
	<ChevronRight class="size-3" aria-hidden="true" />
	{#if children}
		{@render children()}
	{/if}
</nav>
