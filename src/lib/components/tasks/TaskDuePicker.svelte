<script lang="ts">
	import { CalendarDays, ChevronRight } from 'lucide-svelte';
	import {
		getLocalTimeZone,
		parseDate,
		today as intlToday,
		type DateValue
	} from '@internationalized/date';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import Calendar from '#lib/components/ui/calendar/calendar.svelte';
	import Button from '#lib/components/ui/button/button.svelte';

	/**
	 * The task due-date door — the DatePicker's anatomy with a task-shaped
	 * label and a clear verb. The value on the wire is a date-only ISO string
	 * (`yyyy-mm-dd`); the parent owns the conversion to the due INSTANT (a
	 * due day is the end of that local day).
	 */
	interface Props {
		value: string;
		onchange: (value: string) => void;
		/** Accessible name; defaults to the field's own "Due date". */
		label?: string;
		disabled?: boolean;
	}

	let { value, onchange, label = 'Due date', disabled = false }: Props = $props();

	let open = $state(false);
	let selected: DateValue | undefined = $state();

	// Re-parse whenever the wire value moves under us (a drawer refresh
	// after another mutation must not keep a stale picker cursor).
	$effect(() => {
		try {
			selected = value ? parseDate(value) : undefined;
		} catch {
			selected = undefined;
		}
	});

	function commit(d: DateValue | undefined) {
		if (!d) return;
		onchange(d.toString()); // CalendarDate.toString() = 'yyyy-mm-dd'
		open = false;
	}

	function pickToday() {
		commit(intlToday(getLocalTimeZone()));
	}

	function clear() {
		onchange('');
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		aria-label={label}
		class="group flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left transition-colors hover:border-muted-foreground focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
	>
		<CalendarDays class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
		<span
			class="min-w-0 grow truncate font-mono text-xs {value
				? 'text-foreground'
				: 'text-muted-foreground'}"
		>
			{value || 'no due date'}
		</span>
		<ChevronRight
			class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90"
			aria-hidden="true"
		/>
	</Popover.Trigger>

	<Popover.Content
		align="start"
		sideOffset={8}
		class="w-64 rounded-lg border border-border bg-card shadow-xl"
	>
		<Calendar
			type="single"
			bind:value={selected as never}
			onValueChange={(d) => commit(d as DateValue)}
			locale="en-GB"
			captionLayout="label"
			class="bg-transparent p-0"
		/>
		<div class="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
			<Button type="button" variant="soft" class="font-mono text-[11px]" onclick={pickToday}>
				Today
			</Button>
			{#if value}
				<Button type="button" variant="soft" class="font-mono text-[11px]" onclick={clear}>
					Clear
				</Button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
