import type { Command } from '#lib/commands.ts';
import type { TaskItem, TaskProject, TaskView } from '#lib/api/types.ts';
import { TASK_SORTS, type TaskSort } from './list.ts';

/**
 * The tasks workspace's palette verbs — pure, node-tested.
 *
 * The page owns state; this builder owns ROWS. It exists so the command set is
 * testable without a DOM (the same reason `command-kit.ts` is pure) and so the
 * tasks page never grows a second, drifting command table.
 */

const VIEW_LABEL: Record<TaskView, string> = {
	today: 'My day',
	upcoming: 'Upcoming',
	all: 'All'
};

export const TASK_VIEWS: TaskView[] = ['today', 'upcoming', 'all'];

export interface TaskCommandOpts {
	view: TaskView;
	projectId: string | null;
	sort: TaskSort;
	projects: readonly TaskProject[];
	/** The current view's tasks (already filtered/sorted by the page) — the
	 *  palette rows are the SAME tasks the list shows. */
	tasks: readonly TaskItem[];
	canCreate: boolean;
	inviteCount: number;
	setView: (view: TaskView) => void;
	setProject: (projectId: string | null) => void;
	setSort: (sort: TaskSort) => void;
	openTask: (taskId: string) => void;
	newTask: () => void;
	newProject: () => void;
	reviewInvites: () => void;
}

export function taskCommands(opts: TaskCommandOpts): Command[] {
	const {
		view,
		projectId,
		sort,
		projects,
		tasks,
		canCreate,
		inviteCount,
		setView,
		setProject,
		setSort,
		openTask,
		newTask,
		newProject,
		reviewInvites
	} = opts;

	const rows: Command[] = [];

	if (canCreate && projects.length > 0) {
		rows.push({
			id: 'task.new',
			title: 'New task',
			group: 'actions',
			run: newTask
		});
	}
	if (canCreate) {
		rows.push({
			id: 'task.new-project',
			title: 'New project',
			group: 'actions',
			run: newProject
		});
	}

	rows.push({
		id: 'task.view',
		title: 'View',
		group: 'actions',
		children: TASK_VIEWS.map((v) => ({
			id: `task.view.${v}`,
			title: VIEW_LABEL[v],
			group: 'actions' as const,
			...(view === v ? { shortcut: '✓' } : {}),
			run: () => setView(v)
		}))
	});

	if (projects.length > 0) {
		rows.push({
			id: 'task.project',
			title: 'Project filter',
			group: 'actions',
			children: [
				{
					id: 'task.project.all',
					title: 'All projects',
					group: 'actions' as const,
					...(projectId === null ? { shortcut: '✓' } : {}),
					run: () => setProject(null)
				},
				...projects.map((project) => ({
					id: `task.project.${project.id}`,
					title: project.name,
					group: 'actions' as const,
					...(projectId === project.id ? { shortcut: '✓' } : {}),
					run: () => setProject(project.id)
				}))
			]
		});
	}

	rows.push({
		id: 'task.sort',
		title: 'Sort tasks',
		group: 'actions',
		children: TASK_SORTS.map((option) => ({
			id: `task.sort.${option.value}`,
			title: option.label,
			group: 'actions' as const,
			...(sort === option.value ? { shortcut: '✓' } : {}),
			run: () => setSort(option.value)
		}))
	});

	if (inviteCount > 0) {
		rows.push({
			id: 'task.invites',
			title: `Review invitations (${inviteCount})`,
			group: 'actions',
			run: reviewInvites
		});
	}

	// Flat rows, not a submenu: typing a task's title in ⌘K should land in its
	// drawer in one step. The list is bounded by the current view/project.
	for (const task of tasks) {
		rows.push({
			id: `task.open.${task.id}`,
			title: task.title,
			group: 'tasks',
			shortcut: task.done ? `${task.projectName} · done` : task.projectName,
			run: () => openTask(task.id)
		});
	}

	return rows;
}
