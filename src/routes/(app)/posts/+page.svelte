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
	import type { PostStatus } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	$effect(() => postsRail.init());

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });

	const statusChips: { label: string; value: PostStatus | null }[] = [
		{ label: 'all', value: null },
		{ label: 'published', value: 'published' },
		{ label: 'draft', value: 'draft' },
		{ label: 'unpublished', value: 'unpublished' }
	];

	const sortChips = [
		{ label: 'newest', value: 'newest', Icon: ArrowDownWideNarrow },
		{ label: 'oldest', value: 'oldest', Icon: ArrowUpNarrowWide },
		{ label: 'title', value: 'title', Icon: undefined }
	] as const;

	// Filters live in the URL (server load relays them to the API) — every chip
	// is a link-equivalent, shareable and back-button clean.
	function buildUrl(opts: {
		status?: PostStatus | null;
		toggleTag?: string;
		sort?: 'newest' | 'oldest' | 'title';
		from?: string | null;
		to?: string | null;
	}): string {
		const sp = new SvelteURLSearchParams(page.url.searchParams.toString());
		if ('status' in opts) {
			if (opts.status) sp.set('status', opts.status);
			else sp.delete('status');
		}
		if (opts.toggleTag) {
			const cur = sp.getAll('tag');
			sp.delete('tag');
			const next = cur.includes(opts.toggleTag)
				? cur.filter((t) => t !== opts.toggleTag)
				: [...cur, opts.toggleTag];
			for (const t of next) sp.append('tag', t);
		}
		if (opts.sort) {
			if (opts.sort === 'newest') sp.delete('sort');
			else sp.set('sort', opts.sort);
		}
		// null = drop the bound, string = set it; undefined = leave as-is
		if ('from' in opts) {
			if (opts.from) sp.set('from', opts.from);
			else sp.delete('from');
		}
		if ('to' in opts) {
			if (opts.to) sp.set('to', opts.to);
			else sp.delete('to');
		}
		const qs = sp.toString();
		return `/posts${qs ? `?${qs}` : ''}`;
	}

	const hasFilters = $derived(
		data.statusFilter !== null ||
			data.tag.length > 0 ||
			data.sort !== 'newest' ||
			!!data.from ||
			!!data.to
	);
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
		<div class="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
			{#each statusChips as chip (chip.label)}
				{@const active = (data.statusFilter ?? null) === chip.value}
				<a
					href={buildUrl({ status: chip.value })}
					aria-current={active ? 'true' : undefined}
					class="rounded-full border px-3 py-1 font-mono text-xs transition-colors {active
						? 'border-brand bg-brand/10 text-foreground'
						: 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'}"
				>
					{chip.label}
				</a>
			{/each}
			{#if hasFilters}
				<a
					href="/posts"
					class="flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<X class="size-3" /> clear
				</a>
			{/if}
		</div>

		<!-- Row grammar mirrors the public feed: hairline rules, mono meta, serif
		     entity titles. Hover AND focus reveal (no mouse-only affordance). -->
		<div class="flex flex-col">
			{#each data.posts as post (post.slug)}
				<a
					href="/posts/{post.slug}"
					transition:fade|local={{ duration: 140 }}
					class="group flex items-center justify-between gap-4 border-t border-border py-3.5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
				>
					<span class="flex min-w-0 flex-col gap-0.5">
						<span class="font-mono text-[10px] text-muted-foreground">
							{fmt.format(new Date(post.createdAt))} created{#if post.publishedAt}
								· {fmt.format(new Date(post.publishedAt))} published{/if}
							· {fmt.format(new Date(post.updatedAt))} edit · rev {post.rev}
						</span>
						<span class="font-brand text-lg leading-snug font-semibold tracking-tight">
							{post.title}
						</span>
						<span class="min-w-0 truncate text-xs text-muted-foreground">{post.subtitle}</span>
					</span>
					<StatusPill status={post.status} />
				</a>
			{:else}
				<p class="border-t border-border py-10 text-center font-mono text-xs text-muted-foreground">
					nothing matches these filters
				</p>
			{/each}
		</div>
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
				{#each sortChips as chip (chip.value)}
					<a
						href={buildUrl({ sort: chip.value })}
						aria-current={data.sort === chip.value ? 'true' : undefined}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors {data.sort ===
						chip.value
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

	<!-- Phones: filters arrive as a bottom sheet instead of the inline rail. -->
	<RailDrawer label="Filters" icon={SlidersHorizontal}>
		{@render filtersBody()}
	</RailDrawer>
</section>
