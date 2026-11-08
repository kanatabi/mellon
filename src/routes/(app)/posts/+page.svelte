<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowDownWideNarrow,
		ArrowUpNarrowWide,
		PanelRightClose,
		PanelRightOpen,
		Plus,
		SlidersHorizontal,
		X
	} from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import DateRange from '#lib/components/DateRange.svelte';
	import RailDrawer from '#lib/components/RailDrawer.svelte';
	import { postsRail } from '#lib/rails.svelte.ts';
	import { editField, vocabSubmenu } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import { parseDateExpr } from '#lib/date-expr.ts';
	import type { Command } from '#lib/commands.ts';
	import type { PostStatus } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	$effect(() => postsRail.init());

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
	const fmtFull = new Intl.DateTimeFormat('en-GB', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const fmtDate = (iso: string | null) => (iso ? fmtFull.format(new Date(iso)) : '—');

	const statusChips: { label: string; value: PostStatus | null }[] = [
		{ label: 'all', value: null },
		{ label: 'published', value: 'published' },
		{ label: 'draft', value: 'draft' },
		{ label: 'unpublished', value: 'unpublished' }
	];

	const sortChips = [
		{ label: 'newest', sort: 'updated', dir: 'desc', Icon: ArrowDownWideNarrow },
		{ label: 'oldest', sort: 'updated', dir: 'asc', Icon: ArrowUpNarrowWide },
		{ label: 'title', sort: 'title', dir: 'asc', Icon: undefined }
	] as const;

	// Table headers: sortable columns (owner call — headers that don't sort
	// feel broken). Dates default to newest-first, title to A→Z.
	const headerCols = [
		{ field: 'title', label: 'title' },
		{ field: 'created', label: 'created' },
		{ field: 'updated', label: 'updated' },
		{ field: 'published', label: 'published' }
	] as const;

	// Filters live in the URL (server load relays them to the API) — every chip
	// is a link-equivalent, shareable and back-button clean.
	function buildUrl(opts: {
		status?: PostStatus | null;
		toggleTag?: string;
		sort?: 'updated' | 'created' | 'published' | 'title';
		dir?: 'asc' | 'desc';
		from?: string | null;
		to?: string | null;
		page?: number;
	}): string {
		const sp = new SvelteURLSearchParams(page.url.searchParams.toString());
		// ANY filter/sort change resets pagination — a stale ?page behind a new
		// filter shows an empty void and feels broken (owner pagination rule).
		let touchesQuery = false;
		if ('status' in opts) {
			if (opts.status) sp.set('status', opts.status);
			else sp.delete('status');
			touchesQuery = true;
		}
		if (opts.toggleTag) {
			const cur = sp.getAll('tag');
			sp.delete('tag');
			const next = cur.includes(opts.toggleTag)
				? cur.filter((t) => t !== opts.toggleTag)
				: [...cur, opts.toggleTag];
			for (const t of next) sp.append('tag', t);
			touchesQuery = true;
		}
		if ('from' in opts) {
			if (opts.from) sp.set('from', opts.from);
			else sp.delete('from');
			touchesQuery = true;
		}
		if ('to' in opts) {
			if (opts.to) sp.set('to', opts.to);
			else sp.delete('to');
			touchesQuery = true;
		}
		if (opts.sort) {
			const dir = opts.dir ?? 'desc';
			if (opts.sort === 'updated' && dir === 'desc') {
				sp.delete('sort');
				sp.delete('dir');
			} else {
				sp.set('sort', opts.sort);
				sp.set('dir', dir);
			}
			touchesQuery = true;
		}
		if (opts.page) {
			if (opts.page > 1) sp.set('page', String(opts.page));
			else sp.delete('page');
		} else if (touchesQuery) sp.delete('page');
		const qs = sp.toString();
		return `/posts${qs ? `?${qs}` : ''}`;
	}

	/** Header click: same field flips direction; new field gets its default. */
	function sortUrl(field: 'updated' | 'created' | 'published' | 'title'): string {
		const dir =
			data.sort === field
				? data.dir === 'desc'
					? 'asc'
					: 'desc'
				: field === 'title'
					? 'asc'
					: 'desc';
		return buildUrl({ sort: field, dir });
	}

	const hasFilters = $derived(
		data.statusFilter !== null ||
			data.tag.length > 0 ||
			!!data.from ||
			!!data.to ||
			data.sort !== 'updated' ||
			data.dir !== 'desc'
	);

	/* ── Palette = this page's control surface (§7 parity, control-center
	   round 3): everything the filter sidebar chips do, ⌘K does — and every
	   command closes over buildUrl, the ONE query-string truth the API
	   filters read. State is read EAGERLY at the top of the effect so the
	   registrations re-run when a filter flips: the ✓ marks must be live,
	   not closure-lucky. ─────────────────────────────────────────────── */
	$effect(() => {
		const statusNow = data.statusFilter ?? 'all';
		const tagsNow = data.tag;
		const sortNow = `${data.sort}·${data.dir}`;
		const cmds: Command[] = [
			vocabSubmenu({
				id: 'posts.status',
				title: 'Filter by status',
				vocab: [{ name: 'all' }, { name: 'draft' }, { name: 'published' }, { name: 'unpublished' }],
				isOn: (n) => statusNow === n,
				// single home: picking SETS the segment (rows close the palette —
				// the navigation IS the commit)
				pick: (n) => void goto(buildUrl({ status: n === 'all' ? null : (n as PostStatus) }))
			}),
			vocabSubmenu({
				id: 'posts.tag',
				title: 'Filter by tags',
				vocab: data.tags.map((t) => ({
					name: t.name,
					hint: `${t.posts} ${t.posts === 1 ? 'post' : 'posts'}`
				})),
				isOn: (n) => tagsNow.includes(n),
				// OR semantics, like the sidebar chips: toggle keeps the palette
				// open so tag→tag→date chains in one session
				pick: (n) => void goto(buildUrl({ toggleTag: n }))
			}),
			editField({
				id: 'posts.dates',
				title: 'Set date range',
				pill: 'dates',
				date: true,
				range: true, // the range grammar's first consumer
				seed:
					data.from && data.to && data.from !== data.to
						? `${data.from}..${data.to}`
						: (data.from ?? data.to ?? ''),
				commit: (v) => {
					const w = parseDateExpr(v);
					if (!w) return false;
					void goto(buildUrl({ from: w.from, to: w.to }));
				}
			}),
			vocabSubmenu({
				id: 'posts.sort',
				title: 'Sort by',
				vocab: sortChips.map((c) => ({ name: c.label })),
				isOn: (n) => sortChips.some((c) => c.label === n && `${c.sort}·${c.dir}` === sortNow),
				pick: (n) => {
					const c = sortChips.find((x) => x.label === n);
					if (c) void goto(buildUrl({ sort: c.sort, dir: c.dir }));
				}
			}),
			...(hasFilters
				? [
						{
							id: 'posts.clear',
							title: 'Clear filters',
							group: 'actions' as const,
							run: () => void goto('/posts')
						}
					]
				: [])
		];
		setPageCommands(cmds);
		return () => setPageCommands([]);
	});

	// Sheet trigger rides the status row's far edge (phones only) — no
	// floating FAB (owner call 2026-11-08). The count badges tags + the
	// date window, the things this row's chips don't already show.
	let filtersSheet = $state(false);
	let filtersTrigger = $state<HTMLElement | undefined>();
	const sheetCount = $derived(data.tag.length + (data.from ? 1 : 0) + (data.to ? 1 : 0));
</script>

<svelte:head>
	<title>posts · mellon</title>
</svelte:head>

<section class="flex min-h-full gap-4">
	<div class="flex min-w-0 grow flex-col gap-6">
		<div class="flex items-end justify-between gap-4">
			<h1 class="font-brand text-4xl font-semibold tracking-tight">Posts</h1>
			<a
				href="/posts/new"
				class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
			>
				<Plus class="size-4" /> new post
			</a>
		</div>

		<!-- Status row — the §4 machine's three states, filterable. -->
		<!-- Status strip + pinned filters key (owner call): the chips scroll
		     sideways at phone widths (no wrap — the row keeps one line), the
             key holds the same h-9 w-11 language as the editor's thumb band.
             Badge + tint answer "is anything filtered?" at a glance. -->
		<div class="flex items-center gap-2">
			<div
				class="-mx-1 flex min-w-0 grow [scrollbar-width:none] gap-2 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden"
				role="group"
				aria-label="Filter by status"
			>
				{#each statusChips as chip (chip.label)}
					{@const active = (data.statusFilter ?? null) === chip.value}
					<a
						href={buildUrl({ status: chip.value })}
						aria-current={active ? 'true' : undefined}
						class="shrink-0 rounded-full border px-3 py-1 font-mono text-xs whitespace-nowrap transition-colors {active
							? 'border-brand bg-brand/10 text-foreground'
							: 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'}"
					>
						{chip.label}
					</a>
				{/each}
				{#if hasFilters}
					<a
						href="/posts"
						class="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
					>
						<X class="size-3" /> clear
					</a>
				{/if}
			</div>
			<button
				type="button"
				bind:this={filtersTrigger}
				onclick={() => (filtersSheet = true)}
				aria-haspopup="dialog"
				aria-expanded={filtersSheet}
				aria-label={sheetCount ? `Open filters, ${sheetCount} active` : 'Open filters'}
				title="Filters"
				class="relative flex h-9 w-11 shrink-0 items-center justify-center rounded-md border bg-card transition-colors active:scale-[0.98] lg:hidden {sheetCount
					? 'border-brand bg-brand/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<SlidersHorizontal class="size-4" />
				{#if sheetCount}
					<span
						class="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[9px] text-white"
						>{sheetCount}</span
					>
				{/if}
			</button>
		</div>

		<!-- The list: stacked rows below lg (the view the owner keeps for
		     phones), a columnar TABLE at lg+ — one loop so the two never
		     drift. Rows are link-cards: the title's ::after spans the row, so
		     the whole row clicks while the link remains the only tab stop.
		     Hover AND focus-within tint — no mouse-only affordance. -->
		<div role="table" aria-label="Posts" class="flex flex-col">
			<div
				role="row"
				class="hidden items-center gap-4 border-b border-border pb-2 lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_7.5rem]"
			>
				{#each headerCols as col (col.field)}
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
				{/each}
				<span
					role="columnheader"
					class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
				>
					status
				</span>
			</div>
			{#each data.posts as post (post.slug)}
				<div
					role="row"
					transition:fade|local={{ duration: 140 }}
					class="group relative flex items-center justify-between gap-4 border-b border-border py-3.5 transition-colors focus-within:bg-accent/40 hover:bg-accent/40 lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_7.5rem] lg:justify-start"
				>
					<div role="cell" class="min-w-0">
						<a
							href="/posts/{post.slug}"
							class="font-brand text-lg leading-snug font-semibold tracking-tight after:absolute after:inset-0 after:content-[''] focus-visible:underline"
						>
							{post.title}
						</a>
						<p class="min-w-0 truncate text-xs text-muted-foreground">{post.subtitle}</p>
						<p class="font-mono text-[10px] text-muted-foreground lg:hidden">
							{fmt.format(new Date(post.createdAt))} created{#if post.publishedAt}
								· {fmt.format(new Date(post.publishedAt))} published{/if}
							· {fmt.format(new Date(post.updatedAt))} edit · rev {post.rev}
						</p>
					</div>
					<span
						role="cell"
						class="hidden font-mono text-[11px] text-muted-foreground tabular-nums lg:block"
					>
						{fmtDate(post.createdAt)}
					</span>
					<span
						role="cell"
						class="hidden font-mono text-[11px] text-muted-foreground tabular-nums lg:block"
					>
						{fmtDate(post.updatedAt)}
					</span>
					<span
						role="cell"
						class="hidden font-mono text-[11px] text-muted-foreground tabular-nums lg:block"
					>
						{fmtDate(post.publishedAt)}
					</span>
					<div role="cell" class="flex flex-col items-end gap-1 lg:items-start">
						<StatusPill status={post.status} />
						<span class="hidden font-mono text-[10px] text-muted-foreground/60 lg:block">
							rev {post.rev}
						</span>
					</div>
				</div>
			{:else}
				<p class="border-t border-border py-10 text-center font-mono text-xs text-muted-foreground">
					nothing matches these filters
				</p>
			{/each}
		</div>

		<!-- Pager: links, not fetch logic — shareable, back-button honest,
		     keyboard-native. Hidden when the corpus fits one page. -->
		{#if data.totalPages > 1}
			<div class="flex items-center justify-between gap-4 font-mono text-xs">
				{#if data.page > 1}
					<a
						href={buildUrl({ page: data.page - 1 })}
						class="rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
						>← prev</a
					>
				{:else}
					<span class="px-3 py-1 text-muted-foreground/40">← prev</span>
				{/if}
				<span class="text-muted-foreground">page {data.page} / {data.totalPages}</span>
				{#if data.page < data.totalPages}
					<a
						href={buildUrl({ page: data.page + 1 })}
						class="rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
						>next →</a
					>
				{:else}
					<span class="px-3 py-1 text-muted-foreground/40">next →</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Right rail: tags + sort (earendil's kit roles, admin shape). Folds to
	     the side; content curtains behind the width transition (item #6). -->
	<div
		class="hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out lg:block {postsRail.collapsed
			? 'w-9'
			: 'w-60'}"
	>
		{#if postsRail.collapsed}
			<button
				type="button"
				onclick={postsRail.toggle}
				aria-label="Open filters"
				class="flex w-9 flex-col items-center gap-3 rounded-lg border border-border bg-card py-3 text-muted-foreground transition-colors hover:text-foreground"
			>
				<PanelRightOpen class="size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase [writing-mode:vertical-rl]">
					filters{#if data.tag.length}
						· {data.tag.length}{/if}
				</span>
			</button>
		{:else}
			<aside
				transition:fade={{ duration: 120 }}
				class="flex w-60 flex-col gap-6 rounded-lg border border-border bg-card p-4"
				aria-label="Filters"
			>
				<div class="flex items-center justify-between">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">filters</p>
					<button
						type="button"
						onclick={postsRail.toggle}
						aria-label="Collapse filters"
						class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<PanelRightClose class="size-4" />
					</button>
				</div>
				{@render filtersBody()}
			</aside>
		{/if}
	</div>

	{#snippet filtersBody()}
		<div class="flex flex-col gap-2">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">sort</p>
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="Sort posts">
				{#each sortChips as chip (chip.label)}
					{@const on = data.sort === chip.sort && data.dir === chip.dir}
					<a
						href={buildUrl({ sort: chip.sort, dir: chip.dir })}
						aria-current={on ? 'true' : undefined}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors {on
							? 'border-brand bg-brand/10 text-foreground'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{#if chip.Icon}
							<chip.Icon class="size-3" />
						{/if}
						{chip.label}
					</a>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-2">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">dates</p>
			<DateRange
				from={data.from}
				to={data.to}
				onchange={(f, t) => void goto(buildUrl({ from: f ?? null, to: t ?? null }))}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
				tags{#if data.tag.length}
					· {data.tag.length} on{/if}
			</p>
			<!-- OR semantics, matching the public list contract. -->
			<div class="flex flex-wrap gap-1.5">
				{#each data.tags as t (t.name)}
					{@const on = data.tag.includes(t.name)}
					<a
						href={buildUrl({ toggleTag: t.name })}
						aria-current={on ? 'true' : undefined}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors {on
							? 'border-brand bg-brand/10 text-foreground'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{t.name}
						<span class="text-muted-foreground/60">{t.posts}</span>
					</a>
				{/each}
			</div>
		</div>

		<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/60">
			filters ride the URL — the API does the work, the page never sorts
		</p>
	{/snippet}

	<!-- Phones: filters arrive as a bottom sheet, summoned by the row chip. -->
	<RailDrawer label="Filters" bind:open={filtersSheet} bind:trigger={filtersTrigger}>
		{@render filtersBody()}
	</RailDrawer>
</section>
