<!-- Fixture: the REAL photos list page with stubbed load data — the mount
	smoke (the v4.0.0 hydration 500: `bind:ref={undefined}` against the
	cast's `ref = $bindable(null)`). -->
<script lang="ts">
	import PhotosPage from './+page.svelte';

	const data = {
		photos: [],
		total: 0,
		totalPages: 1,
		page: 1,
		upload: false,
		collections: [],
		q: undefined,
		activeCollections: [],
		gallery: undefined,
		from: undefined,
		to: undefined,
		sort: 'created',
		dir: 'desc'
	} as never;
</script>

<PhotosPage {data} />
