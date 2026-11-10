<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Check, Hash, Minus, Plus, Search, X } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { focusOnMount } from '#lib/actions.ts';
	import { editField, stateToggle } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import type { Command } from '#lib/commands.ts';
	import { ApiError, client } from '#lib/api/client.ts';
	import type { TagCount } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let createName = $state('');
	// seeded once from the URL, then user-owned (back/forward re-runs the
	// load; the input value is intentionally NOT a live mirror)
	// svelte-ignore state_referenced_locally
	let query = $state(data.q);
	let message = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);
	let busy = $state(false);

	/* ── URL (ruling: filters ride the URL; q/page/tag) ─────────── */
	const url = (over: { q?: string; page?: number; dropTag?: boolean }) => {
		const qs = new SvelteURLSearchParams();
		const nq = over.q !== undefined ? over.q : data.q;
		const np = over.page ?? data.page;
		if (nq) qs.set('q', nq);
		if (np > 1) qs.set('page', String(np));
		if (!over.dropTag && data.tag) qs.set('tag', data.tag);
		const str = qs.toString();
		return `/tags${str ? `?${str}` : ''}`;
	};
	const go = (over: Parameters<typeof url>[0], opts?: { replace?: boolean }) =>
		void goto(url(over), { replaceState: opts?.replace ?? false });

	// debounced engine bar: the URL is the state — SSR re-answers per settle
	let debounce: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => go({ q: query.trim(), page: 1 }), 250);
	}

	/* ── rows / pager ───────────────────────────────────────────── */
	const rows = $derived<TagCount[]>(
		data.search
			? data.search.items
			: data.tags.slice((data.page - 1) * data.pageSize, data.page * data.pageSize)
	);
	const total = $derived(data.search ? data.search.total : data.tags.length);
	const totalPages = $derived(Math.max(1, Math.ceil(total / data.pageSize)));

	/* ── bulk selection (the photos desk pattern, mirrored) ─────── */
	const selection = new SvelteSet<string>();
	// selection is a per-page context: any query change clears it so a bulk
	// apply can never hit rows behind a different filter
	$effect(() => {
		void page.url.search;
		selection.clear();
	});
	const toggleSelect = (name: string) =>
		selection.has(name) ? selection.delete(name) : selection.add(name);
	const selectAll = () => {
		if (selection.size === rows.length) selection.clear();
		else for (const r of rows) selection.add(r.name);
	};
	async function bulkFeature(featured: boolean) {
		const names = [...selection];
		if (!names.length) return;
		await run(async () => {
			const updated = await client.bulkFeatureTags(names, featured);
			selection.clear();
			if (!updated) return `already ${featured ? 'featured' : 'hidden'} — nothing changed`;
			return `${updated} ${updated === 1 ? 'tag' : 'tags'} ${featured ? 'featured' : 'unfeatured'}`;
		});
	}

	/* ── the dialog ─────────────────────────────────────────────── */
	let dialogTag = $state<string | null>(null);
	let draftName = $state('');
	let usedPosts = $state<{ slug: string; title: string; status: string }[]>([]);
	let usedTotal = $state(0);
	let usedBusy = $state(false);

	const current = $derived(data.tags.find((t) => t.name === dialogTag) ?? null);

	// clicking opens client-side; the URL only carries DEEP links (a click
	// is not a shareable state — reload returning to the list is fine)
	function openDialog(tag: TagCount | string) {
		const name = typeof tag === 'string' ? tag : tag.name;
		dialogTag = name;
		draftName = name;
	}
	function closeDialog() {
		dialogTag = null;
		if (data.tag) go({ dropTag: true }, { replace: true });
	}
	// deep link (?tag=) opens the dialog; close removes the param
	$effect(() => {
		if (data.tag && data.tag !== dialogTag) {
			dialogTag = data.tag;
			draftName = data.tag;
		}
	});
	// "used in" fetches lazily on open; a stale-response guard keeps quick
	// row-switching from painting the wrong tag's posts
	let usedSeq = 0;
	$effect(() => {
		const t = dialogTag;
		if (!t) {
			usedPosts = [];
			usedTotal = 0;
			return;
		}
		const my = ++usedSeq;
		usedBusy = true;
		client
			.listPosts({ tag: [t], page: 1 })
			.then((p) => {
				if (my !== usedSeq) return;
				usedPosts = p.items.map((x) => ({ slug: x.slug, title: x.title, status: x.status }));
				usedTotal = p.total;
			})
			.catch(() => {})
			.finally(() => {
				if (my === usedSeq) usedBusy = false;
			});
	});

	async function saveDialog() {
		if (!current) return;
		const patch: { name?: string; featured?: boolean } = {};
		if (draftName.trim() && draftName.trim() !== current.name) patch.name = draftName.trim();
		await run(async () => {
			const t = await client.updateTag(current.name, patch);
			dialogTag = t.name;
			draftName = t.name;
			return patch.name ? `renamed → ${t.name} — every referencing post followed` : 'saved';
		});
	}

	async function toggleFromDialog() {
		if (!current) return;
		await run(async () => {
			await client.updateTag(current.name, { featured: !current.featured });
			return current.featured
				? `unfeatured ${current.name}`
				: `featured ${current.name} — earendil lists it once a post uses it`;
		});
	}

	async function deleteFromDialog() {
		if (!current) return;
		if (!confirm(`Delete "${current.name}" from the vocabulary?`)) return;
		busy = true;
		try {
			await client.deleteTag(current.name);
			message = { kind: 'ok', text: `deleted ${current.name}` };
			closeDialog();
			await invalidateAll();
		} catch (e) {
			// guard messages stay VISIBLE IN the dialog — the count is the
			// answer to "why can't I delete this"
			message = { kind: 'err', text: e instanceof ApiError ? e.message : String(e) };
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	/* ── ops ────────────────────────────────────────────────────── */
	async function run(fn: () => Promise<string>): Promise<boolean> {
		message = null;
		try {
			message = { kind: 'ok', text: await fn() };
			await invalidateAll();
			return true;
		} catch (e) {
			message = { kind: 'err', text: e instanceof ApiError ? e.message : String(e) };
			await invalidateAll();
			return false;
		}
	}
	async function create() {
		const name = createName.trim();
		if (!name) return;
		const done = await run(async () => {
			const t = await client.createTag(name);
			return `created ${t.name} — feature it when it earns the widget`;
		});
		if (done) createName = '';
	}
	const fmtDate = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
	const stamp = (iso: string) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '—' : fmtDate.format(d);
	};

	/* ── palette verbs ──────────────────────────────────────────── */
	$effect(() => {
		const cmds: Command[] = [];
		cmds.push(
			editField({
				id: 'tags.new',
				title: 'Create tag',
				pill: 'tag',
				seed: '',
				commit: (v) => {
					createName = v;
					void create();
					return true;
				}
			})
		);
		cmds.push(
			editField({
				id: 'tags.filter',
				title: 'Search the vocabulary',
				pill: 'find',
				seed: data.q,
				commit: (v) => {
					query = v;
					go({ q: v.trim(), page: 1 });
					return true;
				}
			})
		);
		cmds.push(
			stateToggle({
				id: 'tags.selectall',
				title: selection.size ? 'Clear selection' : 'Select page',
				on: selection.size > 0,
				onHint: `${selection.size} on`,
				offHint: 'none',
				run: selectAll
			})
		);
		setPageCommands(cmds);
		return () => setPageCommands([]);
	});
</script>

<svelte:head>
	<title>tags · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="font-brand text-4xl font-semibold tracking-tight">Tags</h1>
			<p class="font-mono text-xs text-muted-foreground">
				{data.tags.length} names · {data.tags.filter((t) => t.featured).length} featured — the widget
				lists featured ones that a published post actually uses
			</p>
		</div>
		<form
			class="flex items-center gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				void create();
			}}
		>
			<input
				bind:value={createName}
				aria-label="New tag name"
				placeholder="new-tag-name"
				class="w-full rounded-full border border-border bg-transparent px-3 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/40 md:w-48"
			/>
			<button
				type="submit"
				disabled={!createName.trim()}
				class="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-mono text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
			>
				<Plus class="size-3.5" /> create
			</button>
		</form>
	</div>

	<!-- engine-backed vocabulary search (ruling 2026-11-10): the bar hits
	     ALL names with typo tolerance, the URL carries the query -->
	<div class="relative flex items-center">
		<Search
			class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground/60"
			aria-hidden="true"
		/>
		<input
			type="search"
			bind:value={query}
			oninput={onSearchInput}
			placeholder="search tags — whole vocabulary"
			aria-label="Search tags"
			class="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-9 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
		/>
		{#if query}
			<button
				type="button"
				onclick={() => {
					query = '';
					go({ q: '', page: 1 });
				}}
				aria-label="Clear tag search"
				class="absolute right-2.5 p-1 text-muted-foreground hover:text-foreground"
			>
				<X class="size-3.5" />
			</button>
		{/if}
	</div>

	{#if message}
		<p
			class="w-fit rounded-full px-3 py-1 font-mono text-xs {message.kind === 'ok'
				? 'bg-brand/10 text-brand'
				: 'text-danger'}"
			role="status"
		>
			{message.text}
		</p>
	{/if}

	{#if data.q}
		<p class="font-mono text-xs text-muted-foreground" role="status">
			engine results · {total} matching “{data.q}” — order is relevance
		</p>
	{/if}

	<!-- bulk bar: curation is a mode, appears only with a live selection -->
	{#if selection.size > 0}
		<div
			transition:fade={{ duration: 140 }}
			class="flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2"
			role="toolbar"
			aria-label="Bulk tag curation"
		>
			<span class="font-mono text-xs text-brand">{selection.size} selected</span>
			<button
				type="button"
				onclick={() => void bulkFeature(true)}
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<Check class="size-3" /> feature all
			</button>
			<button
				type="button"
				onclick={() => void bulkFeature(false)}
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<Minus class="size-3" /> unfeature all
			</button>
			<button
				type="button"
				onclick={() => selection.clear()}
				aria-label="Clear selection"
				class="ml-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
			>
				<X class="size-3.5" />
			</button>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<div
			class="grid grid-cols-[2.25rem_minmax(0,1fr)_5rem_7.5rem] items-center gap-3 border-b border-border px-4 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
		>
			<button
				type="button"
				onclick={selectAll}
				class="flex items-center gap-1.5 text-left tracking-widest transition-colors hover:text-foreground"
				aria-label={selection.size === rows.length && rows.length > 0
					? 'Deselect all'
					: 'Select all'}
			>
				<Check class="size-3" />{selection.size === rows.length && rows.length > 0 ? 'none' : 'all'}
			</button>
			<span>name</span>
			<span class="text-right">posts</span>
			<span>featured</span>
		</div>
		{#each rows as tag (tag.name)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				role="button"
				tabindex="-1"
				onclick={(e) => {
					if (!(e.target as HTMLElement).closest('button')) openDialog(tag);
				}}
				class="grid grid-cols-[2.25rem_minmax(0,1fr)_5rem_7.5rem] items-center gap-3 border-b border-border/60 px-4 py-2 transition-colors last:border-b-0 hover:bg-card/60"
			>
				<button
					type="button"
					onclick={() => toggleSelect(tag.name)}
					aria-pressed={selection.has(tag.name)}
					aria-label={selection.has(tag.name) ? `Deselect ${tag.name}` : `Select ${tag.name}`}
					class="flex size-6 items-center justify-center rounded border transition-colors {selection.has(
						tag.name
					)
						? 'border-brand bg-brand text-white'
						: 'border-border text-muted-foreground hover:text-foreground'}"
				>
					<Check class="size-3" />
				</button>
				<button
					type="button"
					onclick={() => openDialog(tag)}
					class="flex min-w-0 items-center gap-1.5 truncate text-left font-mono text-xs text-foreground underline-offset-2 hover:underline"
					aria-label={`Open settings for ${tag.name}`}
				>
					<Hash class="size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
					<span class="truncate">{tag.name}</span>
				</button>
				<span
					class="text-right font-mono text-xs {tag.posts
						? 'text-foreground'
						: 'text-muted-foreground/50'}"
				>
					{tag.posts}
				</span>
				<button
					type="button"
					onclick={() =>
						void run(async () => {
							await client.updateTag(tag.name, { featured: !tag.featured });
							return tag.featured ? `unfeatured ${tag.name}` : `featured ${tag.name}`;
						})}
					aria-pressed={tag.featured}
					aria-label={tag.featured ? `Unfeature ${tag.name}` : `Feature ${tag.name}`}
					class="flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors {tag.featured
						? 'border-brand bg-brand/10 text-brand'
						: 'border-border text-muted-foreground hover:text-foreground'}"
				>
					{#if tag.featured}<Check class="size-3" />{:else}<Minus class="size-3" />{/if}
					{tag.featured ? 'in widget' : 'hidden'}
				</button>
			</div>
		{:else}
			<p class="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
				{data.q ? `nothing matches “${data.q}”` : 'the vocabulary is empty'}
			</p>
		{/each}
	</div>

	{#if totalPages > 1}
		<div class="flex items-center justify-between gap-4 font-mono text-xs">
			{#if data.page > 1}
				<a
					href={url({ page: data.page - 1 })}
					class="rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
					>← prev</a
				>
			{:else}
				<span class="px-3 py-1 text-muted-foreground/40">← prev</span>
			{/if}
			<span class="text-muted-foreground">page {data.page} / {totalPages}</span>
			{#if data.page < totalPages}
				<a
					href={url({ page: data.page + 1 })}
					class="rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
					>next →</a
				>
			{:else}
				<span class="px-3 py-1 text-muted-foreground/40">next →</span>
			{/if}
		</div>
	{/if}

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		click a row for its settings — rename propagates to every post (id-keyed), feature decides the
		widget (a featured tag shows up once a published post uses it), delete refuses while any live
		post references the name.
	</p>
</section>

{#if dialogTag && current}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Tag settings"
		onclick={(e) => e.target === e.currentTarget && closeDialog()}
		onkeydown={(e) => e.key === 'Escape' && closeDialog()}
	>
		<div
			class="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-2xl"
		>
			<div class="flex items-start justify-between gap-3">
				<h2 class="flex items-center gap-2 font-brand text-lg font-semibold">
					<Hash class="size-4 text-muted-foreground" aria-hidden="true" />
					Tag settings
				</h2>
				<span
					class="mt-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
				>
					{current.posts} posts · created {stamp(current.createdAt)} · touched {stamp(
						current.updatedAt
					)}
				</span>
			</div>

			<label class="flex flex-col gap-1">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">name</span
				>
				<input
					bind:value={draftName}
					use:focusOnMount
					class="rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
				/>
			</label>

			<button
				type="button"
				onclick={() => void toggleFromDialog()}
				aria-pressed={current.featured}
				aria-label="Toggle featured"
				class="flex items-center justify-between rounded-md border border-border px-3 py-2 font-mono text-xs transition-colors hover:border-brand/60"
			>
				<span class="text-muted-foreground">in the earendil TOPICS widget</span>
				<span
					class="flex items-center gap-1.5 {current.featured
						? 'text-brand'
						: 'text-muted-foreground'}"
				>
					{#if current.featured}<Check class="size-3.5" /> featured{:else}<Minus class="size-3.5" /> hidden{/if}
				</span>
			</button>

			<div class="flex flex-col gap-1">
				<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">
					used by {usedTotal}
					{usedTotal === 1 ? 'post' : 'posts'}
				</p>
				{#if usedBusy}
					<p class="font-mono text-xs text-muted-foreground/60">loading…</p>
				{:else}
					<div class="flex max-h-40 flex-col gap-1 overflow-y-auto">
						{#each usedPosts as p (p.slug)}
							<a
								href="/posts/{p.slug}"
								class="flex items-center justify-between gap-2 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								<span class="truncate">{p.title}</span>
								<span class="shrink-0 text-[10px] uppercase">{p.status}</span>
							</a>
						{:else}
							<p class="px-2 font-mono text-xs text-muted-foreground/60">
								lives in the vocabulary only — free to delete
							</p>
						{/each}
					</div>
				{/if}
			</div>

			{#if message}
				<p
					class="font-mono text-xs {message.kind === 'ok' ? 'text-brand' : 'text-danger'}"
					role="status"
				>
					{message.text}
				</p>
			{/if}

			<div class="mt-1 flex items-center justify-between gap-2">
				<button
					type="button"
					onclick={deleteFromDialog}
					disabled={busy}
					class="flex items-center gap-1.5 rounded-full border border-danger/40 px-3 py-1.5 font-mono text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
				>
					<X class="size-3.5" /> delete
				</button>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={closeDialog}
						class="rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						close
					</button>
					<button
						type="button"
						disabled={busy || !draftName.trim()}
						onclick={() => void saveDialog()}
						class="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
					>
						save
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
