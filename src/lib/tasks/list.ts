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

/** The client-side filter (v1, per the plan): whitespace-separated terms,
 *  all of which must appear somewhere in the task's display text. Case-
 *  insensitive; not a search engine, just a finder over the loaded page. */
export function filterTasks(tasks: readonly TaskItem[], query: string): TaskItem[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [...tasks];
	return tasks.filter((task) => {
		const haystack = [task.title, task.projectName, task.assigneeName ?? '', task.notes]
			.join('\n')
			.toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}
