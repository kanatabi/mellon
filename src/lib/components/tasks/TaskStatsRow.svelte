<script lang="ts">
	import type { TaskStats } from '#lib/api/types.ts';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';

	interface Props {
		stats: TaskStats | null;
		loading: boolean;
	}

	let { stats, loading }: Props = $props();

	const cards = $derived([
		{
			key: 'open',
			label: 'open',
			value: stats?.open ?? 0,
			hint: 'every open task across your projects',
			tone: ''
		},
		{
			key: 'dueToday',
			label: 'due today',
			value: stats?.dueToday ?? 0,
			hint: 'due inside today, across your projects — lumen reads the day in your timezone',
			tone: (stats?.dueToday ?? 0) > 0 ? 'text-brand' : ''
		},
		{
			key: 'completedWeek',
			label: 'completed this week',
			value: stats?.completedWeek ?? 0,
			hint: 'completed this week, across your projects',
			tone: ''
		},
		{
			key: 'overdue',
			label: 'overdue',
			value: stats?.overdue ?? 0,
			hint: 'open tasks whose due day has passed, across your projects',
			tone: (stats?.overdue ?? 0) > 0 ? 'text-accent-amber' : ''
		}
	]);
</script>

<div
	class="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4"
	role="group"
	aria-label="Task statistics"
>
	{#each cards as card (card.key)}
		<div class="rounded-lg border border-border bg-card px-3 py-2.5" title={card.hint}>
			<p class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
				{card.label}
			</p>
			{#if loading}
				<Skeleton class="mt-1.5 h-7 w-9" />
			{:else}
				<p class="mt-0.5 font-mono text-2xl leading-none font-semibold tabular-nums {card.tone}">
					{card.value}
				</p>
			{/if}
		</div>
	{/each}
</div>
