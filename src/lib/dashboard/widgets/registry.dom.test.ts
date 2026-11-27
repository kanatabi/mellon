// The registry seam after the tasks round: one new entry with the ANY-OF
// scope form, and the three content widgets untouched (single scope).
// `widgetHeld` is the ONE mount-gate rule the layout store, canvas and
// picker share — pinned here directly.
import { describe, expect, it } from 'vitest';
import { WIDGETS, widgetFor, widgetHeld } from './registry.ts';

const tasks = widgetFor('tasks')!;

describe('the widget registry — the tasks entry + the any-of gate', () => {
	it('registers Tasks with the tasks trio, the /tasks door and a sensible span', () => {
		expect(tasks.title).toBe('Tasks');
		expect(tasks.description).toContain('due');
		expect(tasks.href).toBe('/tasks');
		expect(tasks.scopes).toEqual(['tasks:create', 'tasks:update', 'tasks:manage']);
		expect(tasks.scope).toBeUndefined();
		expect(tasks.defaultSpan).toEqual({ col: 6, row: 5 });
		expect(tasks.minSpan).toEqual({ col: 2, row: 2 });
		expect(tasks.icon).toBeTruthy();
	});

	it('the any-of gate: ANY of the trio mounts it, none denies it', () => {
		for (const scope of tasks.scopes!) {
			expect(widgetHeld(tasks, (held) => held === scope)).toBe(true);
		}
		expect(widgetHeld(tasks, () => false)).toBe(false);
	});

	it('the existing three keep their single-scope semantics (no regression)', () => {
		const existing = WIDGETS.filter((w) => w.id !== 'tasks');
		expect(existing.map((w) => w.id)).toEqual(['recent-posts', 'recent-photos', 'recent-tags']);
		for (const w of existing) {
			expect(w.scope).toBe('content:manage');
			expect(w.scopes).toBeUndefined();
			expect(widgetHeld(w, (held) => held === 'content:manage')).toBe(true);
			expect(widgetHeld(w, () => false)).toBe(false);
		}
	});

	it('neither requirement = any authenticated user; scopes wins when both are set', () => {
		const open: typeof tasks = {
			id: 'synthetic',
			title: 'Synthetic',
			description: '',
			defaultSpan: { col: 2, row: 2 },
			minSpan: { col: 2, row: 2 },
			body: tasks.body
		};
		expect(widgetHeld(open, () => false)).toBe(true);
		// scopes is the any-of authority — the single scope is not consulted
		expect(
			widgetHeld({ ...tasks, scope: 'content:manage' }, (held) => held === 'tasks:update')
		).toBe(true);
	});

	it('ids are unique', () => {
		expect(new Set(WIDGETS.map((w) => w.id)).size).toBe(WIDGETS.length);
	});
});
