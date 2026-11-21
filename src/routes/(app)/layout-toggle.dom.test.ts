// The two-click bug, pinned (S2 round): the layout's onOpenChange wrapped
// navRail.setOpen in a SECOND negation (the rail's setter already stores the
// inverse of its open parameter), so `collapsed` ended up == open — the
// toggle inverted, and with the writable-derived override semantics the
// visible behavior became state-dependent (the owner's "collapses only on
// the second click"). This drives the REAL layout's footer toggle and
// asserts one click = one flip, in both directions, with persistence
// following every click.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { navRail } from '#lib/rails.svelte.ts';
import Fixture from './layout-toggle-fixture.svelte';

function railState(): string | undefined {
	return document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') ?? undefined;
}

describe('the rail toggle loop (one click, one flip)', () => {
	it('flips on EVERY click and persists each time', async () => {
		const { getByRole } = render(Fixture);
		const toggle = getByRole('button', { name: 'Collapse sidebar' });

		// click 1 — collapse, immediately
		toggle.click();
		await tick();
		expect(railState()).toBe('collapsed');
		expect(navRail.collapsed).toBe(true);

		// click 2 — expand again (the bug left this click doing nothing)
		toggle.click();
		await tick();
		expect(railState()).toBe('expanded');
		expect(navRail.collapsed).toBe(false);
	});
});
