<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';
	import * as Select from '#lib/components/ui/select/index.js';

	// SHADCN-PLAN 4.1: native <select> removed — same as the month picker;
	// the primitive provides the year range's items, the block's Select is
	// the themed interaction layer. `value` is the year number.
	let {
		ref = $bindable(null),
		class: className,
		value,
		onValueChange,
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.YearSelectProps> & {
		onValueChange?: (year: number) => void;
	} = $props();
</script>

<CalendarPrimitive.YearSelect bind:ref {...restProps}>
	{#snippet child({ yearItems, selectedYearItem })}
		<Select.Root
			type="single"
			items={yearItems.map((y) => ({ value: String(y.value), label: y.label }))}
			value={String(value ?? selectedYearItem?.value ?? '')}
			onValueChange={(y) => onValueChange?.(Number(y))}
		>
			<Select.Trigger
				aria-label="Year"
				class={cn('h-(--cell-size) gap-1 px-2 text-sm font-medium', className)}
			>
				<Select.Value />
			</Select.Trigger>
			<Select.Content class="min-w-[6.5rem]">
				{#each yearItems as y (y.value)}
					<Select.Item value={String(y.value)} label={y.label} />
				{/each}
			</Select.Content>
		</Select.Root>
	{/snippet}
</CalendarPrimitive.YearSelect>
