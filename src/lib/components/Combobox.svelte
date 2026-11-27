<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { ApiError } from '#lib/api/client.ts';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import Button from '#lib/components/ui/button/button.svelte';

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

	// SHADCN-PLAN 4.3: the 273-line invented state machine (measure-once
	// coordinates, manual roving, manual outside-click) died here — the block
	// owns open state, floating placement, focus, filtering, and roving. The
	// CONTRACT is byte-identical (items/multiple/selected/onchange/emptyLabel/
	// create/noneLabel), so the five mounts did not change at all. The house
	// behaviors that stay ours: single-REPLACE (the 06698b6 lesson), eager
	// create (created on commit, never on keystroke), the none-row, and the
	// removable chips.
	let open = $state(false);
	let q = $state('');
	let busy = $state(false);
	let err = $state('');
	// Locally created entries ride until the next server load folds them in.
	let created = $state<ComboboxRow[]>([]);

	const all = $derived([...items, ...created]);
	const norm = $derived(q.trim().toLowerCase());
	const canCreate = $derived(
		!!create && norm.length > 0 && !all.some((t) => t.name === norm.replace(/\s+/g, '-'))
	);

	const isSelected = (name: string) => selected.includes(name);

	function toggle(name: string) {
		// Single mode REPLACES (the contract above: "collection-style replace +
		// close") — appending leaked the multi idiom: with a pre-populated
		// selection, next was [old, new] and every caller's next[0] kept the
		// OLD name (the changed-collection PATCH silently carried it).
		const next = isSelected(name)
			? selected.filter((t) => t !== name)
			: multiple
				? [...selected, name]
				: [name];
		onchange(next);
		if (!multiple) open = false; // single-select commits and closes
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
				open = false;
			}
		} catch (e) {
			err = e instanceof ApiError ? e.message : 'could not create';
		} finally {
			busy = false;
		}
	}

	function onOpenChange(next: boolean) {
		if (!next) return;
		err = '';
	}
</script>

<div class="relative flex flex-col gap-1.5">
	<Popover.Root bind:open {onOpenChange}>
		<Popover.Trigger
			class="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
		>
			<span class="min-w-0 truncate">
				{selected.length ? (multiple ? `${selected.length} selected` : selected[0]) : emptyLabel}
			</span>
			<Search class="size-3.5 shrink-0" />
		</Popover.Trigger>

		<Popover.Content
			align="end"
			sideOffset={6}
			class="w-64 gap-0 rounded-lg border border-border bg-card p-3 shadow-xl"
		>
			<Command.Root class="bg-transparent p-0 text-xs" loop>
				<Command.Input
					bind:value={q}
					placeholder={create ? 'search or create…' : 'search…'}
					aria-label="Search"
					autocomplete="off"
					class="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand"
				/>
				{#if err}
					<p class="mt-2 font-mono text-[10px] text-danger" role="alert">{err}</p>
				{/if}
				<Command.List class="mt-2 max-h-52 overflow-y-auto">
					<Command.Empty
						class="px-2 py-4 text-center font-mono text-[11px] text-muted-foreground/60"
					>
						nothing matches — type to {create ? 'create' : 'search'}
					</Command.Empty>
					{#if noneLabel && !norm}
						<Command.Item
							value={noneLabel}
							onSelect={() => {
								onchange([]);
								open = false;
							}}
						>
							{noneLabel}
						</Command.Item>
					{/if}
					{#if canCreate}
						<Command.Item
							value={norm.replace(/\s+/g, '-')}
							disabled={busy}
							onSelect={() => void doCreate()}
						>
							<span class="text-muted-foreground">Create</span>
							<span class="text-brand">“{norm.replace(/\s+/g, '-')}”</span>
						</Command.Item>
					{/if}
					{#each all as t (t.name)}
						<Command.Item value={t.name} onSelect={() => toggle(t.name)}>
							<span class="flex min-w-0 items-center gap-2 truncate">
								{#if multiple}
									<span
										class="size-3 shrink-0 rounded border {isSelected(t.name)
											? 'border-brand bg-brand'
											: 'border-border'}"
										aria-hidden="true"
									></span>
								{/if}
								{t.name}
							</span>
							{#if t.count !== undefined}
								<span class="shrink-0 text-muted-foreground/60">{t.count}</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.List>
				<p class="mt-2 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground/60">
					↑↓ browse · enter pick{#if create}
						· esc close{/if}
				</p>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if multiple && selected.length}
		<!-- Selected chips (house grammar), removable by keyboard — multi mode
		     only; single mode shows its value on the trigger itself. -->
		<div class="flex flex-wrap gap-1.5">
			{#each selected as t (t)}
				<span
					class="flex items-center gap-1 rounded-md border border-brand bg-accent py-0.5 pr-1 pl-2.5 font-mono text-[11px] text-foreground"
				>
					{t}
					<Button
						type="button"
						variant="soft"
						class="rounded-full p-0.5"
						onclick={() => toggle(t)}
						aria-label="Remove {t}"
					>
						<X class="size-3" />
					</Button>
				</span>
			{/each}
		</div>
	{/if}
</div>
