<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import ChevronDownIcon from 'lucide-svelte/icons/chevron-down';
	import { cn, type WithoutChild } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: 'sm' | 'default';
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		// SHADCN-PLAN 4.2: the house trigger — the hand-rolled Select's
		// anatomy (rounded-md card field, mono text, brand ring on focus),
		// py-driven heights, the chevron muted. `min-w-0` + the value
		// truncation pin the CLOSED label: a long project name ellipsizes
		// instead of wrapping the trigger to two lines (2026-11-27).
		'flex w-fit min-w-0 items-center justify-between rounded-md border border-border bg-card transition-colors outline-none select-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger data-placeholder:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:truncate',
		size === 'sm' ? 'gap-1.5 px-2 py-1 font-mono text-xs' : 'gap-2 px-3 py-2 font-mono text-sm',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
</SelectPrimitive.Trigger>
