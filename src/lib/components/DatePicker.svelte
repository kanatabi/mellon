<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		value: string;
		onchange: (iso: string) => void;
	}

	let { value, onchange }: Props = $props();

	let open = $state(false);
	let pop = $state('');
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let cursor = $state<Date | null>(null);

	// Vendored from earendil's rail/DateRange calendar (owner call 2026-11-08:
	// "the stock native picker is not ours") — single-pick shape. Monday-first
	// grid, brand-filled endpoints, non-modal: Esc/outside-click close.
	const iso = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	const today = () => iso(new SvelteDate());

	function toggleOpen() {
		open = !open;
		if (open) {
			const r = trigger?.getBoundingClientRect();
			if (r) {
				// Fixed anchor: the editor rail clips overflow (curtain), so the
				// panel positions off the trigger rect — DOM child nonetheless.
				pop = `position:fixed; top:${r.bottom + 8}px; right:${Math.max(12, window.innerWidth - r.right)}px;`;
			}
			if (!cursor) {
				const [y, m] = (value || today()).split('-').map(Number);
				cursor = new SvelteDate(y, m - 1, 1);
			}
		}
		if (!open) trigger?.focus();
	}

	function pick(dayIso: string) {
		onchange(dayIso);
		toggleOpen();
	}

	const monthTitle = $derived(
		cursor?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) ?? ''
	);

	const cells = $derived.by(() => {
		if (!cursor) return [];
		const y = cursor.getFullYear();
		const m = cursor.getMonth();
		const lead = (new SvelteDate(y, m, 1).getDay() + 6) % 7; // Monday-first
		const count = new SvelteDate(y, m + 1, 0).getDate();
		const out: (string | null)[] = Array.from({ length: lead }, () => null);
		for (let d = 1; d <= count; d++) {
			out.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
		}
		return out;
	});

	function shiftMonth(delta: number) {
		if (!cursor) return;
		cursor = new SvelteDate(cursor.getFullYear(), cursor.getMonth() + delta, 1);
	}

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') toggleOpen();
		};
		const onDown = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) toggleOpen();
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onDown);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onDown);
		};
	});
</script>

<div class="relative" bind:this={root}>
	<button
		type="button"
		onclick={toggleOpen}
		aria-expanded={open}
		aria-haspopup="dialog"
		aria-label="Choose publish date"
		class="flex w-full items-center gap-2.5 rounded-full border border-transparent px-3 py-1.5 text-sm transition-colors hover:border-border focus-visible:border-brand"
		bind:this={trigger}
	>
		<CalendarDays class="size-4 shrink-0 text-muted-foreground" />
		<span
			class="min-w-0 grow truncate text-left font-mono text-xs {value
				? 'text-foreground'
				: 'text-muted-foreground'}">{value || 'pick a date'}</span
		>
		<ChevronRight
			class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {open
				? 'rotate-90'
				: ''}"
		/>
	</button>

	{#if open && cursor}
		<div
			role="dialog"
			aria-label="Choose a date"
			transition:fly={{ y: 6, duration: 160 }}
			style={pop}
			class="z-30 mt-2 w-64 rounded-xl border border-border bg-card p-4 shadow-lg"
		>
			<div class="mb-2 flex items-center justify-between">
				<button
					type="button"
					onclick={() => shiftMonth(-1)}
					aria-label="Previous month"
					class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ChevronLeft class="size-4" />
				</button>
				<p class="font-brand text-lg leading-none font-semibold tracking-tight">{monthTitle}</p>
				<button
					type="button"
					onclick={() => shiftMonth(1)}
					aria-label="Next month"
					class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ChevronRight class="size-4" />
				</button>
			</div>
			<div class="grid grid-cols-7 gap-1">
				{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as wd, i (i)}
					<span
						class="flex h-6 items-center justify-center font-mono text-[10px] text-muted-foreground/60"
						>{wd}</span
					>
				{/each}
				{#each cells as day, i (i)}
					{#if day === null}
						<span></span>
					{:else}
						{@const [y, m, d] = day.split('-').map(Number)}
						<button
							type="button"
							onclick={() => pick(day)}
							aria-pressed={day === value}
							aria-label={new SvelteDate(y, m - 1, d).toLocaleDateString('en-US', {
								weekday: 'short',
								month: 'short',
								day: 'numeric',
								year: 'numeric'
							})}
							class="flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors {day ===
							value
								? 'bg-brand font-semibold text-white'
								: day === today()
									? 'border border-border text-foreground hover:bg-accent'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						>
							{d}
						</button>
					{/if}
				{/each}
			</div>
			<div class="mt-3 border-t border-border pt-2" transition:fade={{ duration: 120 }}>
				<button
					type="button"
					onclick={() => pick(today())}
					class="w-full rounded-md py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					today
				</button>
			</div>
		</div>
	{/if}
</div>
