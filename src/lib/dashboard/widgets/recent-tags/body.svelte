<script lang="ts">
	import { onMount } from 'svelte';
	import { client, ApiError } from '#lib/api/client.ts';
	import type { TagCount } from '#lib/api/types.ts';

	/**
	 * The newest-tags widget body — self-contained (the plugin seam).
	 * PREVIEW MODE: the real row structure (featured dot + name + count)
	 * with placeholder content, no fetch (the picker's rows).
	 */
	let { preview = false }: { preview?: boolean } = $props();

	let tags = $state<TagCount[] | null>(null);
	let failed = $state('');

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });

	onMount(async () => {
		if (preview) return;
		try {
			tags = (await client.listNewestTags()).slice(0, 8);
		} catch (e) {
			failed = e instanceof ApiError ? e.message : 'could not load tags';
		}
	});
</script>

{#if preview}
	<div class="flex flex-col gap-1">
		{#each [0, 1, 2] as i (i)}
			<div class="flex items-center justify-between gap-3 rounded-lg px-3 py-2">
				<span class="flex min-w-0 items-center gap-2">
					<span class="size-2 shrink-0 rounded-full border border-border" aria-hidden="true"></span>
					<span class="h-3 w-24 animate-pulse rounded bg-muted/70"></span>
				</span>
				<span class="h-2 w-12 animate-pulse rounded bg-muted/50"></span>
			</div>
		{/each}
	</div>
{:else if tags === null}
	<div class="flex flex-col gap-2" aria-hidden="true">
		{#each [0, 1, 2, 3] as i (i)}
			<span class="h-9 animate-pulse rounded-lg bg-muted/60"></span>
		{/each}
	</div>
{:else if failed}
	<p class="font-mono text-xs text-danger" role="alert">{failed}</p>
{:else}
	<div class="flex flex-col gap-1">
		{#each tags as tag (tag.name)}
			<!-- Deep link: the tag desk opens that tag's settings dialog on arrival. -->
			<a
				href="/tags?tag={encodeURIComponent(tag.name)}"
				class="flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/50 focus-visible:border-border focus-visible:bg-muted/50 focus-visible:outline-none"
			>
				<span class="flex min-w-0 items-center gap-2">
					<!-- featured dot: the photos-cast teal (§11.3 — widget membership) -->
					<span
						aria-hidden="true"
						class="size-2 shrink-0 rounded-full border {tag.featured
							? 'border-accent-teal bg-accent-teal'
							: 'border-border'}"
					></span>
					<span class="truncate font-mono text-xs">{tag.name}</span>
					<span class="shrink-0 font-mono text-[10px] text-muted-foreground/70">
						{tag.posts}
						{tag.posts === 1 ? 'post' : 'posts'}
					</span>
				</span>
				<span class="shrink-0 font-mono text-[10px] text-muted-foreground/70">
					{fmt.format(new Date(tag.createdAt))}
				</span>
			</a>
		{:else}
			<p class="px-3 py-6 font-mono text-xs text-muted-foreground">No tags yet</p>
		{/each}
	</div>
{/if}
