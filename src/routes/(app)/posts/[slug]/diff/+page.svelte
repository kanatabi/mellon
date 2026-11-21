<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { FileDiff, List, RotateCcw } from 'lucide-svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import { client, errorText } from '#lib/api/client.ts';
	import type { PostDetailAdmin } from '#lib/api/types.ts';
	import { localStoragePostEditStore, type PendingEdit } from '#lib/pending-edit.ts';
	import {
		METADATA_FIELD_COUNT,
		fieldRows,
		splitMarkdown,
		splitRegions,
		toDraft
	} from '#lib/post-diff.ts';
	import { DIFF_BLOCK } from '#lib/secrets-diff.ts';

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
	let changedOnly = $state(false); // markdown: whole file ⇄ change regions
	let hideUnchanged = $state(false); // metadata: show all rows ⇄ changed only

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
	const regions = $derived(pending ? splitRegions(head, pending.draft, 2) : []);
	const shownRows = $derived(hideUnchanged ? rows.filter((r) => r.status !== 'same') : rows);
	const changedCount = $derived(rows.filter((r) => r.status === 'changed').length);
	const unchangedCount = $derived(METADATA_FIELD_COUNT - changedCount);

	// the status chip vocabulary — the vault compare's own
	const chip: Record<string, string> = {
		changed: 'bg-accent-amber/15 text-accent-amber',
		same: 'text-muted-foreground/60'
	};
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

<section class="flex min-h-0 flex-1 flex-col gap-4">
	<SubCrumb href="/posts/{data.post.slug}" label="posts">
		<span>diff</span>
	</SubCrumb>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<h1 class="min-w-0 truncate font-brand text-2xl font-semibold tracking-tight">
				{data.post.title}
			</h1>
			<span class="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase"
				>pending diff</span
			>
		</div>
		<a
			href="/posts/{data.post.slug}"
			class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			Back to editor
		</a>
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

		<div class="flex flex-wrap items-center justify-between gap-2">
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
			<div class="flex items-center gap-2">
				<!-- UNIFORM BAR (owner feedback): one size across the group;
				     order = the toggle, then the DESTRUCTIVE verb (red at rest —
				     danger reads before you click), Save (primary) last. -->
				{#if tab === 'markdown'}
					<Button
						type="button"
						variant="quiet"
						aria-pressed={changedOnly}
						class="h-auto gap-1.5 rounded-full px-4 py-2 font-sans text-sm {changedOnly
							? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
							: ''}"
						onclick={() => (changedOnly = !changedOnly)}
					>
						{#if changedOnly}<List class="size-3.5" />{:else}<FileDiff class="size-3.5" />{/if}
						{changedOnly ? 'Show all lines' : 'Changed only'}
					</Button>
				{:else}
					<Button
						type="button"
						variant="quiet"
						aria-pressed={hideUnchanged}
						class="h-auto gap-1.5 rounded-full px-4 py-2 font-sans text-sm {hideUnchanged
							? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
							: ''}"
						onclick={() => (hideUnchanged = !hideUnchanged)}
					>
						{hideUnchanged ? 'Show unchanged' : 'Hide unchanged'}
					</Button>
				{/if}
				<Button
					type="button"
					variant="danger"
					class="h-auto rounded-full px-4 py-2 font-sans text-sm"
					disabled={saving}
					onclick={() => void discard()}
				>
					Discard my changes
				</Button>
				<Button
					type="button"
					variant="primary"
					disabled={saving}
					onclick={() => void saveFrom(conflict)}
				>
					{conflict ? 'Save anyway (overwrites head)' : 'Save'}
				</Button>
			</div>
		</div>

		{#if tab === 'markdown'}
			<div
				id="diff-panel-markdown"
				role="tabpanel"
				aria-labelledby="diff-tab-markdown"
				class="min-h-0"
			>
				{#if changedOnly}
					<!-- The collapsed view: change regions (+context) with gap bands. -->
					<div
						class="overflow-hidden rounded-lg border border-border bg-card font-mono text-[11px]"
					>
						{#each regions as region, i (i)}
							{#if region.kind === 'gap'}
								<div
									class="border-y border-border/60 bg-muted/30 px-3 py-1 text-center font-mono text-[10px] text-muted-foreground/60"
								>
									⋯ {region.count} unchanged line{region.count === 1 ? '' : 's'}
								</div>
							{:else}
								{#each region.rows as row, j (j)}
									<div class="grid grid-cols-1 gap-px md:grid-cols-2">
										<div
											class="min-h-[1.4em] min-w-0 px-3 py-0.5 break-words whitespace-pre-wrap md:border-r md:border-border/40 {lineCls(
												row.left?.kind
											)} {row.left?.kind === 'same' ? '' : DIFF_BLOCK[row.left?.kind ?? 'same']}"
										>
											{row.left?.text ?? ''}
										</div>
										<div
											class="min-h-[1.4em] min-w-0 px-3 py-0.5 break-words whitespace-pre-wrap {lineCls(
												row.right?.kind
											)} {row.right?.kind === 'same' ? '' : DIFF_BLOCK[row.right?.kind ?? 'same']}"
										>
											{row.right?.text ?? ''}
										</div>
									</div>
								{/each}
							{/if}
						{/each}
					</div>
				{:else}
					<!-- The default view: the WHOLE file, two text panes (no row grid —
					     free-flowing lines, block-highlighted where they changed). -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="min-w-0">
							<p
								class="border-b border-border px-1 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
							>
								saved (head) · rev {data.post.rev}
							</p>
							<div
								class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11px] leading-relaxed"
							>
								{#each splitRows as row, i (i)}
									<div
										class="min-h-[1.4em] min-w-0 break-words whitespace-pre-wrap {lineCls(
											row.left?.kind
										)} {row.left?.kind === 'same' ? '' : DIFF_BLOCK[row.left?.kind ?? 'same']}"
									>
										{row.left?.text ?? '\u00A0'}
									</div>
								{/each}
							</div>
						</div>
						<div class="min-w-0">
							<p
								class="border-b border-border px-1 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
							>
								pending
							</p>
							<div
								class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-[11px] leading-relaxed"
							>
								{#each splitRows as row, i (i)}
									<div
										class="min-h-[1.4em] min-w-0 break-words whitespace-pre-wrap {lineCls(
											row.right?.kind
										)} {row.right?.kind === 'same' ? '' : DIFF_BLOCK[row.right?.kind ?? 'same']}"
									>
										{row.right?.text ?? '\u00A0'}
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div
				id="diff-panel-metadata"
				role="tabpanel"
				aria-labelledby="diff-tab-metadata"
				class="overflow-hidden rounded-lg border border-border bg-card"
			>
				{#each shownRows as row (row.key)}
					<div
						class="grid grid-cols-[6rem_1fr_1fr] items-start gap-2 border-b border-border/60 p-3 last:border-b-0 md:grid-cols-[8rem_1fr_1fr_5.5rem] md:gap-4"
					>
						<div class="flex items-center gap-2 font-mono text-xs text-muted-foreground">
							{row.label}
							<span
								class="rounded px-1.5 py-0.5 font-mono text-[9px] {chip[row.status]}"
								title="field status"
							>
								{row.status}
							</span>
						</div>
						<div
							class="min-w-0 rounded px-1.5 py-0.5 font-mono text-xs break-words {row.status ===
							'changed'
								? `${DIFF_BLOCK.del} text-diff-del`
								: 'text-muted-foreground/70'} {row.key === 'preview' && !expanded
								? 'line-clamp-3'
								: ''} whitespace-pre-wrap"
						>
							{#if row.key === 'thumbnail' && row.from}
								<img
									src={row.from}
									alt="saved cover"
									class="mb-1 h-10 w-16 rounded border border-border object-cover"
								/>
							{/if}
							{row.from || '—'}
						</div>
						<div
							class="min-w-0 rounded px-1.5 py-0.5 font-mono text-xs break-words {row.status ===
							'changed'
								? `${DIFF_BLOCK.add} text-diff-add`
								: 'text-muted-foreground/70'} {row.key === 'preview' && !expanded
								? 'line-clamp-3'
								: ''} whitespace-pre-wrap"
						>
							{#if row.key === 'thumbnail' && row.to}
								<img
									src={row.to}
									alt="pending cover"
									class="mb-1 h-10 w-16 rounded border border-border object-cover"
								/>
							{/if}
							{row.to || '—'}
						</div>
						<span class="hidden md:block" aria-hidden="true"></span>
					</div>
				{/each}
				{#if rows.some((r) => r.key === 'preview' && r.status === 'changed')}
					<button
						type="button"
						onclick={() => (expanded = !expanded)}
						class="px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
					>
						{expanded ? 'Collapse preview values' : 'Expand preview values'}
					</button>
				{/if}
				{#if unchangedCount > 0}
					<p class="px-3 py-2 font-mono text-[11px] text-muted-foreground/70">
						{unchangedCount} field{unchangedCount === 1 ? '' : 's'} unchanged
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>
