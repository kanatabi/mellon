<script lang="ts">
	import { page } from '$app/state';
	import PostEditor from '#lib/components/PostEditor.svelte';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#await data.detail}
	<!-- STREAMED (owner ruling 2026-11-21): the click lands HERE immediately —
	     the editor's own anatomy as a skeleton while the post streams in.
	     Distinct from the preview-pane skeleton (that one covers the first
	     RENDER; this one covers the post DATA). -->
	<div class="flex h-full min-h-0 flex-1 gap-4" role="status" aria-label="Loading post">
		<div class="flex min-w-0 flex-1 flex-col gap-4">
			<Skeleton class="h-4 w-24" />
			<Skeleton class="h-8 w-64 rounded-lg" />
			<div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
				<Skeleton class="min-h-64 rounded-lg" />
				<Skeleton class="min-h-64 rounded-lg" />
			</div>
		</div>
		<div class="hidden w-72 shrink-0 flex-col gap-3 lg:flex">
			<Skeleton class="h-28 rounded-lg" />
			<Skeleton class="h-36 rounded-lg" />
			<Skeleton class="h-20 rounded-lg" />
		</div>
	</div>
{:then [post, tags, photos]}
	{#key post.slug}
		<!-- keyed remount: palette navigation between posts changes params WITHOUT
	a new component instance, and PostEditor seeds draft/rev/status ONCE —
	the view used to go stale (address bar moved, editor stayed). A different
	document means a fresh editor; the unsaved-changes guard inside fires
	first (beforeNavigate confirm). The {#await} above keeps this honest:
	EVERY navigation resolves a fresh promise, so a post switch always
	remounts through the skeleton. -->
		<PostEditor
			{post}
			{tags}
			{photos}
			vim={page.data.vim ?? false}
			autosaveSeconds={page.data.autosaveSeconds}
		/>
	{/key}
{:catch}
	<div
		class="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center"
	>
		<p class="font-mono text-sm text-muted-foreground">post not found — it may have been deleted</p>
		<a
			href="/posts"
			class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			Back to posts
		</a>
	</div>
{/await}
