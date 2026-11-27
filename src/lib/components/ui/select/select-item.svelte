<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import CheckIcon from 'lucide-svelte/icons/check';
	import { cn, type WithoutChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	{label}
	data-slot="select-item"
	class={cn(
		// the house item: mono-xs rows, the brand check rides LEFT of the
		// label (the hand-rolled grammar), highlight wash on --accent
		'focus:text-accent-foreground data-highlighted:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-hidden select-none focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0',
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<CheckIcon
			class="size-3.5 shrink-0 {selected ? 'text-brand' : 'opacity-0'}"
			aria-hidden="true"
		/>
		<span class="min-w-0 flex-1 shrink-0 truncate whitespace-nowrap">
			{#if childrenProp}
				{@render childrenProp({ selected, highlighted })}
			{:else}
				{label || value}
			{/if}
		</span>
	{/snippet}
</SelectPrimitive.Item>
