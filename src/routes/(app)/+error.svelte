<script lang="ts">
	import ErrorPanel from '#lib/components/ErrorPanel.svelte';
	import { page } from '$app/state';

	const isDev = import.meta.env.DEV;

	// Rendered INSIDE the console shell — the rail, header and palette stay
	// alive around the error; navigating out is one keystroke away.
</script>

<ErrorPanel
	status={page.status}
	message={page.error?.message ?? ''}
	stack={isDev ? ((page.error as { stack?: string } | undefined)?.stack ?? '') : ''}
/>
