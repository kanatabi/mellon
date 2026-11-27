<script lang="ts">
	import { onMount } from 'svelte';
	import { client, ApiError } from '#lib/api/client.ts';
	import type { TaskPriority, TaskWorkspace } from '#lib/api/types.ts';

	/**
	 * The tasks widget body — the app-center's first app at a glance: the
	 * OPEN and DUE-TODAY cards plus the day's first few rows. Self-contained
	 * (the plugin seam): ONE fetch of `view=today` on mount. Lumen computes
	 * the day boundary in the browser's zone (the client sends
	 * `X-Client-Timezone`), so "today" is the reader's today. NO polling —
	 * a dashboard visit is one snapshot, like the other widgets.
	 *
	 * PREVIEW MODE (the picker): the real structure with placeholder
	 * content, never a fetch.
	 */
	let { preview = false }: { preview?: boolean } = $props();

	let workspace = $state<TaskWorkspace | null>(null);
	let loading = $state(true);
	let failed = $state('');

	/** The glance cap: this card summarizes, it never becomes the workspace. */
	const ROW_CAP = 4;

	const priorityDot: Record<TaskPriority, string> = {
		high: 'bg-danger',
		medium: 'bg-accent-amber',
		low: 'bg-accent-teal',
		none: 'border border-muted-foreground/40 bg-transparent'
	};

	async function load() {
		loading = true;
		failed = '';
		try {
			workspace = await client.tasksWorkspace({ view: 'today' });
		} catch (e) {
			// the house convention: lumen's copy verbatim, a quiet fallback otherwise
			failed = e instanceof ApiError ? e.message : 'could not load tasks';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (preview) {
			loading = false;
			return;
		}
		void load();
	});

	// lumen returns the view already ordered; the FE only trims for the card
	const rows = $derived((workspace?.tasks ?? []).slice(0, ROW_CAP));
	const allClear = $derived(
		workspace === null || workspace.stats.open > 0
			? 'all clear — nothing due today'
			: 'all clear — nothing open'
	);
</script>

{#if preview}
	<!-- the REAL structure (two cards + rows), placeholder content, no fetch -->
	<div data-slot="tasks-preview" class="flex flex-col gap-3">
		<div class="grid grid-cols-2 gap-2">
			{#each ['open', 'due today'] as label (label)}
				<div class="rounded-lg border border-border bg-background/60 px-3 py-2">
					<p class="font-mono text-[9px] tracking-widest text-muted-foreground/70 uppercase">
						{label}
					</p>
					<span class="mt-1 block h-5 w-8 animate-pulse rounded bg-muted/70"></span>
				</div>
			{/each}
		</div>
		<div class="flex flex-col gap-1">
			{#each [0, 1, 2] as i (i)}
				<div class="flex items-center gap-2 rounded-lg px-2 py-1.5">
					<span class="size-1.5 shrink-0 rounded-full border border-border"></span>
					<span class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="h-3 w-2/3 animate-pulse rounded bg-muted/70"></span>
						<span class="h-2 w-1/3 animate-pulse rounded bg-muted/50"></span>
					</span>
				</div>
			{/each}
		</div>
	</div>
{:else if loading}
	<div class="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading tasks">
		<div class="grid grid-cols-2 gap-2" aria-hidden="true">
			{#each [0, 1] as i (i)}
				<span class="h-14 animate-pulse rounded-lg bg-muted/60"></span>
			{/each}
		</div>
		<div class="flex flex-col gap-2" aria-hidden="true">
			{#each [0, 1, 2] as i (i)}
				<span class="h-9 animate-pulse rounded-lg bg-muted/60"></span>
			{/each}
		</div>
	</div>
{:else if failed}
	<div class="flex flex-col gap-2">
		<p class="text-xs leading-relaxed text-danger" role="alert">{failed}</p>
		<button
			type="button"
			onclick={() => void load()}
			class="w-fit rounded-md border border-border px-3 py-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase transition-colors hover:border-brand/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
		>
			Retry
		</button>
	</div>
{:else if workspace}
	<div class="flex flex-col gap-3">
		<div class="grid grid-cols-2 gap-2">
			<div class="rounded-lg border border-border bg-background/60 px-3 py-2">
				<p class="font-mono text-[9px] tracking-widest text-muted-foreground/70 uppercase">open</p>
				<p
					data-slot="tasks-open"
					class="mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums"
				>
					{workspace.stats.open}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-background/60 px-3 py-2">
				<p class="font-mono text-[9px] tracking-widest text-muted-foreground/70 uppercase">
					due today
				</p>
				<p
					data-slot="tasks-due-today"
					class="mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums"
				>
					{workspace.stats.dueToday}
				</p>
				{#if workspace.stats.overdue > 0}
					<p class="mt-0.5 font-mono text-[9px] text-danger">
						{workspace.stats.overdue} overdue
					</p>
				{/if}
			</div>
		</div>

		{#if rows.length === 0}
			<p class="px-2 py-4 text-xs text-muted-foreground">{allClear}</p>
		{:else}
			<div class="flex flex-col gap-1">
				{#each rows as task (task.id)}
					<div
						data-slot="tasks-row"
						class="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
					>
						<span
							class="size-1.5 shrink-0 rounded-full {priorityDot[task.priority]}"
							title="{task.priority} priority"
							data-priority={task.priority}
						>
							<span class="sr-only">{task.priority} priority</span>
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm">{task.title}</span>
							<span class="truncate font-mono text-[10px] text-muted-foreground/70">
								{task.projectName}
							</span>
						</span>
					</div>
				{/each}
			</div>
		{/if}

		<a
			href="/tasks"
			class="w-fit font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
		>
			Open tasks →
		</a>
	</div>
{/if}
