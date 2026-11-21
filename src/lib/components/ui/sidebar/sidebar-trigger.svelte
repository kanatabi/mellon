<script lang="ts">
	import PanelLeftIcon from 'lucide-svelte/icons/panel-left';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { useSidebar } from './context.svelte.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		children,
		...restProps
	}: ComponentProps<typeof Button> & {
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	bind:ref
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn(className)}
	type="button"
	aria-expanded={sidebar.isMobile ? sidebar.openMobile : sidebar.open}
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<!-- A2: a caller may replace the panel-left glyph (mellon's topbar uses the
	     hamburger below lg); the default stays the block's own icon. -->
	{#if children}
		{@render children()}
	{:else}
		<PanelLeftIcon class="cn-rtl-flip" />
	{/if}
	<span class="sr-only">Toggle Sidebar</span>
</Button>
