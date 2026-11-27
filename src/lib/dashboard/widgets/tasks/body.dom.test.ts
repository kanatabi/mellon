// The tasks widget body: ONE `view=today` fetch on mount (the browser
// client stamps the reader's IANA zone), the open/due-today cards, the
// capped row list, the quiet all-clear and the quiet inline error + Retry.
// Preview mode renders the real structure with placeholders and NEVER
// touches the relay. The client is mocked — the wire lives in api.test.ts.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskItem, TaskStats, TaskWorkspace } from '#lib/api/types.ts';
import { ApiError } from '#lib/api/client.ts';
import TasksBody from './body.svelte';

const api = vi.hoisted(() => ({ tasksWorkspace: vi.fn() }));

vi.mock('#lib/api/client.ts', () => {
	class MockApiError extends Error {
		readonly status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = 'ApiError';
			this.status = status;
		}
	}
	return { client: api, ApiError: MockApiError };
});

function task(overrides: Partial<TaskItem> = {}): TaskItem {
	return {
		id: 't1',
		projectId: 'p1',
		projectName: 'Home',
		creatorId: 'u1',
		creatorName: 'admin',
		assignedTo: 'u1',
		assigneeName: 'admin',
		title: 'Fix the gate',
		notes: '',
		priority: 'high',
		dueAt: '2026-11-27T10:00:00Z',
		done: false,
		doneAt: null,
		createdAt: '2026-11-20T10:00:00Z',
		updatedAt: '2026-11-20T10:00:00Z',
		commentCount: 0,
		subtaskCount: 0,
		subtaskDone: 0,
		...overrides
	};
}

function workspace(tasks: TaskItem[], stats: Partial<TaskStats> = {}): TaskWorkspace {
	return {
		projects: [],
		tasks,
		stats: { open: 5, dueToday: 2, completedWeek: 7, overdue: 1, ...stats }
	};
}

beforeEach(() => {
	api.tasksWorkspace.mockReset();
});

describe('the tasks widget body', () => {
	it('fetches view=today once, then renders the counts, the overdue hint and the rows', async () => {
		api.tasksWorkspace.mockResolvedValue(
			workspace([
				task(),
				task({ id: 't2', title: 'Water the plants', projectName: 'Garden', priority: 'low' })
			])
		);
		const c = render(TasksBody);
		expect(screen.getByRole('status', { name: 'Loading tasks' })).toBeTruthy();

		await waitFor(() => expect(c.container.querySelector('[data-slot="tasks-open"]')).toBeTruthy());
		expect(api.tasksWorkspace).toHaveBeenCalledTimes(1);
		expect(api.tasksWorkspace).toHaveBeenCalledWith({ view: 'today' });
		expect(c.container.querySelector('[data-slot="tasks-open"]')?.textContent?.trim()).toBe('5');
		expect(c.container.querySelector('[data-slot="tasks-due-today"]')?.textContent?.trim()).toBe(
			'2'
		);
		expect(c.container.textContent).toContain('1 overdue');

		const rows = c.container.querySelectorAll('[data-slot="tasks-row"]');
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('Fix the gate');
		expect(rows[0].textContent).toContain('Home');
		expect(rows[0].querySelector('[data-priority="high"]')).toBeTruthy();
		expect(rows[1].textContent).toContain('Water the plants');
		expect(rows[1].textContent).toContain('Garden');
	});

	it('caps the day list at four rows — a glance, not the workspace', async () => {
		api.tasksWorkspace.mockResolvedValue(
			workspace(Array.from({ length: 6 }, (_, i) => task({ id: `t${i}`, title: `Task ${i}` })))
		);
		const c = render(TasksBody);
		await waitFor(() =>
			expect(c.container.querySelectorAll('[data-slot="tasks-row"]')).toHaveLength(4)
		);
		expect(c.container.textContent).not.toContain('Task 4');
	});

	it('shows the quiet all-clear when nothing is open', async () => {
		api.tasksWorkspace.mockResolvedValue(
			workspace([], { open: 0, dueToday: 0, completedWeek: 0, overdue: 0 })
		);
		const c = render(TasksBody);
		await waitFor(() => expect(c.container.textContent).toContain('all clear — nothing open'));
		expect(c.container.querySelector('[data-slot="tasks-open"]')?.textContent?.trim()).toBe('0');
		expect(c.container.querySelector('[data-slot="tasks-row"]')).toBeNull();
	});

	it('says nothing due today when open work exists but the day is clear', async () => {
		api.tasksWorkspace.mockResolvedValue(
			workspace([], { open: 3, dueToday: 0, completedWeek: 0, overdue: 0 })
		);
		const c = render(TasksBody);
		await waitFor(() => expect(c.container.textContent).toContain('all clear — nothing due today'));
	});

	it('shows the quiet inline error and recovers through Retry', async () => {
		api.tasksWorkspace.mockRejectedValueOnce(new ApiError(503, 'the admin plane is unreachable'));
		const c = render(TasksBody);

		const alert = await waitFor(() => {
			const el = c.container.querySelector<HTMLElement>('[role="alert"]');
			expect(el).toBeTruthy();
			return el!;
		});
		// lumen's copy verbatim (the ghost-field rule), never a thrown page
		expect(alert.textContent).toContain('the admin plane is unreachable');
		expect(c.container.querySelector('[data-slot="tasks-row"]')).toBeNull();

		api.tasksWorkspace.mockResolvedValueOnce(workspace([task()]));
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(c.container.querySelector('[data-slot="tasks-row"]')).toBeTruthy());
		expect(api.tasksWorkspace).toHaveBeenCalledTimes(2);
	});

	it('preview renders the real structure with placeholders and NEVER fetches', async () => {
		const c = render(TasksBody, { props: { preview: true } });
		await tick();
		expect(c.container.querySelector('[data-slot="tasks-preview"]')).toBeTruthy();
		expect(c.container.querySelectorAll('[data-slot="tasks-row"]')).toHaveLength(0);
		expect(api.tasksWorkspace).not.toHaveBeenCalled();
	});
});
