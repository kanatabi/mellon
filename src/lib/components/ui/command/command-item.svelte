<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		// the house item (SHADCN-PLAN 4.3): mono-xs rows, the accent wash is
		// the roving highlight, hover softens — the registry's auto-check
		// glyph dropped (the house multi idiom draws its own square)
		'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs outline-hidden transition-colors select-none hover:bg-accent/60 data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-accent data-selected:text-foreground',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</CommandPrimitive.Item>
