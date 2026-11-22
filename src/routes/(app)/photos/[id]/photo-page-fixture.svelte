<!-- Fixture: the REAL photo-detail page with stubbed load data — the mount
	smoke (the v4.0.0 hydration 500: `bind:ref={undefined}` against the
	cast's `ref = $bindable(null)`). The exif prop serves the EXIF block's
	two states: absent (default) = the honest empty state; a capture object
	= the rows. -->
<script lang="ts">
	import PhotoPage from './+page.svelte';

	interface Props {
		exif?: Record<string, unknown> | null;
	}

	let { exif = null }: Props = $props();

	const data = $derived({
		photo: {
			id: 'p1',
			src: 'http://localhost/api/media/p1',
			alt: 'a fixture photo',
			width: 4,
			height: 3,
			exif,
			gallery: false,
			collection: null,
			createdAt: '2026-11-21'
		},
		collections: [],
		references: []
	} as never);
</script>

<PhotoPage {data} />
