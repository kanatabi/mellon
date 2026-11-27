<script lang="ts">
	import { ArrowUpDown, CircleDot, Flag, User, X } from 'lucide-svelte';
	import SectionCard from '#lib/components/SectionCard.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { tasksSections } from '#lib/sections.svelte.ts';
	import {
		TASK_SORTS,
		type TaskAssigneeFilter,
		type TaskAssigneeOption,
		type TaskPriorityFilter,
		type TaskSort,
		type TaskStatusFilter
	} from '#lib/tasks/list.ts';

	/**
	 * The tasks filters — the same RIGHT-RAIL anatomy as the posts/photos
	 * listing pages (2026-11-27, owner call): collapsible/reorderable panes on
	 * wide screens, the same body in a bottom sheet below xl. Everything here
	 * is client-side over the LOADED view; lumen still owns the view's day math
	 * and membership scope. The assignee vocabulary is the people the loaded
	 * rows actually show — see assigneeOptions().
	 */
	interface Props {
		/** Desktop rail = movables + drag handles; the sheet = flat. */
		movable: boolean;
		status: TaskStatusFilter;
		assignee: TaskAssigneeFilter;
		priority: TaskPriorityFilter;
		sort: TaskSort;
		assignees: TaskAssigneeOption[];
		/** True when any filter (including the search query) is active. */
		active: boolean;
		onstatus: (value: TaskStatusFilter) => void;
		onassignee: (value: TaskAssigneeFilter) => void;
		onpriority: (value: TaskPriorityFilter) => void;
		onsort: (value: TaskSort) => void;
		onclear: () => void;
	}

	let {
		movable,
		status,
		assignee,
		priority,
		sort,
		assignees,
		active,
		onstatus,
		onassignee,
		onpriority,
		onsort,
		onclear
	}: Props = $props();

	const STATUS_ITEMS: { value: TaskStatusFilter; label: string }[] = [
		{ value: 'all', label: 'any' },
		{ value: 'open', label: 'open' },
		{ value: 'done', label: 'done' }
	];

	const PRIORITY_ITEMS: { value: TaskPriorityFilter; label: string }[] = [
		{ value: 'all', label: 'any' },
		{ value: 'high', label: 'high' },
		{ value: 'medium', label: 'medium' },
		{ value: 'low', label: 'low' },
		{ value: 'none', label: 'none' }
	];

	const assigneeItems = $derived<{ value: TaskAssigneeFilter; label: string }[]>([
		{ value: 'all', label: 'anyone' },
		{ value: 'unassigned', label: 'unassigned' },
		...assignees.map((option) => ({ value: option.id, label: option.label }))
	]);

	const chip =
		'rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none';
	const off =
		'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground';
	const on = 'border-brand bg-accent text-foreground';
</script>

<SectionCard
	id="status"
	reorderable={movable}
	label="status"
	icon={CircleDot}
	open={tasksSections.isOpen('status')}
	ontoggle={() => tasksSections.toggle('status')}
	onmove={(d) => tasksSections.move('status', d)}
	order={movable ? tasksSections.pos('status') : undefined}
>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
		{#each STATUS_ITEMS as option (option.value)}
			<button
				type="button"
				aria-pressed={status === option.value}
				class="{chip} {status === option.value ? on : off}"
				onclick={() => onstatus(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</SectionCard>

<SectionCard
	id="assignee"
	reorderable={movable}
	label="assignee"
	icon={User}
	open={tasksSections.isOpen('assignee')}
	ontoggle={() => tasksSections.toggle('assignee')}
	onmove={(d) => tasksSections.move('assignee', d)}
	order={movable ? tasksSections.pos('assignee') : undefined}
>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by assignee">
		{#each assigneeItems as option (option.value)}
			<button
				type="button"
				aria-pressed={assignee === option.value}
				class="{chip} {assignee === option.value ? on : off}"
				onclick={() => onassignee(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</SectionCard>

<SectionCard
	id="priority"
	reorderable={movable}
	label="priority"
	icon={Flag}
	open={tasksSections.isOpen('priority')}
	ontoggle={() => tasksSections.toggle('priority')}
	onmove={(d) => tasksSections.move('priority', d)}
	order={movable ? tasksSections.pos('priority') : undefined}
>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by priority">
		{#each PRIORITY_ITEMS as option (option.value)}
			<button
				type="button"
				aria-pressed={priority === option.value}
				class="{chip} {priority === option.value ? on : off}"
				onclick={() => onpriority(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</SectionCard>

<SectionCard
	id="sort"
	reorderable={movable}
	label="sort"
	icon={ArrowUpDown}
	open={tasksSections.isOpen('sort')}
	ontoggle={() => tasksSections.toggle('sort')}
	onmove={(d) => tasksSections.move('sort', d)}
	order={movable ? tasksSections.pos('sort') : undefined}
>
	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Sort tasks">
		{#each TASK_SORTS as option (option.value)}
			<button
				type="button"
				aria-pressed={sort === option.value}
				class="{chip} {sort === option.value ? on : off}"
				onclick={() => onsort(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
</SectionCard>

<!-- The rail footers own the LAST flex slot: panes start at order 0, so an
     un-ordered footer ties with the first pane and lands mid-rail. -->
<div class="flex flex-col gap-3" style="order:999">
	{#if active}
		<Button
			type="button"
			variant="quiet"
			class="w-full justify-center gap-1 px-2.5 py-1"
			onclick={onclear}
		>
			<X class="size-3.5" aria-hidden="true" />
			clear filters
		</Button>
	{/if}

	<p class="text-xs leading-relaxed text-muted-foreground/60">
		filters apply to the loaded view — lumen owns the day math
	</p>
</div>
