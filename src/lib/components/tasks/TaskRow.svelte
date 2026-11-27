<script lang="ts">
	import { Check, ListChecks, MessageSquare } from 'lucide-svelte';
	import type { TaskItem } from '#lib/api/types.ts';
	import { dueLabel, fullDateLabel, isOverdue } from '#lib/tasks/dates.ts';
	import PriorityBadge from './PriorityBadge.svelte';

	interface Props {
		task: TaskItem;
		/** A toggle is in flight — the box dims, the row stays readable. */
		busy: boolean;
		/** tasks:update. Without it the box is a status glyph, not a door. */
		canEdit: boolean;
		onopen: () => void;
		ontoggle: () => void;
	}

	let { task, busy, canEdit, onopen, ontoggle }: Props = $props();

	const overdue = $derived(isOverdue(task));
	const due = $derived(dueLabel(task.dueAt));
	const initial = $derived(task.assigneeName?.slice(0, 1).toUpperCase() ?? '');
</script>

<div
	class="group relative flex items-center gap-3 border-b border-border/60 px-2 py-2.5 transition-colors last:border-b-0 focus-within:bg-accent/30 hover:bg-accent/30"
	data-done={task.done ? 'true' : undefined}
>
	{#if canEdit}
		<button
			type="button"
			role="checkbox"
			aria-checked={task.done}
			aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
			disabled={busy}
			onclick={ontoggle}
			class="relative z-10 grid size-5 shrink-0 place-items-center rounded border transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:opacity-50 {task.done
				? 'border-brand bg-brand text-white'
				: 'border-border text-transparent hover:border-brand/60 hover:text-brand/50'} {busy
				? 'animate-pulse'
				: ''}"
		>
			<Check class="size-3.5" aria-hidden="true" />
		</button>
	{:else}
		<span
			class="grid size-5 shrink-0 place-items-center rounded border {task.done
				? 'border-brand/50 text-brand'
				: 'border-border text-transparent'}"
			aria-hidden="true"
		>
			<Check class="size-3.5" />
		</span>
		<span class="sr-only">{task.done ? 'done' : 'open'}</span>
	{/if}

	<div class="min-w-0 flex-1">
		<button
			type="button"
			onclick={onopen}
			class="block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:outline-none {task.done
				? 'text-muted-foreground line-through'
				: 'text-foreground'}"
		>
			{task.title}
		</button>
		<div
			class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-muted-foreground"
		>
			<span class="inline-flex items-center gap-1">
				{#if task.assigneeName}
					<span
						aria-hidden="true"
						class="grid size-3.5 place-items-center rounded-full bg-brand/15 text-[8px] font-bold text-brand uppercase"
					>
						{initial}
					</span>
					{task.assigneeName}
				{:else}
					unassigned
				{/if}
			</span>
			{#if task.dueAt}
				<span class={overdue ? 'text-accent-amber' : ''} title={fullDateLabel(task.dueAt)}>
					due {due}{#if overdue}
						· overdue{/if}
				</span>
			{/if}
		</div>
	</div>

	<div class="flex shrink-0 items-center gap-2.5 font-mono text-[10px] text-muted-foreground">
		<PriorityBadge priority={task.priority} />
		<span class="inline-flex items-center gap-1" title="{task.commentCount} comments">
			<MessageSquare class="size-3" aria-hidden="true" />
			<span class="sr-only">comments</span>
			{task.commentCount}
		</span>
		<span
			class="inline-flex items-center gap-1"
			title="{task.subtaskDone} of {task.subtaskCount} checklist items done"
		>
			<ListChecks class="size-3" aria-hidden="true" />
			<span class="sr-only">checklist done</span>
			{task.subtaskDone}/{task.subtaskCount}
		</span>
	</div>
</div>
