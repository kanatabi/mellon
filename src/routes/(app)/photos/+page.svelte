<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowDownWideNarrow,
		ArrowUpNarrowWide,
		Check,
		Eye,
		EyeOff,
		Images,
		LayoutGrid,
		Link,
		Plus,
		Table,
		X
	} from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams, SvelteSet } from 'svelte/reactivity';
	import Combobox from '#lib/components/Combobox.svelte';
	import ImagePicker from '#lib/components/ImagePicker.svelte';
	import Watermark from '#lib/components/Watermark.svelte';
	import { client } from '#lib/api/client.ts';
	import type { AdminPhoto } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	/* ── Curation overlays ───────────────────────────────────────────────────
	   Mutations are optimistic (edit a per-id overlay, fire updatePhoto, revert
	   on failure) so tiles never reload out from under the keyboard. Server
	   data stays the base truth; the mock singleton keeps them consistent. */
	let edits = $state<Record<string, { gallery?: boolean; collection?: string | null }>>({});
	const rows = $derived(
		data.photos.map((p) => (edits[p.id] ? { ...p, ...edits[p.id] } : p)) as AdminPhoto[]
	);
	let message = $state('');

	async function patch(id: string, next: { gallery?: boolean; collection?: string | null }) {
		const prev = edits[id];
		edits[id] = { ...(prev ?? {}), ...next };
		try {
			await client.updatePhoto(id, next);
			message = 'saved';
		} catch (e) {
			if (prev) edits[id] = prev;
			else
				edits = Object.fromEntries(Object.entries(edits).filter(([k]) => k !== id)) as typeof edits;
			message = e instanceof Error ? e.message : 'update failed';
		}
		setTimeout(() => (message = ''), 2500);
	}

	/* ── Bulk selection ─────────────────────────────────────────────────────── */
	const selection = new SvelteSet<string>();
	const selectedIds = $derived([...selection]);
	function toggleSelect(id: string) {
		if (selection.has(id)) selection.delete(id);
		else selection.add(id);
	}
	function selectAll() {
		if (selection.size === rows.length) selection.clear();
		else for (const p of rows) selection.add(p.id);
	}
	async function bulk(next: { gallery?: boolean; collection?: string | null }) {
		const ids = selectedIds;
		if (!ids.length) return;
		for (const id of ids) await patch(id, next);
	}

	/** Copy the serving URL — the same door the picker's row action offers,
	 *  now on both photos views (owner call). Relative mock-era src becomes
	 *  absolute so what lands on the clipboard is always paste-ready. */
	async function copyLink(p: AdminPhoto) {
		try {
			await navigator.clipboard.writeText(new URL(p.src, location.origin).href);
			message = 'link copied';
		} catch {
			message = 'clipboard blocked by the browser';
		}
		setTimeout(() => (message = ''), 2500);
	}

	/* ── Filters ride the URL (the API filters, never this page) ───────────── */
	function buildUrl(opts: { collection?: string | null; gallery?: boolean | null }): string {
		const sp = new SvelteURLSearchParams(page.url.searchParams.toString());
		if ('collection' in opts) {
			if (opts.collection) sp.set('collection', opts.collection);
			else sp.delete('collection');
		}
		if ('gallery' in opts) {
			if (opts.gallery === true) sp.set('gallery', '1');
			else if (opts.gallery === false) sp.set('gallery', '0');
			else sp.delete('gallery');
		}
		const qs = sp.toString();
		return `/photos${qs ? `?${qs}` : ''}`;
	}

	const hasFilters = $derived(!!data.collection || data.gallery !== undefined);
	let pickerOpen = $state(false);

	/* ── View: tiles ⇄ table (owner call — same dual-view idea as the editor) ─
	   localStorage preference; the table only renders from md up (phones keep
	   the tile view even if a desktop session saved 'table'). */
	let view = $state<'tiles' | 'table'>('tiles');
	onMount(() => {
		if (localStorage.getItem('mellon.view.photos') === 'table') view = 'table';
	});
	function setView(v: 'tiles' | 'table') {
		view = v;
		localStorage.setItem('mellon.view.photos', v);
	}

	/* Sort rides the URL too (headers, like posts). */
	function sortUrl(field: 'created' | 'title' | 'collection'): string {
		const dir =
			data.sort === field
				? data.dir === 'desc'
					? 'asc'
					: 'desc'
				: field === 'title'
					? 'asc'
					: 'desc';
		const sp = new SvelteURLSearchParams(page.url.searchParams.toString());
		if (field === 'created' && dir === 'desc') {
			sp.delete('sort');
			sp.delete('dir');
		} else {
			sp.set('sort', field);
			sp.set('dir', dir);
		}
		const qs = sp.toString();
		return `/photos${qs ? `?${qs}` : ''}`;
	}

	const fmtDate = (iso: string) =>
		new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(iso)
		);

	// table columns; `field` marks the sortable headers (API-side)
	const photoCols: { label: string; field: 'created' | 'title' | 'collection' | null }[] = [
		{ label: '', field: null },
		{ label: 'photo', field: null },
		{ label: 'alt', field: 'title' },
		{ label: 'collection', field: 'collection' },
		{ label: 'gallery', field: null },
		{ label: 'size', field: null },
		{ label: 'created', field: 'created' }
	];
</script>

<svelte:head>
	<title>photos · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Photos</h1>
		<div class="flex items-center gap-3">
			<!-- View segment (md+): tiles ⇄ table. -->
			<div
				class="hidden gap-1 rounded-full border border-border bg-card p-1 md:flex"
				role="group"
				aria-label="Photos view"
			>
				<button
					type="button"
					onclick={() => setView('tiles')}
					aria-pressed={view === 'tiles'}
					class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {view ===
					'tiles'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<LayoutGrid class="size-3.5" /> tiles
				</button>
				<button
					type="button"
					onclick={() => setView('table')}
					aria-pressed={view === 'table'}
					class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {view ===
					'table'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Table class="size-3.5" /> table
				</button>
			</div>
			<button
				type="button"
				onclick={() => (pickerOpen = true)}
				class="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground active:scale-[0.98]"
			>
				<Plus class="size-4" /> upload
			</button>
		</div>
	</div>

	<!-- Curation strip: collection chips (vocabulary + uncategorized) +
	     gallery toggle + select-all. Scrollable at phone widths, like posts. -->
	<div
		class="flex min-w-0 [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
	>
		<div class="flex shrink-0 items-center gap-2" role="group" aria-label="Filter by collection">
			<a
				href={buildUrl({ collection: null })}
				aria-current={!data.collection ? 'true' : undefined}
				class="shrink-0 rounded-full border px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors {!data.collection
					? 'border-brand bg-brand/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				all
			</a>
			{#each data.collections as c (c.name)}
				<a
					href={buildUrl({ collection: c.name })}
					aria-current={data.collection === c.name ? 'true' : undefined}
					class="shrink-0 rounded-full border px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors {data.collection ===
					c.name
						? 'border-brand bg-brand/10 text-foreground'
						: 'border-border text-muted-foreground hover:text-foreground'}"
				>
					{c.name} <span class="text-muted-foreground/60">{c.photos}</span>
				</a>
			{/each}
			<a
				href={buildUrl({ collection: 'uncategorized' })}
				aria-current={data.collection === 'uncategorized' ? 'true' : undefined}
				class="shrink-0 rounded-full border border-dashed px-3 py-1 font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors {data.collection ===
				'uncategorized'
					? 'border-brand text-foreground'
					: 'border-border hover:text-foreground'}"
			>
				uncategorized
			</a>
		</div>
		<span class="w-px shrink-0 self-stretch bg-border" aria-hidden="true"></span>
		<div class="flex shrink-0 items-center gap-2" role="group" aria-label="Filter by gallery">
			<a
				href={buildUrl({ gallery: true })}
				aria-current={data.gallery === true ? 'true' : undefined}
				class="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors {data.gallery ===
				true
					? 'border-brand bg-brand/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<Eye class="size-3" /> in gallery
			</a>
			<a
				href={buildUrl({ gallery: false })}
				aria-current={data.gallery === false ? 'true' : undefined}
				class="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors {data.gallery ===
				false
					? 'border-brand bg-brand/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<EyeOff class="size-3" /> out
			</a>
		</div>
		{#if hasFilters}
			<a
				href="/photos"
				class="flex shrink-0 items-center gap-1 self-center rounded-full px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
			>
				<X class="size-3" /> clear
			</a>
		{/if}
		<button
			type="button"
			onclick={selectAll}
			class="ml-auto flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			<Check class="size-3" />
			{selection.size === rows.length && rows.length > 0 ? 'deselect all' : 'select all'}
		</button>
	</div>

	<!-- Bulk bar: appears only with a live selection (owner call — curation is
	     a mode, not a permanent limb). -->
	{#if selection.size > 0}
		<div
			transition:fade={{ duration: 140 }}
			class="flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2"
			role="toolbar"
			aria-label="Bulk curation"
		>
			<span class="font-mono text-xs text-brand">{selection.size} selected</span>
			<div class="w-44">
				<Combobox
					items={data.collections.map((c) => ({ name: c.name, count: c.photos }))}
					multiple={false}
					selected={[]}
					emptyLabel="set collection…"
					noneLabel="uncategorized"
					create={(n) => client.createCollection(n)}
					onchange={(next) => void bulk({ collection: next[0] ?? null })}
				/>
			</div>
			<button
				type="button"
				onclick={() => void bulk({ gallery: true })}
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<Eye class="size-3" /> in gallery
			</button>
			<button
				type="button"
				onclick={() => void bulk({ gallery: false })}
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<EyeOff class="size-3" /> out
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

	{#if message}
		<p class="w-fit rounded-full bg-brand/10 px-3 py-1 font-mono text-xs text-brand" role="status">
			{message}
		</p>
	{/if}

	{#if rows.length === 0}
		<div class="relative flex flex-col items-center gap-3 py-24">
			<Watermark
				class="pointer-events-none absolute inset-0 m-auto aspect-square w-72"
				opacity={0.08}
			/>
			<Images class="relative size-6 text-muted-foreground" />
			<p class="relative font-mono text-xs text-muted-foreground">
				{hasFilters
					? 'nothing matches these filters'
					: 'no photographs yet — the darkroom is empty'}
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 md:grid-cols-3 {view === 'table' ? 'md:hidden' : ''}">
			{#each rows as p (p.id)}
				{@const sel = selection.has(p.id)}
				<figure class="flex flex-col gap-2">
					<div class="relative">
						<img
							src={p.src}
							alt={p.alt}
							width={p.width}
							height={p.height}
							class="aspect-[4/3] w-full rounded-lg border border-border object-cover"
						/>
						<!-- checkbox key -->
						<button
							type="button"
							onclick={() => toggleSelect(p.id)}
							aria-pressed={selection.has(p.id)}
							aria-label={selection.has(p.id) ? `Deselect ${p.alt}` : `Select ${p.alt}`}
							class={sel
								? 'absolute top-2 left-2 flex size-7 items-center justify-center rounded-md border border-brand bg-brand text-white backdrop-blur transition-colors'
								: 'absolute top-2 left-2 flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground'}
						>
							<Check class="size-3.5" />
						</button>
						<!-- copy-link key, beside the gallery eye -->
						<button
							type="button"
							onclick={() => void copyLink(p)}
							aria-label={`Copy link for ${p.alt}`}
							title="Copy link"
							class="absolute top-2 right-10 flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
						>
							<Link class="size-3.5" />
						</button>
						<!-- gallery eye key: pressed = published to the blog Gallery -->
						<button
							type="button"
							onclick={() => void patch(p.id, { gallery: !p.gallery })}
							aria-pressed={p.gallery}
							aria-label={p.gallery ? `Remove ${p.alt} from gallery` : `Add ${p.alt} to gallery`}
							title="In gallery"
							class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md border backdrop-blur transition-colors {p.gallery
								? 'border-brand bg-brand/90 text-white'
								: 'border-border bg-card/80 text-muted-foreground hover:text-foreground'}"
						>
							{#if p.gallery}<Eye class="size-3.5" />{:else}<EyeOff class="size-3.5" />{/if}
						</button>
					</div>
					<!-- the picker sits in the flow; figcaption stays the figure's
					     last child (a11y). -->
					<div>
						<Combobox
							items={data.collections.map((c) => ({ name: c.name, count: c.photos }))}
							multiple={false}
							selected={p.collection ? [p.collection] : []}
							emptyLabel="uncategorized"
							noneLabel="uncategorized"
							create={(n) => client.createCollection(n)}
							onchange={(next) => void patch(p.id, { collection: next[0] ?? null })}
						/>
					</div>
					<figcaption class="font-mono text-[10px] leading-relaxed text-muted-foreground">
						{p.width}×{p.height} · {p.alt}
					</figcaption>
				</figure>
			{/each}
		</div>

		<!-- Table view (md+; phones always see tiles): same controls as the
		     tiles — checkbox, collection combobox, gallery key — laid out in
		     sortable columns through the API (headers are links). -->
		{#if view === 'table'}
			<div role="table" aria-label="Photos" class="hidden flex-col md:flex">
				<div
					role="row"
					class="mb-1 grid grid-cols-[2.25rem_5.5rem_minmax(0,1fr)_11rem_5.5rem_5.5rem_7rem] items-center gap-4 border-b border-border pb-2"
				>
					{#each photoCols as col (col.label)}
						{#if col.field}
							<a
								role="columnheader"
								href={sortUrl(col.field)}
								aria-sort={data.sort === col.field
									? data.dir === 'asc'
										? 'ascending'
										: 'descending'
									: 'none'}
								class="flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase transition-colors {data.sort ===
								col.field
									? 'text-foreground'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								{col.label}
								{#if data.sort === col.field}
									{#if data.dir === 'asc'}
										<ArrowUpNarrowWide class="size-3" />
									{:else}
										<ArrowDownWideNarrow class="size-3" />
									{/if}
								{/if}
							</a>
						{:else}
							<span
								role="columnheader"
								class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
							>
								{col.label}
							</span>
						{/if}
					{/each}
				</div>
				{#each rows as p (p.id)}
					{@const sel = selection.has(p.id)}
					<div
						role="row"
						class="grid grid-cols-[2.25rem_5.5rem_minmax(0,1fr)_11rem_5.5rem_5.5rem_7rem] items-center gap-4 border-b border-border py-2.5 transition-colors focus-within:bg-accent/40 hover:bg-accent/40"
					>
						<span role="cell">
							<button
								type="button"
								onclick={() => toggleSelect(p.id)}
								aria-pressed={sel}
								aria-label={sel ? `Deselect ${p.alt}` : `Select ${p.alt}`}
								class="flex size-6 items-center justify-center rounded border transition-colors {sel
									? 'border-brand bg-brand text-white'
									: 'border-border text-muted-foreground hover:text-foreground'}"
							>
								<Check class="size-3" />
							</button>
						</span>
						<span role="cell">
							<img
								src={p.src}
								alt={p.alt}
								width={p.width}
								height={p.height}
								loading="lazy"
								class="h-10 w-14 rounded border border-border object-cover"
							/>
						</span>
						<span role="cell" class="min-w-0 truncate font-mono text-xs text-muted-foreground">
							{p.alt}
						</span>
						<div role="cell" class="w-44">
							<Combobox
								items={data.collections.map((c) => ({ name: c.name, count: c.photos }))}
								multiple={false}
								selected={p.collection ? [p.collection] : []}
								emptyLabel="uncategorized"
								noneLabel="uncategorized"
								create={(n) => client.createCollection(n)}
								onchange={(next) => void patch(p.id, { collection: next[0] ?? null })}
							/>
						</div>
						<span role="cell" class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => void patch(p.id, { gallery: !p.gallery })}
								aria-pressed={p.gallery}
								aria-label={p.gallery ? `Remove ${p.alt} from gallery` : `Add ${p.alt} to gallery`}
								class="flex size-7 items-center justify-center rounded border transition-colors {p.gallery
									? 'border-brand bg-brand/15 text-brand'
									: 'border-border text-muted-foreground hover:text-foreground'}"
							>
								{#if p.gallery}<Eye class="size-3.5" />{:else}<EyeOff class="size-3.5" />{/if}
							</button>
							<button
								type="button"
								onclick={() => void copyLink(p)}
								aria-label={`Copy link for ${p.alt}`}
								title="Copy link"
								class="flex size-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:text-foreground"
							>
								<Link class="size-3.5" />
							</button>
						</span>
						<span role="cell" class="font-mono text-[11px] text-muted-foreground tabular-nums">
							{p.width}×{p.height}
						</span>
						<span role="cell" class="font-mono text-[11px] text-muted-foreground tabular-nums">
							{fmtDate(p.createdAt)}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>

{#if pickerOpen}
	<ImagePicker
		mode="upload"
		photos={rows}
		onClose={() => (pickerOpen = false)}
		onUploaded={() => void invalidate((u) => u.pathname === page.url.pathname)}
	/>
{/if}
