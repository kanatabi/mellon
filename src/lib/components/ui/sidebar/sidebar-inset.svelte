<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<!-- A2 (SHADCN.md §3.5): the block's `md:peer-data-[variant=inset]:*` chain
     (m-2/ml-0/rounded-xl/shadow-sm) is replaced by mellon's content-box
     doctrine line verbatim — flush top/left at lg, the edge on x/bottom, NO
     shadow (the border is the edge; a shadow would make the box an overlay,
     D9). `min-h-0` + `overflow-y-auto`: the box stays the ONE scroll
     container of the h-svh frame, so sticky children keep working. -->
<main
	bind:this={ref}
	data-slot="sidebar-inset"
	class={cn(
		'relative mx-3 mb-3 flex min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-lg border border-border bg-background px-4 py-6 sm:px-6 lg:ml-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</main>
