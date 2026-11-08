<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { ApiError, client } from '#lib/api/client.ts';
	import type { TagCount } from '#lib/api/types.ts';

	interface Props {
		available: TagCount[];
		selected: string[];
		onchange: (tags: string[]) => void;
	}

	let { available, selected, onchange }: Props = $props();

	// Combobox (owner call 2026-11-08): search, multi-select, and eager tag
	// CREATION — "create tag" adds to the vocabulary immediately, then selects
	// it; deferred creation would make the save endpoint guess which names are
	// new. Popover is fixed-anchored (the rail clips its overflow) — the
	// DatePicker trick.
	let open = $state(false);
	let q = $state('');
	let active = $state(0); // index over [createRow?, ...matches]
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let input = $state<HTMLInputElement | undefined>();
	let pop = $state('');
	let busy = $state(false);
	let err = $state('');
	// Locally created tags ride until the next server load folds them in.
	let created = $state<TagCount[]>([]);

	const all = $derived([...available, ...created]);
	const norm = $derived(q.trim().toLowerCase());
	const matches = $derived(all.filter((t) => !norm || t.name.includes(norm)));
	const canCreate = $derived(
		norm.length > 0 && !all.some((t) => t.name === norm.replace(/\s+/g, '-'))
	);
	const options = $derived(canCreate ? matches.length + 1 : matches.length);

	function positionPop() {
		const r = trigger?.getBoundingClientRect();
		if (r)
			pop = `position:fixed; top:${r.bottom + 6}px; right:${Math.max(12, window.innerWidth - r.right)}px;`;
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

	const isSelected = (name: string) => selected.includes(name);

	function toggle(name: string) {
		onchange(isSelected(name) ? selected.filter((t) => t !== name) : [...selected, name]);
	}

	async function create() {
		if (busy) return;
		busy = true;
		err = '';
		try {
			const t = await client.createTag(q.trim());
			created = [...created, t];
			q = '';
			onchange([...selected, t.name]);
		} catch (e) {
			err = e instanceof ApiError ? e.message : 'could not create tag';
		} finally {
			busy = false;
			active = 0;
		}
	}

	/** Enter/click on the active row: create-row 0, then the matches. */
	function applyActive() {
		if (canCreate && active === 0) {
			void create();
			return;
		}
		const t = matches[canCreate ? active - 1 : active];
		if (t) toggle(t.name);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, options - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			applyActive();
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
		<span class="min-w-0 truncate"
			>{selected.length ? `${selected.length} selected` : 'choose tags'}</span
		>
		<Search class="size-3.5 shrink-0" />
	</button>

	<!-- Selected chips (house grammar), removable by keyboard. -->
	{#if selected.length}
		<div class="flex flex-wrap gap-1.5">
			{#each selected as t (t)}
				<span
					class="flex items-center gap-1 rounded-full border border-brand bg-brand/10 py-0.5 pr-1 pl-2.5 font-mono text-[11px] text-foreground"
				>
					{t}
					<button
						type="button"
						onclick={() => toggle(t)}
						aria-label="Remove tag {t}"
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
			aria-label="Choose tags"
			transition:fly={{ y: 6, duration: 150 }}
			style={pop}
			class="z-30 w-64 rounded-xl border border-border bg-card p-3 shadow-lg"
		>
			<input
				type="text"
				bind:value={q}
				oninput={() => (active = 0)}
				onkeydown={onKey}
				placeholder="search or create…"
				aria-label="Search tags"
				aria-controls="tag-list"
				autocomplete="off"
				class="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
			/>
			{#if err}
				<p class="mt-2 font-mono text-[10px] text-danger" role="alert">{err}</p>
			{/if}
			<ul
				id="tag-list"
				role="listbox"
				aria-multiselectable="true"
				class="mt-2 max-h-52 overflow-y-auto"
			>
				{#if canCreate}
					<li role="option" aria-selected={false}>
						<button
							type="button"
							onclick={() => void create()}
							onpointerenter={() => (active = 0)}
							disabled={busy}
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors {active ===
							0
								? 'bg-accent text-foreground'
								: 'text-brand hover:bg-accent/60'} disabled:opacity-40"
						>
							<span class="text-muted-foreground">create</span>
							“{norm.replace(/\s+/g, '-')}”
						</button>
					</li>
				{/if}
				{#each matches as t, i (t.name)}
					{@const idx = canCreate ? i + 1 : i}
					<li role="option" aria-selected={isSelected(t.name)}>
						<button
							type="button"
							onclick={() => toggle(t.name)}
							onpointerenter={() => (active = idx)}
							class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors {active ===
							idx
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/60'}"
						>
							<span class="flex min-w-0 items-center gap-2 truncate">
								<span
									class="size-3 shrink-0 rounded border {isSelected(t.name)
										? 'border-brand bg-brand'
										: 'border-border'}"
									aria-hidden="true"
								></span>
								{t.name}
							</span>
							<span class="shrink-0 text-muted-foreground/60">{t.posts}</span>
						</button>
					</li>
				{:else}
					{#if !canCreate}
						<li class="px-2 py-4 text-center font-mono text-[11px] text-muted-foreground/60">
							nothing matches — type to create
						</li>
					{/if}
				{/each}
			</ul>
			<p class="mt-2 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground/60">
				↑↓ browse · enter select · esc close
			</p>
		</div>
	{/if}
</div>
