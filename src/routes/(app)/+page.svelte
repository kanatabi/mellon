<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });

	// The photos caption reads off the tiles we already fetched: photos
	// items carry the `gallery` curation flag, so no extra round trip.
	const galleryShown = $derived(data.latestPhotos.filter((p) => p.gallery).length);
</script>

<!-- Card shell (DESIGN §11): quiet uppercase label + a mono "see all" door;
     each card renders its own body snippet. Rows keep the old dashboard's
     hover:border-border grammar — evolved, not reinvented. -->
{#snippet card(label: string, href: string, body: Snippet)}
	<section class="rounded-lg border border-border bg-card p-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
				{label}
			</h2>
			<a
				{href}
				class="shrink-0 rounded-sm font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
			>
				see all →
			</a>
		</div>
		{@render body()}
	</section>
{/snippet}

{#snippet postsBody()}
	<div class="flex flex-col gap-1">
		{#each data.latestPosts as post (post.slug)}
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
			<p class="px-3 py-6 font-mono text-xs text-muted-foreground">nothing recent</p>
		{/each}
	</div>
{/snippet}

{#snippet photosBody()}
	<div class="grid grid-cols-4 gap-2">
		{#each data.latestPhotos as photo (photo.id)}
			<a
				href="/photos/{photo.id}"
				title={photo.alt}
				aria-label={photo.alt}
				class="block overflow-hidden rounded-md border border-border transition-colors hover:border-muted-foreground/60 focus-visible:border-muted-foreground focus-visible:outline-none"
			>
				<img
					src={photo.src}
					alt=""
					width={photo.width}
					height={photo.height}
					loading="lazy"
					class="aspect-square w-full object-cover"
				/>
			</a>
		{:else}
			<p class="col-span-4 py-6 font-mono text-xs text-muted-foreground">no photos yet</p>
		{/each}
	</div>
	<p class="mt-3 font-mono text-[10px] text-muted-foreground/70">
		{data.latestPhotos.length} added recently · {galleryShown} in gallery
	</p>
{/snippet}

{#snippet tagsBody()}
	<div class="flex flex-col gap-1">
		{#each data.newestTags as tag (tag.name)}
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
			<p class="px-3 py-6 font-mono text-xs text-muted-foreground">no tags yet</p>
		{/each}
	</div>
{/snippet}

<svelte:head>
	<title>dashboard · mellon</title>
</svelte:head>

<section class="flex flex-col gap-8">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Dashboard</h1>
		<a
			href="/posts/new"
			class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			<Plus class="size-4" /> new post
		</a>
	</div>

	<div class="flex gap-3 font-mono text-xs text-muted-foreground">
		<span>{data.counts.posts} posts</span>
		<span>{data.counts.photos} photos</span>
		<span>{data.counts.tags} tags</span>
	</div>

	<!-- Dashboard card grid — the contract with the Traffic round: new metrics
	     join here as APPENDED cards, never a restructure of these three. -->
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{@render card('Latest posts', '/posts', postsBody)}
		{@render card('Latest photos', '/photos', photosBody)}
		{@render card('Newest tags', '/tags', tagsBody)}
	</div>

	<p class="font-mono text-[10px] text-muted-foreground/70">
		⌘K opens the command palette from anywhere
	</p>
</section>
