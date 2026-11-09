<script lang="ts">
	import ErrorPanel from '#lib/components/ErrorPanel.svelte';
	import { page } from '$app/state';

	const isDev = import.meta.env.DEV;

	// The unshelled boundary (login, unknown top-level routes): the wordmark
	// is the only chrome — this page sits outside the console on purpose.
</script>

<div class="flex min-h-svh flex-col">
	<header class="px-6 py-4">
		<a
			href="/"
			class="font-brand text-xl font-semibold tracking-tight"
			aria-label="gofar; console home"
		>
			gofar;
		</a>
	</header>
	<div class="flex flex-1 items-center justify-center px-6">
		<ErrorPanel
			status={page.status}
			message={page.error?.message ?? ''}
			stack={isDev ? ((page.error as { stack?: string } | undefined)?.stack ?? '') : ''}
		/>
	</div>
</div>
