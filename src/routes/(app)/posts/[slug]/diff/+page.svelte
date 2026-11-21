<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import { client, errorText } from '#lib/api/client.ts';
	import type { PostDetailAdmin } from '#lib/api/types.ts';
	import { localStoragePostEditStore, type PendingEdit } from '#lib/pending-edit.ts';
	import { FIELD_LABELS, fieldRows, splitMarkdown, toDraft } from '#lib/post-diff.ts';

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
	const unchangedCount = $derived(FIELD_LABELS.length - rows.length);

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
			back to editor
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
				back to editor
			</a>
		</div>
	{:else}
		{#if conflict}
			<div
				transition:slide={{ duration: 180 }}
				class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent bg-accent/40 px-4 py-2.5 text-sm"
				role="alert"
			>
				<span class="min-w-0 flex-1">
					Conflict: this post was saved elsewhere since your edits
					<span class="font-mono">(your rev {pending.baseRev} → head rev {data.post.rev})</span>.
					Saving overwrites head with YOUR buffer.
				</span>
				<button
					type="button"
					onclick={() => void invalidateAll()}
					class="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					reload head
				</button>
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
					<span class="text-diff-del">saved (head)</span> ⇄
					<span class="text-diff-add">pending</span>
					— rev {data.post.rev} ⇄ forked from rev {pending.baseRev}
				{:else}
					{rows.length} changed · {unchangedCount} unchanged
				{/if}
			</p>
			<div class="flex items-center gap-2">
				<button
					type="button"
					disabled={saving}
					onclick={() => void saveFrom(conflict)}
					class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
				>
					{conflict ? 'save anyway (overwrites head)' : 'save'}
				</button>
				<button
					type="button"
					disabled={saving}
					onclick={() => void discard()}
					class="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-danger disabled:opacity-40"
				>
					discard my changes
				</button>
			</div>
		</div>

		{#if tab === 'markdown'}
			<div
				id="diff-panel-markdown"
				role="tabpanel"
				aria-labelledby="diff-tab-markdown"
				class="overflow-hidden rounded-lg border border-border bg-card font-mono text-xs"
			>
				<div class="grid grid-cols-1 gap-px border-b border-border bg-muted/40 md:grid-cols-2">
					<span class="px-3 py-1.5 text-[10px] tracking-widest text-muted-foreground uppercase"
						>saved (head)</span
					>
					<span
						class="hidden px-3 py-1.5 text-[10px] tracking-widest text-muted-foreground uppercase md:block"
						>pending</span
					>
				</div>
				{#each splitRows as row, i (i)}
					<div
						class="grid grid-cols-1 gap-px border-b border-border/60 last:border-b-0 md:grid-cols-2"
					>
						<div
							class="min-h-[1.5em] min-w-0 px-3 py-1 break-words whitespace-pre-wrap {row.left
								?.kind === 'del'
								? 'bg-diff-del/10 text-diff-del'
								: row.left?.kind === 'add'
									? 'bg-diff-add/10 text-diff-add'
									: 'text-muted-foreground'}"
						>
							{row.left?.text ?? ''}
						</div>
						<div
							class="min-h-[1.5em] min-w-0 px-3 py-1 break-words whitespace-pre-wrap {row.right
								?.kind === 'add'
								? 'bg-diff-add/10 text-diff-add'
								: row.right?.kind === 'del'
									? 'bg-diff-del/10 text-diff-del'
									: 'text-muted-foreground'}"
						>
							{row.right?.text ?? ''}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div
				id="diff-panel-metadata"
				role="tabpanel"
				aria-labelledby="diff-tab-metadata"
				class="overflow-hidden rounded-lg border border-border bg-card"
			>
				{#each rows as row (row.key)}
					<div
						class="grid grid-cols-1 gap-2 border-b border-border/60 p-3 last:border-b-0 md:grid-cols-[8rem_1fr_1fr] md:gap-4"
					>
						<div class="font-mono text-xs text-muted-foreground">{row.label}</div>
						<div
							class="min-w-0 rounded px-1 font-mono text-xs break-words text-diff-del {row.key ===
								'preview' && !expanded
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
							class="min-w-0 rounded px-1 font-mono text-xs break-words text-diff-add {row.key ===
								'preview' && !expanded
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
					</div>
				{/each}
				{#if rows.some((r) => r.key === 'preview')}
					<button
						type="button"
						onclick={() => (expanded = !expanded)}
						class="px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
					>
						{expanded ? 'collapse preview values' : 'expand preview values'}
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
