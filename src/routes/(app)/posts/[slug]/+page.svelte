<script lang="ts">
	import { page } from '$app/state';
	import PostEditor from '#lib/components/PostEditor.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<PostEditor post={data.post} tags={data.tags} photos={data.photos} vim={page.data.vim ?? false} />
