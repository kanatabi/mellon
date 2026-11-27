<script lang="ts">
	import { X } from 'lucide-svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import {
		TASK_SORTS,
		type TaskAssigneeFilter,
		type TaskAssigneeOption,
		type TaskPriorityFilter,
		type TaskSort,
		type TaskStatusFilter
	} from '#lib/tasks/list.ts';

	/**
	 * The tasks toolbar's filter row (2026-11-27): status/assignee/priority +
	 * the sort control, all client-side over the LOADED view (lumen still owns
	 * the view's day math and membership scope). The assignee vocabulary is the
	 * people the loaded rows actually show — see assigneeOptions().
	 */
	interface Props {
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

	const STATUS_ITEMS = [
		{ value: 'all', label: 'any status' },
		{ value: 'open', label: 'open' },
		{ value: 'done', label: 'done' }
	];

	const PRIORITY_ITEMS = [
		{ value: 'all', label: 'any priority' },
		{ value: 'high', label: 'high' },
		{ value: 'medium', label: 'medium' },
		{ value: 'low', label: 'low' },
		{ value: 'none', label: 'none' }
	];

	const SORT_ITEMS = TASK_SORTS.map((option) => ({
		value: option.value,
		label: `sort: ${option.label}`
	}));

	const assigneeItems = $derived([
		{ value: 'all', label: 'anyone' },
		{ value: 'unassigned', label: 'unassigned' },
		...assignees.map((option) => ({ value: option.id, label: option.label }))
	]);
</script>

<div class="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Task filters">
	<Select.Root
		type="single"
		items={STATUS_ITEMS}
		value={status}
		onValueChange={(next) => onstatus(next as TaskStatusFilter)}
	>
		<Select.Trigger size="sm" aria-label="Filter by task status">
			<Select.Value />
		</Select.Trigger>
		<Select.Content>
			{#each STATUS_ITEMS as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>

	<Select.Root
		type="single"
		items={assigneeItems}
		value={assignee}
		onValueChange={(next) => onassignee(next as TaskAssigneeFilter)}
	>
		<Select.Trigger size="sm" aria-label="Filter by assignee">
			<Select.Value />
		</Select.Trigger>
		<Select.Content>
			{#each assigneeItems as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>

	<Select.Root
		type="single"
		items={PRIORITY_ITEMS}
		value={priority}
		onValueChange={(next) => onpriority(next as TaskPriorityFilter)}
	>
		<Select.Trigger size="sm" aria-label="Filter by task priority">
			<Select.Value />
		</Select.Trigger>
		<Select.Content>
			{#each PRIORITY_ITEMS as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>

	<span class="mx-0.5 h-4 w-px bg-border" aria-hidden="true"></span>

	<Select.Root
		type="single"
		items={SORT_ITEMS}
		value={sort}
		onValueChange={(next) => onsort(next as TaskSort)}
	>
		<Select.Trigger size="sm" aria-label="Sort tasks">
			<Select.Value />
		</Select.Trigger>
		<Select.Content>
			{#each SORT_ITEMS as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>

	{#if active}
		<Button type="button" variant="quiet" class="gap-1 px-2.5 py-1" onclick={onclear}>
			<X class="size-3.5" aria-hidden="true" />
			clear filters
		</Button>
	{/if}
</div>
