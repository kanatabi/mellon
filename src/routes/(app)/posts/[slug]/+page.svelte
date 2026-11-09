<script lang="ts">
	import { page } from '$app/state';
	import PostEditor from '#lib/components/PostEditor.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#key data.post.slug}
	<!-- keyed remount: palette navigation between posts changes params WITHOUT
	a new component instance, and PostEditor seeds draft/rev/status ONCE —
	the view used to go stale (address bar moved, editor stayed). A different
	document means a fresh editor; the unsaved-changes guard inside fires
	first (beforeNavigate confirm). -->
	<PostEditor post={data.post} tags={data.tags} photos={data.photos} vim={page.data.vim ?? false} />
{/key}
