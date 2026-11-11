<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { ApiError } from '#lib/api/client.ts';

	export interface ComboboxRow {
		name: string;
		count?: number;
	}

	interface Props {
		items: ComboboxRow[];
		/** multi = tag-style toggling; single = collection-style replace + close. */
		multiple: boolean;
		/** Always an array; single mode carries 0 or 1 (keeps the types honest). */
		selected: string[];
		onchange: (next: string[]) => void;
		/** Trigger text when nothing is selected. */
		emptyLabel: string;
		/** Provide to enable eager creation (tags & collections both do; the
		 *  vocabulary is created the moment it is chosen — saves never guess). */
		create?: (name: string) => Promise<ComboboxRow>;
		/** Single mode: a row that clears the selection (e.g. "uncategorized"). */
		noneLabel?: string;
	}

	let { items, multiple, selected, onchange, emptyLabel, create, noneLabel }: Props = $props();

	// Generalized TagPicker (owner call 2026-11-08): one combobox truth for
	// tags (multi) and collections (single). Search, roving arrow keys, eager
	// create row, fixed-anchored popover (rails clip their overflow).
	let open = $state(false);
	let q = $state('');
	let active = $state(0);
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let input = $state<HTMLInputElement | undefined>();
	let pop = $state('');
	let busy = $state(false);
	let err = $state('');
	// Locally created entries ride until the next server load folds them in.
	let created = $state<ComboboxRow[]>([]);

	const all = $derived([...items, ...created]);
	const norm = $derived(q.trim().toLowerCase());
	const canCreate = $derived(
		!!create && norm.length > 0 && !all.some((t) => t.name === norm.replace(/\s+/g, '-'))
	);

	type Row = { kind: 'none' | 'create' | 'item'; name: string; count?: number };
	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		if (noneLabel && !norm) out.push({ kind: 'none', name: '' });
		if (canCreate) out.push({ kind: 'create', name: norm.replace(/\s+/g, '-') });
		for (const t of all)
			if (!norm || t.name.includes(norm)) out.push({ kind: 'item', name: t.name, count: t.count });
		return out;
	});

	const isSelected = (name: string) => selected.includes(name);

	// Viewport-fit placement: rails are tall and panes sit LOW, so a panel
	// that always opens downward renders off-screen (owner: "dropdown not
	// showing"). Flip ABOVE — anchored with `bottom` so shorter lists still
	// hug the trigger instead of floating.
	function positionPop() {
		const r = trigger?.getBoundingClientRect();
		if (!r) return;
		const right = `right:${Math.max(12, window.innerWidth - r.right)}px`;
		const need = 310; // search row + max-h-52 list + padding, worst case
		const below = window.innerHeight - r.bottom;
		if (below < need && r.top > below) {
			pop = `position:fixed; bottom:${window.innerHeight - r.top + 6}px; ${right}`;
		} else {
			pop = `position:fixed; top:${r.bottom + 6}px; ${right}`;
		}
	}

	function toggleOpen() {
		open = !open;
		if (open) {
			positionPop();
			active = 0;
			err = '';
			queueMicrotask(() => input?.focus());
		} else {
			trigger?.focus();
		}
	}

	function toggle(name: string) {
		const next = isSelected(name) ? selected.filter((t) => t !== name) : [...selected, name];
		onchange(next);
		if (!multiple) toggleOpen(); // single-select commits and closes
	}

	async function doCreate() {
		if (!create || busy) return;
		busy = true;
		err = '';
		try {
			const t = await create(q.trim());
			created = [...created, t];
			q = '';
			if (multiple) onchange([...selected, t.name]);
			else {
				onchange([t.name]);
				toggleOpen();
			}
		} catch (e) {
			err = e instanceof ApiError ? e.message : 'could not create';
		} finally {
			busy = false;
			active = 0;
		}
	}

	function apply(row: Row) {
		if (row.kind === 'none') {
			onchange([]);
			toggleOpen();
		} else if (row.kind === 'create') void doCreate();
		else toggle(row.name);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, rows.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (rows[active]) apply(rows[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			toggleOpen();
		}
	}

	// Outside-click close (the popover is non-modal).
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (root && !root.contains(e.target as Node)) toggleOpen();
		};
		window.addEventListener('pointerdown', onDown);
		return () => window.removeEventListener('pointerdown', onDown);
	});
</script>

<div class="relative flex flex-col gap-1.5" bind:this={root}>
	<button
		type="button"
		onclick={toggleOpen}
		aria-expanded={open}
		aria-haspopup="listbox"
		bind:this={trigger}
		class="flex w-full items-center justify-between gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
	>
		<span class="min-w-0 truncate">
			{selected.length ? (multiple ? `${selected.length} selected` : selected[0]) : emptyLabel}
		</span>
		<Search class="size-3.5 shrink-0" />
	</button>

	{#if multiple && selected.length}
		<!-- Selected chips (house grammar), removable by keyboard — multi mode
		     only; single mode shows its value on the trigger itself. -->
		<div class="flex flex-wrap gap-1.5">
			{#each selected as t (t)}
				<span
					class="flex items-center gap-1 rounded-full border border-brand bg-brand/10 py-0.5 pr-1 pl-2.5 font-mono text-[11px] text-foreground"
				>
					{t}
					<button
						type="button"
						onclick={() => toggle(t)}
						aria-label="Remove {t}"
						class="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-danger"
					>
						<X class="size-3" />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	{#if open}
		<div
			role="dialog"
			aria-label={multiple ? 'Choose items' : 'Choose one'}
			transition:fly={{ y: 6, duration: 150 }}
			style={pop}
			class="z-30 w-64 rounded-xl border border-border bg-card p-3 shadow-lg"
		>
			<input
				type="text"
				bind:value={q}
				oninput={() => (active = 0)}
				onkeydown={onKey}
				placeholder={create ? 'search or create…' : 'search…'}
				aria-label="Search"
				aria-controls="combobox-list"
				autocomplete="off"
				class="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
			/>
			{#if err}
				<p class="mt-2 font-mono text-[10px] text-danger" role="alert">{err}</p>
			{/if}
			<ul
				id="combobox-list"
				role="listbox"
				aria-multiselectable={multiple}
				class="mt-2 max-h-52 overflow-y-auto"
			>
				{#each rows as row, i (row.kind + row.name)}
					<li role="option" aria-selected={row.kind === 'item' && isSelected(row.name)}>
						<button
							type="button"
							onclick={() => apply(row)}
							onpointerenter={() => (active = i)}
							disabled={row.kind === 'create' && busy}
							class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors {i ===
							active
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/60'}"
						>
							<span class="flex min-w-0 items-center gap-2 truncate">
								{#if row.kind === 'item' && multiple}
									<span
										class="size-3 shrink-0 rounded border {isSelected(row.name)
											? 'border-brand bg-brand'
											: 'border-border'}"
										aria-hidden="true"
									></span>
								{/if}
								{#if row.kind === 'create'}
									<span class="text-muted-foreground">Create</span>
									<span class="text-brand">“{row.name}”</span>
								{:else if row.kind === 'none'}
									{noneLabel}
								{:else}
									{row.name}
								{/if}
							</span>
							{#if row.count !== undefined}
								<span class="shrink-0 text-muted-foreground/60">{row.count}</span>
							{/if}
						</button>
					</li>
				{:else}
					<li class="px-2 py-4 text-center font-mono text-[11px] text-muted-foreground/60">
						nothing matches — type to {create ? 'create' : 'search'}
					</li>
				{/each}
			</ul>
			<p class="mt-2 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground/60">
				↑↓ browse · enter pick{#if create}
					· esc close{/if}
			</p>
		</div>
	{/if}
</div>
