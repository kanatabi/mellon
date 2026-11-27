/**
 * The tasks workspace's presentation logic — pure, node-tested.
 *
 * Lumen owns the queries, the membership scoping, the day boundary and the
 * card rollup. What lives here is exactly the presentation the plan permits
 * client-side (C6): the SORT comparator over the loaded page, the client-side
 * search filter, and the grouping the grouped list renders. Nothing here
 * hides a task, re-derives "today", or pre-empts the server.
 */
import type { TaskItem, TaskPriority, TaskProject } from '#lib/api/types.ts';

/** The sub-sidebar's sort control (presentation only — lumen's order is
 *  untouched; a re-fetch simply returns the server's own order again). */
export type TaskSort = 'name' | 'due' | 'priority' | 'created' | 'status';

export const TASK_SORTS: { value: TaskSort; label: string }[] = [
	{ value: 'name', label: 'name' },
	{ value: 'due', label: 'due' },
	{ value: 'priority', label: 'priority' },
	{ value: 'created', label: 'created' },
	{ value: 'status', label: 'status' }
];

export const DEFAULT_TASK_SORT: TaskSort = 'due';

/** The workspace's client-side filters (presentation only, like the sort):
 *  they narrow the LOADED view — lumen still owns the view's day math and the
 *  membership scope. Status is the `done` flag; the assignee is a user id
 *  from the loaded rows (`unassigned` is the null door). */
export type TaskStatusFilter = 'all' | 'open' | 'done';
export type TaskAssigneeFilter = 'all' | 'unassigned' | string;
export type TaskPriorityFilter = 'all' | TaskPriority;

export interface TaskFilter {
	query?: string;
	status?: TaskStatusFilter;
	assignee?: TaskAssigneeFilter;
	priority?: TaskPriorityFilter;
}

export interface TaskAssigneeOption {
	/** The user id (the filter's stable value). */
	id: string;
	label: string;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
	high: 0,
	medium: 1,
	low: 2,
	none: 3
};

/** One project's slice of the loaded task list, in the workspace's project
 *  order. Empty groups are omitted — a project with no matching task is the
 *  empty state's business, not a ghost row's. */
export interface TaskGroup {
	projectId: string;
	projectName: string;
	/** The completed flag (C4): the group header states it, the tasks stay
	 *  readable — a completed project is a shelf, not a lock. */
	completed: boolean;
	tasks: TaskItem[];
}

export function groupTasksByProject(
	tasks: readonly TaskItem[],
	projects: readonly TaskProject[]
): TaskGroup[] {
	const groups = new Map<string, TaskGroup>();
	for (const project of projects) {
		groups.set(project.id, {
			projectId: project.id,
			projectName: project.name,
			completed: project.completedAt !== null,
			tasks: []
		});
	}
	for (const task of tasks) {
		let group = groups.get(task.projectId);
		if (!group) {
			// A task whose project is absent from the page can only be a
			// transient race (the project was removed between the two reads) —
			// keep the task visible under the name the task itself carries.
			group = {
				projectId: task.projectId,
				projectName: task.projectName,
				completed: false,
				tasks: []
			};
			groups.set(task.projectId, group);
		}
		group.tasks.push(task);
	}
	return [...groups.values()].filter((group) => group.tasks.length > 0);
}

function titleCompare(a: TaskItem, b: TaskItem): number {
	return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

function priorityCompare(a: TaskItem, b: TaskItem): number {
	return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

/** Nullable due instants sort LAST in both directions (an undated task is
 *  not "due yesterday" by accident). Invalid wire strings are treated the
 *  same — the server should never send one, and a crash helps nobody. */
function dueInstant(task: TaskItem): number {
	if (!task.dueAt) return Number.POSITIVE_INFINITY;
	const t = Date.parse(task.dueAt);
	return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function createdInstant(task: TaskItem): number {
	const t = Date.parse(task.createdAt);
	return Number.isFinite(t) ? t : 0;
}

function compareTasks(a: TaskItem, b: TaskItem, sort: TaskSort): number {
	switch (sort) {
		case 'name':
			return titleCompare(a, b);
		case 'due': {
			const d = dueInstant(a) - dueInstant(b);
			return d || priorityCompare(a, b) || titleCompare(a, b);
		}
		case 'priority':
			return priorityCompare(a, b) || dueInstant(a) - dueInstant(b) || titleCompare(a, b);
		case 'created':
			return createdInstant(b) - createdInstant(a) || titleCompare(a, b);
		case 'status':
			// open first, done last; among equals, the most urgent reads first
			return (
				Number(a.done) - Number(b.done) ||
				priorityCompare(a, b) ||
				dueInstant(a) - dueInstant(b) ||
				titleCompare(a, b)
			);
	}
}

/** A sorted COPY; every comparator ends at the task id, so equal rows never
 *  re-shuffle between refreshes. */
export function sortTasks(tasks: readonly TaskItem[], sort: TaskSort): TaskItem[] {
	return [...tasks].sort((a, b) => compareTasks(a, b, sort));
}

/** The client-side filter (v1, per the plan): status/assignee/priority over
 *  the loaded view + the whitespace-separated text finder. Case-insensitive;
 *  not a search engine, just a finder over the loaded page. */
export function filterTasks(tasks: readonly TaskItem[], filter: TaskFilter = {}): TaskItem[] {
	const terms = (filter.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
	const status = filter.status ?? 'all';
	const assignee = filter.assignee ?? 'all';
	const priority = filter.priority ?? 'all';
	return tasks.filter((task) => {
		if (status === 'open' && task.done) return false;
		if (status === 'done' && !task.done) return false;
		if (priority !== 'all' && task.priority !== priority) return false;
		if (assignee === 'unassigned' && task.assignedTo !== null) return false;
		if (assignee !== 'all' && assignee !== 'unassigned' && task.assignedTo !== assignee)
			return false;
		if (terms.length === 0) return true;
		const haystack = [task.title, task.projectName, task.assigneeName ?? '', task.notes]
			.join('\n')
			.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

/** The assignee filter's vocabulary: the people the LOADED view actually
 *  shows. A member with no task in the current view is absent by design —
 *  completing that list needs a workspace-members contract, not a guess. */
export function assigneeOptions(tasks: readonly TaskItem[]): TaskAssigneeOption[] {
	const byId = new Map<string, string>();
	for (const task of tasks) {
		if (!task.assignedTo) continue;
		byId.set(task.assignedTo, task.assigneeName ?? task.assignedTo);
	}
	return [...byId.entries()]
		.map(([id, label]) => ({ id, label }))
		.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}

/** True when at least one filter (including the text query) narrows the view —
 *  the toolbar's Clear door and the palette's row hang off this one truth. */
export function taskFilterActive(filter: TaskFilter): boolean {
	return (
		(filter.query ?? '').trim() !== '' ||
		(filter.status ?? 'all') !== 'all' ||
		(filter.assignee ?? 'all') !== 'all' ||
		(filter.priority ?? 'all') !== 'all'
	);
}
