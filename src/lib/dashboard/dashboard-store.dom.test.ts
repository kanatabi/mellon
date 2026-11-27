// The effect-loop regression (2026-11-24, the owner's console report):
// the page's $effect calls init() which WRITES entries — and init read
// `this.entries` back for the save, registering the effect's own write
// as a dependency → effect_update_depth_exceeded on every hydration.
// This fixture IS that pattern; pre-fix, rendering it alone explodes.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { WIDGETS } from './widgets/registry.ts';
import Fixture, { store } from './store-fixture.svelte';

describe('the layout store inside an effect (the depth-exceeded regression)', () => {
	it('renders without self-triggering — the effect writes, never loops', () => {
		const { getByTestId } = render(Fixture);
		expect(getByTestId('count').textContent).toBe(String(WIDGETS.length));
	});

	it('a repeat init for the SAME user no-ops — the entries reference holds', () => {
		render(Fixture);
		const before = store.entries;
		store.init('tester', WIDGETS);
		expect(store.entries).toBe(before);
	});

	it('a DIFFERENT user re-inits — the per-user key is the boundary', () => {
		render(Fixture);
		const before = store.entries;
		store.init('someone-else', WIDGETS);
		expect(store.entries).not.toBe(before);
	});

	it('first-run seeding honors the ANY-OF scopes: a tasks-only principal gets Tasks alone', () => {
		store.init('tasks-only', WIDGETS, (scope) => scope === 'tasks:update');
		expect(store.entries.map((e) => e.id)).toEqual(['tasks']);
	});

	it('a principal holding no widget scopes seeds an EMPTY canvas, never ghost cards', () => {
		store.init('no-widget-scopes', WIDGETS, () => false);
		expect(store.entries).toEqual([]);
	});
});
