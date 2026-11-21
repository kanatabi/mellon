// Renders the REAL AppSidebar and inspects the classes that carry the
// rail's look — written against the S2 round's live reports (hover fade,
// collapsed centering, typography) so regressions here are test failures,
// not screenshot surprises. NOTE: with `tooltipContent` set, the row anchor
// becomes the tooltip trigger, so bits-ui's data-slot wins — select on
// tooltip-trigger.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './rail-fixture.svelte';

function firstRow() {
	const { container } = render(Fixture);
	const row = container.querySelector('a[data-slot="tooltip-trigger"]');
	expect(row, 'the nav row anchor').toBeTruthy();
	return row as HTMLElement;
}

describe('the rail’s carried classes (live S2 reports)', () => {
	it('data-active is PRESENT only on the active row (presence-variant semantics)', () => {
		// the bolder-font bug: MenuButton wrote data-active="false", and the
		// compiled [data-active] presence selector matched EVERY row —
		// font-medium + foreground on all of them, killing the muted inactive
		// color AND the hover's text lift. The attribute must be OMITTED when
		// inactive so the variants apply to the active row alone.
		const { container } = render(Fixture);
		const rows = [...container.querySelectorAll('a')].filter(
			(a) => a.dataset.slot === 'tooltip-trigger'
		);
		expect(rows.length).toBeGreaterThan(1);
		const active = rows.find((r) => r.getAttribute('aria-current') === 'page');
		const inactive = rows.find((r) => r.getAttribute('aria-current') !== 'page');
		expect(active?.hasAttribute('data-active')).toBe(true);
		expect(inactive?.hasAttribute('data-active')).toBe(false);
	});

	it('nav rows keep the old design’s hover wash + text', () => {
		const cls = firstRow().className;
		// the OLD row contract, still true after the port:
		expect(cls).toContain('hover:bg-accent/60'); // the wash
		expect(cls).toContain('hover:text-foreground'); // the text lift
		expect(cls).toContain('text-sm'); // the row size
	});

	it('rows transition COLORS too (the hover fades in, it does not snap)', () => {
		const cls = firstRow().className;
		// the block's base morphs width/height/padding; the old design ALSO
		// faded the hover — the composition must carry both.
		expect(cls).toMatch(/transition-\[.*background-color.*\]/);
	});

	it('collapsed rows center on the rail’s centerline (mx-auto in icon mode)', () => {
		expect(firstRow().className).toContain('group-data-[collapsible=icon]:mx-auto');
	});
});
