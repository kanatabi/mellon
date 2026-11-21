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
			content: 'l0\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9',
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
