import { describe, expect, it } from 'vitest';
import type { TaskItem, TaskProject } from '#lib/api/types.ts';
import { filterTasks, groupTasksByProject, sortTasks } from './list.ts';

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

describe('groupTasksByProject', () => {
	const home = project('p1', 'Home');
	const work = project('p2', 'Work', { completedAt: '2026-11-20T10:00:00Z' });

	it('follows the workspace project order and keeps task order inside a group', () => {
		const a = task({ id: 't-a', title: 'A', projectId: 'p2', projectName: 'Work' });
		const b = task({ id: 't-b', title: 'B' });
		const c = task({ id: 't-c', title: 'C', projectId: 'p2', projectName: 'Work' });
		const groups = groupTasksByProject([b, a, c], [home, work]);
		expect(groups.map((g) => g.projectId)).toEqual(['p1', 'p2']);
		expect(groups[0].tasks.map((t) => t.id)).toEqual(['t-b']);
		expect(groups[1].tasks.map((t) => t.id)).toEqual(['t-a', 't-c']);
	});

	it('omits empty projects and carries the completed flag', () => {
		const groups = groupTasksByProject(
			[task({ id: 't-a', title: 'A', projectId: 'p2' })],
			[home, work]
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].projectId).toBe('p2');
		expect(groups[0].completed).toBe(true);
	});

	it('keeps an orphaned task visible under the name it carries', () => {
		const orphan = task({ id: 't-x', title: 'X', projectId: 'gone', projectName: 'Old shelf' });
		const groups = groupTasksByProject([orphan], [home]);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			projectId: 'gone',
			projectName: 'Old shelf',
			completed: false
		});
	});

	it('returns no groups for no tasks', () => {
		expect(groupTasksByProject([], [home, work])).toEqual([]);
	});
});

describe('sortTasks', () => {
	it('sorts by name case-insensitively', () => {
		const rows = [
			task({ id: '1', title: 'banana' }),
			task({ id: '2', title: 'Apple' }),
			task({ id: '3', title: 'cherry' })
		];
		expect(sortTasks(rows, 'name').map((t) => t.title)).toEqual(['Apple', 'banana', 'cherry']);
	});

	it('sorts by due with undated tasks last and priority as the tiebreak', () => {
		const rows = [
			task({ id: 'none', title: 'undated' }),
			task({ id: 'later', title: 'later', dueAt: '2026-11-30T10:00:00Z' }),
			task({
				id: 'sooner-low',
				title: 'sooner low',
				dueAt: '2026-11-28T10:00:00Z',
				priority: 'low'
			}),
			task({
				id: 'sooner-high',
				title: 'sooner high',
				dueAt: '2026-11-28T10:00:00Z',
				priority: 'high'
			})
		];
		expect(sortTasks(rows, 'due').map((t) => t.id)).toEqual([
			'sooner-high',
			'sooner-low',
			'later',
			'none'
		]);
	});

	it('sorts by priority high → none with due as the tiebreak', () => {
		const rows = [
			task({ id: 'none', title: 'none', priority: 'none' }),
			task({ id: 'low', title: 'low', priority: 'low' }),
			task({ id: 'medium', title: 'medium', priority: 'medium' }),
			task({
				id: 'high-late',
				title: 'high late',
				priority: 'high',
				dueAt: '2026-12-01T10:00:00Z'
			}),
			task({ id: 'high-soon', title: 'high soon', priority: 'high', dueAt: '2026-11-28T10:00:00Z' })
		];
		expect(sortTasks(rows, 'priority').map((t) => t.id)).toEqual([
			'high-soon',
			'high-late',
			'medium',
			'low',
			'none'
		]);
	});

	it('sorts by created newest first', () => {
		const rows = [
			task({ id: 'middle', title: 'middle', createdAt: '2026-11-10T10:00:00Z' }),
			task({ id: 'oldest', title: 'oldest', createdAt: '2026-11-01T10:00:00Z' }),
			task({ id: 'newest', title: 'newest', createdAt: '2026-11-20T10:00:00Z' })
		];
		expect(sortTasks(rows, 'created').map((t) => t.id)).toEqual(['newest', 'middle', 'oldest']);
	});

	it('sorts open before done, then by priority', () => {
		const rows = [
			task({ id: 'done-high', title: 'done high', done: true, priority: 'high' }),
			task({ id: 'open-low', title: 'open low', priority: 'low' }),
			task({ id: 'open-high', title: 'open high', priority: 'high' })
		];
		expect(sortTasks(rows, 'status').map((t) => t.id)).toEqual([
			'open-high',
			'open-low',
			'done-high'
		]);
	});

	it('does not mutate its input', () => {
		const rows = [task({ id: '2', title: 'B' }), task({ id: '1', title: 'A' })];
		const before = rows.map((t) => t.id);
		const sorted = sortTasks(rows, 'name');
		expect(rows.map((t) => t.id)).toEqual(before);
		expect(sorted).not.toBe(rows);
	});

	it('is stable by id for fully equal rows', () => {
		const one = task({ id: 'a', title: 'Same' });
		const two = task({ id: 'b', title: 'Same' });
		expect(sortTasks([two, one], 'name').map((t) => t.id)).toEqual(['a', 'b']);
		expect(sortTasks([one, two], 'name').map((t) => t.id)).toEqual(['a', 'b']);
	});
});

describe('filterTasks', () => {
	const rows = [
		task({
			id: 'gate',
			title: 'Fix the gate',
			projectName: 'Home',
			assigneeName: 'sarah',
			notes: 'hinge oil'
		}),
		task({ id: 'paint', title: 'Buy paint', projectName: 'Studio', notes: 'egg shell' }),
		task({ id: 'tax', title: 'File taxes', projectName: 'Home' })
	];

	it('returns a copy for an empty query', () => {
		const out = filterTasks(rows, '   ');
		expect(out).toHaveLength(3);
		expect(out).not.toBe(rows);
	});

	it('is case-insensitive and searches title, project, assignee and notes', () => {
		expect(filterTasks(rows, 'FIX').map((t) => t.id)).toEqual(['gate']);
		expect(filterTasks(rows, 'studio').map((t) => t.id)).toEqual(['paint']);
		expect(filterTasks(rows, 'SARAH').map((t) => t.id)).toEqual(['gate']);
		expect(filterTasks(rows, 'hinge').map((t) => t.id)).toEqual(['gate']);
	});

	it('requires every whitespace-separated term', () => {
		expect(filterTasks(rows, 'fix gate').map((t) => t.id)).toEqual(['gate']);
		expect(filterTasks(rows, 'fix paint')).toEqual([]);
	});

	it('returns an empty list when nothing matches', () => {
		expect(filterTasks(rows, 'nothing')).toEqual([]);
	});
});
