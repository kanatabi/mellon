<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { browser } from '$app/env';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ArrowLeft, ChevronDown, Ellipsis, FileDiff, RotateCcw } from 'lucide-svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import DiffFileHeader from '#lib/components/DiffFileHeader.svelte';
	import DiffTable from '#lib/components/DiffTable.svelte';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import { client, errorText } from '#lib/api/client.ts';
	import type { PostDetailAdmin } from '#lib/api/types.ts';
	import { localStoragePostEditStore, type PendingEdit } from '#lib/pending-edit.ts';
	import {
		METADATA_FIELD_COUNT,
		fieldRows,
		splitMarkdown,
		splitRegions,
		toDraft,
		unifiedLines,
		unifyRows,
		DIFF_VIEW_KEY,
		DIFF_CHANGED_ONLY_KEY,
		type UnifiedLine
	} from '#lib/post-diff.ts';
	import { DIFF_BLOCK } from '#lib/secrets-diff.ts';
	import type { DiffTableRow } from '#lib/diff.ts';

	interface Props {
		data: { post: PostDetailAdmin };
	}

	let { data }: Props = $props();

	// Left side = the server's head (fresh from the load — and from
	// invalidateAll after a mid-review 409); right side = the pending buffer
	// (client-only — localStorage never reaches the server).
	const editStore = localStoragePostEditStore();
	const head = $derived(toDraft(data.post));
	let pending = $state<PendingEdit | null>(null);
	let loaded = $state(false);
	let tab = $state<'markdown' | 'metadata'>('markdown');
	let saving = $state(false);
	let errMsg = $state('');
	let expanded = $state(false);
	// the two presentation toggles (the vault compare's button pattern:
	// aria-pressed + amber active state), both OFF by default:
	// THE MOBILE DEFAULT (the owner's call): on touch widths the compact
	// changed-only view is the first paint — the full comparison = the
	// explicit 'Show all lines' tap. (browser guard: matchMedia is client-only;
	// the SSR renders the full view and the client adopts the compact one.)
	let changedOnly = $state(browser ? readChangedOnlyMemory() : true);
	let hideUnchanged = $state(false); // metadata: show all rows ⇄ changed only

	// THE VIEW MODE (the owner's calls, 2026-11-22): the REMEMBERED choice
	// wins (localStorage — 'remember the choice'); no memory = the viewport
	// default — INLINE on mobile (one −/+ document beats the stacked pair
	// at 390px), SPLIT on desktop. The one-frame hydration adoption = the
	// changedOnly precedent (owner call (b)).
	let view = $state<'split' | 'inline'>(
		browser
			? ((localStorage.getItem(DIFF_VIEW_KEY) as 'split' | 'inline' | null) ??
					(matchMedia('(max-width: 47.99rem)').matches ? 'inline' : 'split'))
			: 'split'
	);
	function setView(v: 'split' | 'inline') {
		view = v;
		localStorage.setItem(DIFF_VIEW_KEY, v);
	}
	// 'Changed only' DEFAULTS ON (the owner call — the compact review view
	// is the first paint EVERYWHERE; the old matchMedia viewport default is
	// dead). The uncheck ('show all lines') remembers itself.
	function readChangedOnlyMemory(): boolean {
		const raw = localStorage.getItem(DIFF_CHANGED_ONLY_KEY);
		return raw === null ? true : raw === 'true';
	}
	function setChangedOnly(v: boolean) {
		changedOnly = v;
		localStorage.setItem(DIFF_CHANGED_ONLY_KEY, String(v));
	}

	onMount(() => {
		void (async () => {
			pending = await editStore.read(data.post.slug);
			loaded = true;
		})();
	});

	// The conflict story (decision 3): the buffer forked from a rev that is
	// no longer head — someone (the owner's other tab) saved since.
	const conflict = $derived(pending !== null && pending.baseRev !== data.post.rev);
	const rows = $derived(pending ? fieldRows(pending.draft, head) : []);
	const splitRows = $derived(pending ? splitMarkdown(head, pending.draft) : []);
	// the unified's lines: the alignment flattened — one line per row, the
	// del+add pairs as the − then + consecutive lines
	const unified = $derived(pending ? unifiedLines(head, pending.draft) : []);
	// the split-table's collapse (the GitHub file-header's chevron)
	let mdOpen = $state(true);
	// the diff's stats (the GitHub's file-header's +N −N)
	const stats = $derived({
		adds: splitRows.filter((r) => r.right?.kind === 'add').length,
		dels: splitRows.filter((r) => r.left?.kind === 'del').length
	});
	const regions = $derived(pending ? splitRegions(head, pending.draft, 2) : []);
	const shownRows = $derived(hideUnchanged ? rows.filter((r) => r.status !== 'same') : rows);
	const changedCount = $derived(rows.filter((r) => r.status === 'changed').length);
	const unchangedCount = $derived(METADATA_FIELD_COUNT - changedCount);

	// block-highlight line classes — DIFF_BLOCK is the one shared language
	// (secrets-diff.ts): a solid row/cell background, not a font tint
	const lineCls = (kind: 'same' | 'add' | 'del' | null | undefined) =>
		kind === 'del'
			? `${DIFF_BLOCK.del} text-diff-del`
			: kind === 'add'
				? `${DIFF_BLOCK.add} text-diff-add`
				: 'text-muted-foreground/80';

	async function saveFrom(overwrite: boolean) {
		if (!pending) return;
		saving = true;
		errMsg = '';
		try {
			// overwrite (the conflict's "save anyway") rebases onto the fresh
			// head rev — the buffer's content wins as the latest edit; a 409
			// here means head moved AGAIN mid-review — reload and re-read.
			await client.updatePost(
				data.post.slug,
				pending.draft,
				overwrite ? data.post.rev : pending.baseRev
			);
			await editStore.clear(data.post.slug); // saved = clean — the buffer retires
			await goto(`/posts/${data.post.slug}`);
		} catch (e) {
			errMsg = errorText(e); // relay honesty: lumen's copy, verbatim
			saving = false;
		}
	}

	async function discard() {
		await editStore.clear(data.post.slug);
		await goto(`/posts/${data.post.slug}`);
	}

	function setTab(t: 'markdown' | 'metadata', refocus = true) {
		tab = t;
		if (refocus) document.getElementById(`diff-tab-${t}`)?.focus();
	}
	function onTabKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight' || e.key === 'End') {
			e.preventDefault();
			setTab('metadata');
		} else if (e.key === 'ArrowLeft' || e.key === 'Home') {
			e.preventDefault();
			setTab('markdown');
		}
	}
</script>

<svelte:head>
	<title>diff · {data.post.title} · mellon</title>
</svelte:head>

<section class="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
	<SubCrumb href="/posts/{data.post.slug}" label="posts">
		<span>diff</span>
	</SubCrumb>

	<div class="flex min-w-0 items-center gap-3">
		<!-- THE BACK ARROW (the owner's call — the genuine "Back", leading
		     the title, EVERY viewport): icon-only; the link stays a link
		     (the kit's Tooltip.Trigger = a button — the native title carries
		     the name), the aria-label = the keyboard's truth. -->
		<a
			href="/posts/{data.post.slug}"
			aria-label="Back to editor"
			title="Back to editor"
			class="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-4" />
		</a>
		<h1 class="min-w-0 truncate font-brand text-2xl font-semibold tracking-tight">
			{data.post.title}
		</h1>
		<span class="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase"
			>pending diff</span
		>
	</div>

	{#if !loaded}
		<p class="font-mono text-xs text-muted-foreground" role="status">reading pending buffer…</p>
	{:else if !pending}
		<!-- No buffer: the editor is clean (or the buffer was consumed by a save). -->
		<div
			class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center"
		>
			<p class="font-mono text-sm text-muted-foreground">nothing pending — the editor is clean</p>
			<a
				href="/posts/{data.post.slug}"
				class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				Back to editor
			</a>
		</div>
	{:else}
		{#if conflict}
			<div
				transition:fade={{ duration: 150 }}
				class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent bg-accent/40 px-4 py-2.5 text-sm"
				role="alert"
			>
				<span class="min-w-0 flex-1">
					Conflict: this post was saved elsewhere since your edits
					<span class="font-mono">(your rev {pending.baseRev} → head rev {data.post.rev})</span>.
					Saving overwrites head with YOUR buffer.
				</span>
				<Button
					type="button"
					variant="quiet"
					class="h-auto gap-1.5 rounded-full px-4 py-2 font-sans text-sm"
					onclick={() => void invalidateAll()}
					aria-label="Reload head"
				>
					<RotateCcw class="size-3.5" /> Reload head
				</Button>
			</div>
		{/if}
		{#if errMsg}
			<p
				class="w-fit rounded-full bg-danger/10 px-3 py-1 font-mono text-xs text-danger"
				role="alert"
			>
				{errMsg}
			</p>
		{/if}

		<!-- THE TABS ROW (the owner's spec): the view-toggle lives HERE —
		     beside the tabs, aligned right — not in the action band (the band
		     = the verbs only). The row wraps on the narrowest screens; the
		     toggle never overflows. -->
		<div class="flex flex-nowrap items-center justify-between gap-2">
			<!-- Tabs (house roving-tabindex pattern): markdown ⇄ metadata. -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="flex w-fit gap-1 rounded-full border border-border bg-card p-1"
				role="tablist"
				aria-label="Diff view"
				onkeydown={onTabKey}
			>
				<button
					type="button"
					id="diff-tab-markdown"
					role="tab"
					aria-selected={tab === 'markdown'}
					aria-controls="diff-panel-markdown"
					tabindex={tab === 'markdown' ? 0 : -1}
					onclick={() => setTab('markdown', false)}
					class="rounded-full px-3 py-1 font-mono text-xs transition-colors {tab === 'markdown'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Markdown
				</button>
				<button
					type="button"
					id="diff-tab-metadata"
					role="tab"
					aria-selected={tab === 'metadata'}
					aria-controls="diff-panel-metadata"
					tabindex={tab === 'metadata' ? 0 : -1}
					onclick={() => setTab('metadata', false)}
					class="rounded-full px-3 py-1 font-mono text-xs transition-colors {tab === 'metadata'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Metadata
				</button>
			</div>
			<div class="flex items-center gap-2">
				{#if tab === 'markdown'}
					<!-- THE VIEW MODE lives in the settings menu now (the GitHub's
					     ⋯ / GitLab's ⚙ pattern): the checkable items mark the active
					     layout; the same memory (mellon.diff-view) drives both
					     bodies — the full comparison's AND the Changed-only's. -->
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							aria-label="Diff preferences"
							class="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
						>
							<Ellipsis class="size-4" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content
							side="bottom"
							align="end"
							class="w-48 rounded-lg border border-border p-1"
						>
							<DropdownMenu.Label
								class="px-2 py-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
							>
								Preferences
							</DropdownMenu.Label>
							<!-- 'Changed only' lives here now (the band's amber button is
							     gone) — and DEFAULTS ON: the compact review view is the
							     first paint everywhere; the uncheck remembers itself. -->
							<DropdownMenu.CheckboxItem
								checked={changedOnly}
								onCheckedChange={(v) => {
									if (v !== undefined) setChangedOnly(v);
								}}
								closeOnSelect={false}
								class="rounded-md py-1.5 font-mono text-xs"
							>
								Changed only
							</DropdownMenu.CheckboxItem>
							<DropdownMenu.Separator class="my-1" />
							<DropdownMenu.CheckboxItem
								checked={view === 'split'}
								onCheckedChange={(v) => {
									if (v) setView('split');
								}}
								closeOnSelect={false}
								class="rounded-md py-1.5 font-mono text-xs"
							>
								Split view
							</DropdownMenu.CheckboxItem>
							<DropdownMenu.CheckboxItem
								checked={view === 'inline'}
								onCheckedChange={(v) => {
									if (v) setView('inline');
								}}
								closeOnSelect={false}
								class="rounded-md py-1.5 font-mono text-xs"
							>
								Inline view
							</DropdownMenu.CheckboxItem>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{:else}
					<Button
						type="button"
						variant="quiet"
						aria-pressed={hideUnchanged}
						class="gap-1.5 rounded-full px-3 py-1 font-mono text-xs {hideUnchanged
							? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
							: ''}"
						onclick={() => (hideUnchanged = !hideUnchanged)}
					>
						{hideUnchanged ? 'Show unchanged' : 'Hide unchanged'}
					</Button>
				{/if}
			</div>
		</div>

		<p class="font-mono text-[11px] text-muted-foreground/70">
			{#if tab === 'markdown'}
				{#if changedOnly}
					{regions.filter((r) => r.kind === 'rows').length} change region{regions.filter(
						(r) => r.kind === 'rows'
					).length === 1
						? ''
						: 's'} — <span class="text-diff-del">saved (head)</span> ⇄
					<span class="text-diff-add">pending</span>
				{:else}
					<span class="text-diff-del">saved (head)</span> ⇄
					<span class="text-diff-add">pending</span>
					— rev {data.post.rev} ⇄ forked from rev {pending.baseRev}
				{/if}
			{:else}
				{changedCount} changed · {unchangedCount} unchanged
			{/if}
		</p>

		{#if tab === 'markdown'}
			<div
				id="diff-panel-markdown"
				role="tabpanel"
				aria-labelledby="diff-tab-markdown"
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<!-- THE PANE HEADER (the owner's indicator row): the two cells sit
			     OVER their panes — HEAD (its −dels) left, PENDING (its +adds)
			     right — the ambiguity of the combined bar is dead: each label
			     explains its own pane. ONE snippet renders both views' pairs;
			     the chevron rides the FIRST instance only and collapses the
			     whole comparison (the table is one grid — no per-side split). -->
				{#snippet diffCells(row: (typeof splitRows)[number], side: 'left' | 'right')}
					{@const op = side === 'left' ? row.left : row.right}
					{@const no = side === 'left' ? row.ln.left : row.ln.right}
					<span
						class="text-right whitespace-nowrap text-muted-foreground/50 tabular-nums select-none"
						>{no ?? ''}</span
					>
					<span
						class="text-center select-none {op?.kind === 'del'
							? 'text-diff-del'
							: op?.kind === 'add'
								? 'text-diff-add'
								: ''}"
					>
						{op?.kind === 'del' ? '−' : op?.kind === 'add' ? '+' : ''}
					</span>
					<span
						class="min-w-0 break-words whitespace-pre-wrap {op?.kind === 'same'
							? ''
							: DIFF_BLOCK[op?.kind ?? 'same']} {op?.kind === 'del'
							? 'text-diff-del'
							: op?.kind === 'add'
								? 'text-diff-add'
								: ''}"
					>
						{op?.text ?? '\u00A0'}
					</span>
				{/snippet}

				<!-- THE UNIFIED ROW (the two number bars): shared by the full
				     view's inline body AND the Changed-only's inline regions —
				     the same line = both numbers; a − line = the head's bar
				     only; a + line = the pending's only; the tint spans the
				     full row, gutters included (the GitHub's anatomy). -->
				{#snippet unifiedRow(line: UnifiedLine)}
					<div
						class="grid grid-cols-[2.5rem_2.5rem_1.25rem_1fr] {line.kind === 'same'
							? ''
							: DIFF_BLOCK[line.kind]}"
					>
						<span
							class="text-right whitespace-nowrap text-muted-foreground/50 tabular-nums select-none"
							>{line.lnHead ?? ''}</span
						>
						<span
							class="text-right whitespace-nowrap text-muted-foreground/50 tabular-nums select-none"
							>{line.lnPending ?? ''}</span
						>
						<span
							class="text-center select-none {line.kind === 'del'
								? 'text-diff-del'
								: line.kind === 'add'
									? 'text-diff-add'
									: ''}"
						>
							{line.kind === 'del' ? '−' : line.kind === 'add' ? '+' : ''}
						</span>
						<span
							class="min-w-0 break-words whitespace-pre-wrap {line.kind === 'same'
								? 'text-muted-foreground/80'
								: line.kind === 'del'
									? 'text-diff-del'
									: 'text-diff-add'}"
						>
							{line.text || '\u00A0'}
						</span>
					</div>
				{/snippet}

				{#snippet paneHeader(
					title: string,
					stat: string,
					statCls: string,
					withChevron: boolean,
					description = ''
				)}
					<div class="flex h-full items-center gap-2 px-3 py-2">
						{#if withChevron}
							<button
								type="button"
								class="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
								aria-expanded={mdOpen}
								aria-label={mdOpen ? 'Collapse diff' : 'Expand diff'}
								onclick={() => (mdOpen = !mdOpen)}
							>
								<ChevronDown
									class="size-3.5 transition-transform duration-200 {mdOpen ? '' : '-rotate-90'}"
								/>
							</button>
						{/if}
						<!-- the trace's icon chip (the owner's reference): the file-diff
						     glyph in the rounded-square chip, both cells wear it -->
						<span
							class="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-card"
							aria-hidden="true"
						>
							<FileDiff class="size-3 text-muted-foreground" />
						</span>
						<h2 class="min-w-0 truncate font-mono text-[11px] text-foreground">{title}</h2>
						{#if description}
							<span
								class="hidden shrink-0 truncate font-mono text-[10px] text-muted-foreground/70 lg:block"
							>
								{description}
							</span>
						{/if}
						<span class="ml-auto shrink-0 font-mono text-[11px] tabular-nums {statCls}">{stat}</span
						>
					</div>
				{/snippet}

				{#if changedOnly}
					<!-- The collapsed view: change regions (+context) with gap bands —
					     the SAME containment (the card hugs its content, capped at
					     the pane). THE HEADER FOLLOWS THE VIEW MODE: the inline
					     regions = ONE body = the ONE DiffFileHeader (every
					     viewport); the split regions = the SAME two-cell anatomy as
					     the full view's split — the cells over their panes at EVERY
					     width (the phone's single-header stand-in is dead: split
					     means the same thing in both views now). -->
					<div
						class="flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card font-mono text-[11px]"
					>
						{#if view === 'inline'}
							<div class="shrink-0">
								<DiffFileHeader
									title="pending"
									{stats}
									note={`forked from rev ${pending.baseRev}`}
									bind:open={mdOpen}
								/>
							</div>
						{:else}
							<div
								class="grid shrink-0 grid-cols-[3rem_1.25rem_1fr_3rem_1.25rem_1fr] border-b border-border/60 bg-muted"
							>
								<div class="col-span-3">
									{@render paneHeader(
										`saved (head) · rev ${data.post.rev}`,
										`−${stats.dels}`,
										'text-diff-del',
										true
									)}
								</div>
								<div class="col-span-3">
									{@render paneHeader(
										'pending',
										`+${stats.adds}`,
										'text-diff-add',
										false,
										`forked from rev ${pending.baseRev}`
									)}
								</div>
							</div>
						{/if}
						{#if mdOpen}
							<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
								{#each regions as region, i (i)}
									{#if region.kind === 'gap'}
										<div
											class="border-y border-border/60 bg-muted/30 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground/60"
										>
											⋯ {region.count} unchanged line{region.count === 1 ? '' : 's'}
										</div>
									{:else if view === 'inline'}
										{#each unifyRows(region.rows) as line, j (j)}
											{@render unifiedRow(line)}
										{/each}
									{:else}
										{#each region.rows as row, j (j)}
											<!-- the SAME side-by-side row as the full view's table —
											     every width, the cells wrap, the panes share the
											     viewport -->
											<div
												class="grid grid-cols-[3rem_1.25rem_1fr_3rem_1.25rem_1fr] divide-x divide-border/40"
											>
												{@render diffCells(row, 'left')}
												{@render diffCells(row, 'right')}
											</div>
										{/each}
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<!-- THE FULL COMPARISON (the editor-preview's grammar): the whole
					     file. THE VIEW MODE picks the body: the UNIFIED (the GitHub's
					     inline — ONE header, the two number bars; the mobile's
					     default, the desktop's one tap away) or the SPLIT (the
					     side-by-side). -->
					{#if view === 'inline'}
						<div
							class="flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
						>
							<div class="shrink-0">
								<DiffFileHeader
									title="pending"
									{stats}
									note={`forked from rev ${pending.baseRev}`}
									bind:open={mdOpen}
								/>
							</div>
							{#if mdOpen}
								<div
									class="min-h-0 flex-1 overflow-y-auto overscroll-contain font-mono text-[11px]"
								>
									{#each unified as line, i (i)}
										{@render unifiedRow(line)}
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<!-- THE MD+ SPLIT-TABLE (the GitHub's split view): the aligned rows,
					     the line-number gutters, the ± signs, the tints per side —
					     the pane headers sit over their panes (the owner's indicator
					     row: HEAD −dels left, PENDING +adds right; ONE chevron).
					     THE CONTAINMENT: the card hugs its content, capped at the
					     pane (max-h-full) — the header stays pinned, only the lines
					     scroll (the parent NEVER scrolls). -->
						<div
							class="flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
						>
							<div
								class="grid shrink-0 grid-cols-[3rem_1.25rem_1fr_3rem_1.25rem_1fr] border-b border-border/60 bg-muted"
							>
								<div class="col-span-3">
									{@render paneHeader(
										`saved (head) · rev ${data.post.rev}`,
										`−${stats.dels}`,
										'text-diff-del',
										true
									)}
								</div>
								<div class="col-span-3">
									{@render paneHeader(
										'pending',
										`+${stats.adds}`,
										'text-diff-add',
										false,
										`forked from rev ${pending.baseRev}`
									)}
								</div>
							</div>
							{#if mdOpen}
								<div class="min-h-0 flex-1 overflow-auto overscroll-contain font-mono text-[11px]">
									<!-- the TWO PANES SIDE-BY-SIDE at every width (the GitHub
									     mobile's shape — the owner's correction): the columns
									     SHARE the viewport and the cells wrap; overflow-auto
									     stays only as the long-token safety valve -->
									{#each splitRows as row, i (i)}
										<div
											class="grid grid-cols-[3rem_1.25rem_1fr_3rem_1.25rem_1fr] divide-x divide-border/40"
										>
											{@render diffCells(row, 'left')}
											{@render diffCells(row, 'right')}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		{:else}
			<div
				id="diff-panel-metadata"
				role="tabpanel"
				aria-labelledby="diff-tab-metadata"
				class="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<!-- THE SHARED TABLE (the unification): the SAME per-key anatomy
				     as the configs/compare's table presentation — one component,
				     the cells = THIS domain's grammar (the thumbnails, the
				     clamped previews, the wrap). The scroll lives here (the
				     viewport-fit doctrine) — the values render at their natural
				     readable width, never squeezed into slivers. -->
				<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
					<div class="min-w-[48rem]">
						<DiffTable
							rows={shownRows}
							keyHeading="field"
							fromHeading="saved (head)"
							toHeading="pending"
							cell={metadataCell}
							foot={metadataFoot}
						/>
						{#snippet metadataCell(row: DiffTableRow, side: 'from' | 'to')}
							{@const val = side === 'from' ? row.from : row.to}
							{@const tint =
								side === 'from'
									? row.status === 'changed'
										? `${DIFF_BLOCK.del} text-diff-del`
										: 'text-muted-foreground/70'
									: row.status === 'changed'
										? `${DIFF_BLOCK.add} text-diff-add`
										: 'text-muted-foreground/70'}
							<td
								class="min-w-0 px-4 py-2 align-top font-mono text-xs break-words {tint} {row.key ===
									'preview' && !expanded
									? 'line-clamp-3'
									: ''} whitespace-pre-wrap"
							>
								{#if row.key === 'thumbnail' && val}
									<img
										src={val}
										alt={side === 'from' ? 'saved cover' : 'pending cover'}
										class="mb-1 h-10 w-16 rounded border border-border object-cover"
									/>
								{/if}
								{val || '—'}
							</td>
						{/snippet}
						{#snippet metadataFoot()}
							<span class="flex items-center gap-3">
								{#if rows.some((r) => r.key === 'preview' && r.status === 'changed')}
									<button
										type="button"
										onclick={() => (expanded = !expanded)}
										class="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
									>
										{expanded ? 'Collapse preview values' : 'Expand preview values'}
									</button>
								{/if}
								{#if unchangedCount > 0}
									{unchangedCount} field{unchangedCount === 1 ? '' : 's'} unchanged
								{/if}
							</span>
						{/snippet}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<!-- THE STICKY ACTION BAND (the photos' pattern, the third use): the
		     VERBS always visible, pinned to the pane's bottom. The mobile =
		     the stacked full-width (the horizontal overflow = impossible);
		     the sm+ = the inline, right-aligned. -->
	{#if pending}
		<div
			class="-mx-4 mt-auto -mb-6 flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-6 sm:flex-row sm:justify-end sm:gap-2 sm:px-6"
		>
			<Button
				type="button"
				variant="danger"
				class="h-auto w-full rounded-full px-4 py-2 font-sans text-sm sm:w-auto"
				disabled={saving}
				onclick={() => void discard()}
			>
				Discard my changes
			</Button>
			<Button
				type="button"
				variant="primary"
				class="h-auto w-full rounded-full px-4 py-2 font-sans text-sm sm:w-auto"
				disabled={saving}
				onclick={() => void saveFrom(conflict)}
			>
				{conflict ? 'Save anyway (overwrites head)' : 'Save'}
			</Button>
		</div>
	{/if}
</section>
