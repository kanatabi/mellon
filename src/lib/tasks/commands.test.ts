import { describe, expect, it, vi } from 'vitest';
import type { TaskItem, TaskProject } from '#lib/api/types.ts';
import { taskCommands, type TaskCommandOpts } from './commands.ts';

function project(id: string, name: string, over: Partial<TaskProject> = {}): TaskProject {
	return {
		id,
		name,
		role: 'admin',
		creatorId: 'u1',
		completedAt: null,
		createdAt: '2026-11-01T00:00:00Z',
		updatedAt: '2026-11-01T00:00:00Z',
		taskCount: 0,
		openCount: 0,
		...over
	};
}

function task(over: Partial<TaskItem> & { id: string; title: string }): TaskItem {
	return {
		projectId: 'p1',
		projectName: 'Home',
		creatorId: 'u1',
		creatorName: 'admin',
		assignedTo: null,
		assigneeName: null,
		notes: '',
		priority: 'none',
		dueAt: null,
		done: false,
		doneAt: null,
		createdAt: '2026-11-01T00:00:00Z',
		updatedAt: '2026-11-01T00:00:00Z',
		commentCount: 0,
		subtaskCount: 0,
		subtaskDone: 0,
		...over
	};
}

function opts(over: Partial<TaskCommandOpts> = {}): TaskCommandOpts {
	return {
		view: 'today',
		projectId: null,
		sort: 'due',
		projects: [project('p1', 'Home'), project('p2', 'Work')],
		tasks: [
			task({ id: 't1', title: 'Fix the roof' }),
			task({ id: 't2', title: 'Ship the blog', projectId: 'p2', projectName: 'Work', done: true })
		],
		canCreate: true,
		inviteCount: 0,
		setView: vi.fn(),
		setProject: vi.fn(),
		setSort: vi.fn(),
		openTask: vi.fn(),
		newTask: vi.fn(),
		newProject: vi.fn(),
		reviewInvites: vi.fn(),
		...over
	};
}

const byId = (rows: ReturnType<typeof taskCommands>, id: string) => rows.find((r) => r.id === id);

describe('the tasks palette verbs', () => {
	it('offers every action for a creator with projects', () => {
		const rows = taskCommands(opts());
		expect(rows.map((r) => r.id)).toEqual(
			expect.arrayContaining([
				'task.new',
				'task.new-project',
				'task.view',
				'task.project',
				'task.sort',
				'task.open.t1',
				'task.open.t2'
			])
		);
	});

	it('gates creation on tasks:create', () => {
		const rows = taskCommands(opts({ canCreate: false }));
		expect(byId(rows, 'task.new')).toBeUndefined();
		expect(byId(rows, 'task.new-project')).toBeUndefined();
		// reads/control survive: update-only and manage-only holders still work
		expect(byId(rows, 'task.view')).toBeTruthy();
		expect(byId(rows, 'task.open.t1')).toBeTruthy();
	});

	it('hides New task until a project exists (the composer needs a home)', () => {
		const rows = taskCommands(opts({ projects: [], tasks: [] }));
		expect(byId(rows, 'task.new')).toBeUndefined();
		expect(byId(rows, 'task.new-project')).toBeTruthy();
		expect(byId(rows, 'task.project')).toBeUndefined();
	});

	it('marks the current view, project and sort', () => {
		const rows = taskCommands(opts({ view: 'upcoming', projectId: 'p2', sort: 'priority' }));
		const view = byId(rows, 'task.view');
		const project = byId(rows, 'task.project');
		const sort = byId(rows, 'task.sort');
		expect(view?.children?.find((c) => c.id === 'task.view.upcoming')?.shortcut).toBe('✓');
		expect(view?.children?.find((c) => c.id === 'task.view.today')?.shortcut).toBeUndefined();
		expect(project?.children?.find((c) => c.id === 'task.project.p2')?.shortcut).toBe('✓');
		expect(project?.children?.find((c) => c.id === 'task.project.all')?.shortcut).toBeUndefined();
		expect(sort?.children?.find((c) => c.id === 'task.sort.priority')?.shortcut).toBe('✓');
		expect(sort?.children?.find((c) => c.id === 'task.sort.due')?.shortcut).toBeUndefined();
	});

	it('routes a picked child to the page setter', () => {
		const o = opts();
		const rows = taskCommands(o);
		byId(rows, 'task.view')
			?.children?.find((c) => c.id === 'task.view.all')
			?.run?.();
		byId(rows, 'task.project')
			?.children?.find((c) => c.id === 'task.project.p1')
			?.run?.();
		byId(rows, 'task.sort')
			?.children?.find((c) => c.id === 'task.sort.name')
			?.run?.();
		byId(rows, 'task.open.t1')?.run?.();
		expect(o.setView).toHaveBeenCalledWith('all');
		expect(o.setProject).toHaveBeenCalledWith('p1');
		expect(o.setSort).toHaveBeenCalledWith('name');
		expect(o.openTask).toHaveBeenCalledWith('t1');
	});

	it('shows the invites row only when an invitation is waiting', () => {
		expect(byId(taskCommands(opts({ inviteCount: 2 })), 'task.invites')?.title).toBe(
			'Review invitations (2)'
		);
		expect(byId(taskCommands(opts({ inviteCount: 0 })), 'task.invites')).toBeUndefined();
	});

	it('carries each task with its project hint (and done state)', () => {
		const rows = taskCommands(opts());
		const t1 = byId(rows, 'task.open.t1');
		const t2 = byId(rows, 'task.open.t2');
		expect(t1?.group).toBe('tasks');
		expect(t1?.shortcut).toBe('Home');
		expect(t2?.shortcut).toBe('Work · done');
	});
});
