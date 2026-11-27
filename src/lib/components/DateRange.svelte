<script lang="ts">
	import { CalendarDays, ChevronRight } from 'lucide-svelte';
	import {
		getLocalTimeZone,
		parseDate,
		today as intlToday,
		type DateValue
	} from '@internationalized/date';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import RangeCalendar from '#lib/components/ui/range-calendar/range-calendar.svelte';
	import Pill from '#lib/components/Pill.svelte';

	interface Props {
		from?: string;
		to?: string;
		/** Emits the inclusive YYYY-MM-DD window; undefined means unbounded. */
		onchange: (from: string | undefined, to: string | undefined) => void;
	}

	let { from, to, onchange }: Props = $props();

	// SHADCN-PLAN 4.5: the hand-built two-pick grid died — the block's
	// range calendar owns the grid, the two-click flow, and keyboard roving.
	// The CONTRACT is unchanged (ISO window in, (from, to) out), presets and
	// the summary trigger stay house furniture. The grid only draws; the
	// shorthand parsing stays in date-expr.ts (the plan's boundary).
	let open = $state(false);
	let range: { start: DateValue | undefined; end: DateValue | undefined } | undefined =
		$state(undefined);

	function safe(iso: string): DateValue | undefined {
		try {
			return parseDate(iso);
		} catch {
			return undefined; // a bad wire string = the placeholder state, no crash
		}
	}

	// re-seed from the wire: complete windows sync the grid, "no window"
	// clears it; a HALF window is the echo of an in-progress pick (the URL
	// navigated mid-selection) — the grid keeps its state, like the old
	// component's seed-once cursor did.
	$effect(() => {
		if (from && to) range = { start: safe(from), end: safe(to) };
		else if (!from && !to) range = undefined;
	});

	// Compact for the rail: ISO window, year printed once when unambiguous.
	const summary = $derived(
		from && to
			? from.slice(0, 4) === to.slice(0, 4)
				? `${from} → ${to.slice(5)}`
				: `${from} → ${to}`
			: from
				? `≥ ${from}`
				: to
					? `≤ ${to}`
					: 'any date'
	);

	const tz = getLocalTimeZone();
	function presetDays(days: number) {
		const end = intlToday(tz);
		const start = end.subtract({ days: days - 1 }); // the inclusive window
		return { from: start.toString(), to: end.toString() };
	}

	const presets = [7, 30, 90];
	function presetActive(days: number) {
		const p = presetDays(days);
		return from === p.from && to === p.to;
	}

	function setPreset(days: number) {
		const p = presetDays(days);
		range = { start: safe(p.from), end: safe(p.to) };
		onchange(p.from, p.to);
	}

	function clearAll() {
		range = undefined;
		onchange(undefined, undefined);
	}

	function commit(next: { start: DateValue | undefined; end: DateValue | undefined } | undefined) {
		range = next;
		// the two-click flow emits the half window mid-selection (the old
		// pick() did the same: first click = from-only, unbounded other side)
		onchange(next?.start?.toString(), next?.end?.toString());
	}
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex flex-wrap gap-1.5">
		{#each presets as days (days)}
			<Pill
				active={presetActive(days)}
				onclick={() => setPreset(days)}
				class="!px-2.5 !py-0.5 !text-[11px]"
			>
				{days}d
			</Pill>
		{/each}
		<Pill active={!from && !to} onclick={clearAll} class="!px-2.5 !py-0.5 !text-[11px]">All</Pill>
	</div>

	<Popover.Root bind:open>
		<Popover.Trigger
			aria-label="Choose a date range"
			class="group flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent/40"
		>
			<CalendarDays class="size-4 shrink-0 text-muted-foreground" />
			<span
				class="min-w-0 grow truncate text-left font-mono text-xs {from || to
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{summary}
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
			<RangeCalendar
				bind:value={range as never}
				onValueChange={commit}
				locale="en-GB"
				class="bg-transparent p-0"
			/>
		</Popover.Content>
	</Popover.Root>
</div>
