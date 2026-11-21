<!-- Fixture: the REAL posts list page with stubbed load data — the mount
	smoke (the v4.0.0 hydration 500: `bind:ref={undefined}` against the
	cast's `ref = $bindable(null)`). -->
<script lang="ts">
	import PostsPage from './+page.svelte';

	const data = {
		posts: [],
		total: 0,
		totalPages: 1,
		page: 1,
		tags: [],
		status: undefined,
		tag: [],
		q: undefined,
		from: undefined,
		to: undefined,
		sort: 'updated',
		dir: 'desc',
		statusFilter: null
	} as never;
</script>

<PostsPage {data} />
