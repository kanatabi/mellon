<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
</script>

<svelte:head>
	<title>dashboard · mellon;</title>
</svelte:head>

<section class="flex flex-col gap-8">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">
			Dashboard<span class="text-brand">;</span>
		</h1>
		<a
			href="/posts/new"
			class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			<Plus class="size-4" /> new post<span class="text-white/70">;</span>
		</a>
	</div>

	<div class="flex gap-3 font-mono text-xs text-muted-foreground">
		<span>{data.counts.posts} posts;</span>
		<span>{data.counts.photos} photos;</span>
		<span>{data.counts.tags} tags;</span>
	</div>

	<div class="flex flex-col gap-2">
		<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">recent</p>
		{#each data.recentPosts as post (post.slug)}
			<a
				href="/posts/{post.slug}"
				class="flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-card focus-visible:border-border focus-visible:bg-card focus-visible:outline-none"
			>
				<span class="flex min-w-0 flex-col">
					<span class="truncate text-sm">{post.title}</span>
					<span class="font-mono text-[10px] text-muted-foreground/70">
						{fmt.format(new Date(post.createdAt))} created{#if post.publishedAt}
							· {fmt.format(new Date(post.publishedAt))} published{/if}
					</span>
				</span>
				<StatusPill status={post.status} />
			</a>
		{:else}
			<p class="px-3 py-6 font-mono text-xs text-muted-foreground">nothing recent;</p>
		{/each}
	</div>

	<p class="font-mono text-[10px] text-muted-foreground/70">
		⌘K opens the command palette from anywhere;
	</p>
</section>
