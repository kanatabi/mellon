<script lang="ts">
	import { goto } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import Pill from '#lib/components/Pill.svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
</script>

<svelte:head>
	<title>posts · mellon;</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">
			Posts<span class="text-brand">;</span>
		</h1>
		<a
			href="/posts/new"
			class="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
		>
			<Plus class="size-4" /> new
		</a>
	</div>

	<div class="flex gap-2">
		<Pill active={!data.statusFilter} onclick={() => goto('/posts')}>all;</Pill>
		<Pill
			active={data.statusFilter === 'published'}
			onclick={() => goto('/posts?status=published')}
		>
			published;
		</Pill>
		<Pill active={data.statusFilter === 'draft'} onclick={() => goto('/posts?status=draft')}
			>draft;</Pill
		>
	</div>

	<!-- Row grammar mirrors the public feed: hairline rules, mono meta, serif
	     entity titles. Hover AND focus reveal (no mouse-only affordance). -->
	<div class="flex flex-col">
		{#each data.posts as post (post.slug)}
			<a
				href="/posts/{post.slug}"
				class="group flex items-center justify-between gap-4 border-t border-border py-3.5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
			>
				<span class="flex min-w-0 flex-col gap-0.5">
					<span class="font-mono text-[10px] text-muted-foreground">
						{fmt.format(new Date(post.updatedAt))} · rev {post.rev}
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
				nothing here;
			</p>
		{/each}
	</div>
</section>
