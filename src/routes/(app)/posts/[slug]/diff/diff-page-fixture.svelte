<!-- Fixture: the REAL diff page with stubbed load data — the mount smoke +
	the buffer-read contract (empty state vs pending state). -->
<script lang="ts">
	import DiffPage from './+page.svelte';

	const data = {
		post: {
			slug: 'a-post',
			title: 'A post',
			subtitle: '',
			preview: '',
			date: '2026-11-21',
			tags: [],
			content: 'body',
			thumbnail: null,
			status: 'draft',
			readTime: 1,
			rev: 3,
			createdAt: '2026-11-20T10:00:00Z',
			publishedAt: null,
			updatedAt: '2026-11-20T10:00:00Z'
		}
	} as never;
</script>

<DiffPage {data} />
