<script lang="ts">
	import { onMount } from 'svelte';
	import { client, ApiError } from '#lib/api/client.ts';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import type { PostSummaryAdmin } from '#lib/api/types.ts';

	/**
	 * The recent-posts widget body — SELF-CONTAINED: it fetches what it
	 * shows (the cms desk list through the relay) and renders its own
	 * loading, error and empty states. The dashboard never runs a
	 * mega-load; a widget whose scope is revoked simply never mounts.
	 *
	 * PREVIEW MODE (the picker): `preview` renders the REAL structure
	 * with placeholder content and never fetches — the picker's rows
	 * show the shape the user will get, at zero relay cost.
	 */
	let { preview = false }: { preview?: boolean } = $props();

	let posts = $state<PostSummaryAdmin[] | null>(null);
	let failed = $state('');

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });

	onMount(async () => {
		if (preview) return; // the picker's preview never calls the relay
		try {
			const page = await client.listPosts();
			posts = page.items.slice(0, 5);
		} catch (e) {
			failed = e instanceof ApiError ? e.message : 'could not load posts';
		}
	});
</script>

{#if preview}
	<div class="flex flex-col gap-1">
		{#each [0, 1, 2] as i (i)}
			<!-- the REAL row shape: title + meta line + the status pill chrome -->
			<div class="flex items-center justify-between gap-3 rounded-lg px-3 py-2">
				<span class="flex min-w-0 flex-col gap-1">
					<span class="h-3 w-2/3 animate-pulse rounded bg-muted/70"></span>
					<span class="h-2 w-1/2 animate-pulse rounded bg-muted/50"></span>
				</span>
				<StatusPill status="draft" />
			</div>
		{/each}
	</div>
{:else if posts === null}
	<div class="flex flex-col gap-2" aria-hidden="true">
		{#each [0, 1, 2] as i (i)}
			<span class="h-9 animate-pulse rounded-lg bg-muted/60"></span>
		{/each}
	</div>
{:else if failed}
	<p class="font-mono text-xs text-danger" role="alert">{failed}</p>
{:else}
	<div class="flex flex-col gap-1">
		{#each posts as post (post.slug)}
			<a
				href="/posts/{post.slug}"
				class="flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/50 focus-visible:border-border focus-visible:bg-muted/50 focus-visible:outline-none"
			>
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-sm">{post.title}</span>
					<span class="font-mono text-[10px] text-muted-foreground/70">
						{fmt.format(new Date(post.createdAt))} created
						{#if post.publishedAt}
							· {fmt.format(new Date(post.publishedAt))} published
						{:else}
							· {fmt.format(new Date(post.updatedAt))} updated
						{/if}
					</span>
				</span>
				<StatusPill status={post.status} />
			</a>
		{:else}
			<p class="px-3 py-6 font-mono text-xs text-muted-foreground">Nothing recent</p>
		{/each}
	</div>
{/if}
