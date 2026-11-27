import { describe, expect, it } from 'vitest';
import { destinationCommands, visibleDestinationGroups } from './destinations.ts';

const nav = () => {};

const heldOf = (scopes: string[]) => (scope: string) => scopes.includes(scope);

describe('the destination table (rail + palette, one truth)', () => {
	it('offers Tasks when ANY of the tasks trio is held, and never otherwise', () => {
		for (const scope of ['tasks:create', 'tasks:update', 'tasks:manage']) {
			const groups = visibleDestinationGroups(heldOf([scope]));
			expect(groups.some((g) => g.items.some((i) => i.href === '/tasks'))).toBe(true);
		}
		const none = visibleDestinationGroups(heldOf([]));
		expect(none.some((g) => g.items.some((i) => i.href === '/tasks'))).toBe(false);
	});

	it('gates the control plane and admin groups on their scopes', () => {
		const none = visibleDestinationGroups(heldOf([]));
		expect(none.map((g) => g.label)).toEqual(['Home']);
		const editor = visibleDestinationGroups(heldOf(['content:manage']));
		expect(editor.map((g) => g.label)).toEqual(['Home', 'Content']);
		const admin = visibleDestinationGroups(heldOf(['secrets:admin', 'users:manage']));
		expect(admin.map((g) => g.label)).toEqual(['Home', 'Control plane', 'Admin']);
	});

	it('points Users at the real route (the old palette said /settings/users)', () => {
		const admin = visibleDestinationGroups(heldOf(['users:manage']));
		const users = admin.flatMap((g) => g.items).find((i) => i.id === 'go.users');
		expect(users?.href).toBe('/admin/users');
	});

	it('derives palette rows from the SAME filtered groups, ids unique', () => {
		const held = heldOf(['tasks:create', 'content:manage', 'secrets:admin', 'users:manage']);
		const rows = destinationCommands(visibleDestinationGroups(held), nav);
		const ids = rows.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(rows.find((r) => r.id === 'go.tasks')?.title).toBe('Tasks');
		expect(rows.find((r) => r.id === 'go.vault')?.title).toBe('Vault · edit values');
		expect(rows.every((r) => r.group === 'go to')).toBe(true);
	});

	it('drops every scoped row for a scope-less account', () => {
		const rows = destinationCommands(visibleDestinationGroups(heldOf([])), nav);
		expect(rows.map((r) => r.id)).toEqual(['go.dashboard']);
	});
});
