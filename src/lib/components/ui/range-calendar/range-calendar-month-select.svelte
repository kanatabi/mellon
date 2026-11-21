<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';
	import * as Select from '#lib/components/ui/select/index.js';

	// SHADCN-PLAN 4.1: the registry's month picker hid a NATIVE <select> under
	// the styled span — the OS popup leaked into the estate, violating §5.3
	// (the themed-dropdown doctrine: the popup included). The primitive stays
	// as the locale-aware item provider; the interaction layer is the block's
	// Select now. `value` is the month number (1–12); the caption owns the
	// placeholder math (multi-month calendars subtract their index).
	let {
		ref = $bindable(null),
		class: className,
		value,
		onValueChange,
		...restProps
	}: WithoutChildrenOrChild<RangeCalendarPrimitive.MonthSelectProps> & {
		onValueChange?: (month: number) => void;
	} = $props();
</script>

<RangeCalendarPrimitive.MonthSelect bind:ref {...restProps}>
	{#snippet child({ monthItems, selectedMonthItem })}
		<Select.Root
			type="single"
			items={monthItems.map((m) => ({ value: String(m.value), label: m.label }))}
			value={String(value ?? selectedMonthItem?.value ?? '')}
			onValueChange={(m) => onValueChange?.(Number(m))}
		>
			<Select.Trigger
				aria-label="Month"
				class={cn('h-(--cell-size) gap-1 px-2 text-sm font-medium', className)}
			>
				<Select.Value />
			</Select.Trigger>
			<Select.Content class="min-w-[10rem]">
				{#each monthItems as m (m.value)}
					<Select.Item value={String(m.value)} label={m.label} />
				{/each}
			</Select.Content>
		</Select.Root>
	{/snippet}
</RangeCalendarPrimitive.MonthSelect>
