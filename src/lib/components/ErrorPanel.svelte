<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	const isDev = import.meta.env.DEV;

	/** Calm, keyboard-first error state shared by both boundaries. Hues follow
	 *  §11.3: red is reserved for DESTRUCTIVE confirmations — an error page is
	 *  a warning at most, so it speaks muted slate + one amber dot. */
	let {
		status,
		message = '',
		stack = ''
	}: {
		status: number;
		message?: string;
		stack?: string;
	} = $props();

	// A fetch failure surfaces as 500 with "lumen unreachable" — say the
	// honest thing instead of pretending the server had a bad day.
	const unreachable = $derived(/\bunreachable\b/i.test(message));

	const copy = $derived(
		status === 401
			? {
					label: 'session',
					title: 'Session ended',
					body: 'The portal no longer trusts this session — it expired, or was revoked from elsewhere.'
				}
			: status === 404
				? {
						label: 'route',
						title: 'Nothing lives here',
						body: 'That page or document does not exist (drafts you cannot see still exist — check the desk).'
					}
				: status === 409
					? {
							label: 'conflict',
							title: 'Write conflict',
							body: 'Someone saved first. The server refused to clobber it — reload to work from the current state.'
						}
					: status === 429 || unreachable || status === 503
						? {
								label: 'backend',
								title: 'lumen is not answering',
								body: 'The console reads and writes through lumen — nothing works until it is reachable again.'
							}
						: {
								label: 'internal',
								title: 'Something went sideways',
								body: 'The console hit an unexpected error. The desk and palette still work; retry this page first.'
							}
	);

	const warn = $derived(status >= 429 || unreachable);
	const primary = $derived(
		status === 401
			? { label: 'Sign in again', run: () => goto('/login') }
			: warn
				? { label: 'Retry', run: () => invalidateAll() }
				: { label: 'Back to desk', run: () => goto('/') }
	);
</script>

<div class="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center">
	<div
		class="text-2xs flex items-center gap-2 font-mono tracking-[0.22em] text-muted-foreground uppercase"
	>
		{#if warn}
			<span class="size-1.5 rounded-full bg-accent-amber" aria-hidden="true"></span>
		{/if}
		{copy.label}
	</div>

	<p class="font-mono text-6xl leading-none font-medium text-foreground/90 tabular-nums">
		{status}
	</p>

	<h1 class="font-brand text-2xl font-semibold tracking-tight">{copy.title}</h1>
	<p class="max-w-sm text-sm leading-6 text-muted-foreground">{copy.body}</p>

	<div class="mt-3 flex items-center gap-2">
		<!-- svelte-ignore a11y_autofocus -->
		<button
			class="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
			autofocus
			onclick={primary.run}
		>
			{primary.label}
		</button>
		{#if primary.label !== 'Back to desk'}
			<button
				class="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
				onclick={() => goto('/')}
			>
				Back to desk
			</button>
		{/if}
	</div>

	{#if warn && isDev}
		<p class="text-2xs mt-1 font-mono text-muted-foreground/80">
			dev loop: <span class="select-all">cd ../lumen && make dev</span>
		</p>
	{/if}

	{#if isDev && (message || stack)}
		<details class="mt-4 w-full text-left">
			<summary class="text-2xs cursor-pointer font-mono text-muted-foreground/70">
				diagnostics (dev only)
			</summary>
			<pre
				class="text-2xs mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 font-mono whitespace-pre-wrap text-muted-foreground">{message}{#if stack}\n\n{stack}{/if}</pre>
		</details>
	{/if}
</div>
