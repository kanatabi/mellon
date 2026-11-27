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

	interface Props {
		value: string;
		onchange: (iso: string) => void;
	}

	let { value, onchange }: Props = $props();

	// SHADCN-PLAN 4.4: the hand-built grid (SvelteDate cursor, manual
	// Monday-first lead, manual flip/Esc/outside-click) died — the block's
	// calendar owns the grid, keyboard roving, and placement. The CONTRACT is
	// unchanged (ISO yyyy-mm-dd in, ISO out), so PostEditor's mount did not
	// change. locale=en-GB keeps the Monday-first week the old grid drew.
	let open = $state(false);
	let selected: DateValue | undefined = $state();

	// the wire value re-parses on change (lumen-validated ISO; a bad string
	// just means the placeholder state — no crash)
	$effect(() => {
		try {
			selected = value ? parseDate(value) : undefined;
		} catch {
			selected = undefined;
		}
	});

	function commit(d: DateValue | undefined) {
		if (!d) return;
		onchange(d.toString()); // CalendarDate.toString() = 'yyyy-MM-dd'
		open = false;
	}

	function pickToday() {
		commit(intlToday(getLocalTimeZone()));
	}
</script>

<div class="relative">
	<Popover.Root bind:open>
		<Popover.Trigger
			aria-label="Choose publish date"
			class="group flex w-full items-center gap-2.5 rounded-md border border-transparent px-3 py-1.5 text-sm transition-colors hover:border-border focus-visible:border-brand"
		>
			<CalendarDays class="size-4 shrink-0 text-muted-foreground" />
			<span
				class="min-w-0 grow truncate text-left font-mono text-xs {value
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{value || 'pick a date'}
			</span>
			<ChevronRight
				class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90"
			/>
		</Popover.Trigger>

		<Popover.Content
			align="end"
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
			<div class="mt-2 border-t border-border pt-2">
				<Button
					type="button"
					variant="soft"
					class="w-full justify-center font-mono text-[11px]"
					onclick={pickToday}
				>
					Today
				</Button>
			</div>
		</Popover.Content>
	</Popover.Root>
</div>
