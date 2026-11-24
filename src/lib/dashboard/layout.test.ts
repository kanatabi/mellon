import { describe, expect, it } from 'vitest';
import { clampSpan, moveEntry, placeEntry, reconcileLayout, sanitizeLayout } from './layout.ts';
import type { WidgetDef } from './widgets/registry.ts';

/**
 * The dashboard layout's pure semantics (the pane-order.ts pattern): the
 * runes store holds $state; every decision lands here. The registry here
 * is a FIXED two-widget stand-in — the real one reads the live registry
 * (whose drift the palette test pins).
 */
const defs: WidgetDef[] = [
	{
		id: 'a',
		title: 'A',
		description: '',
		defaultSpan: { col: 3, row: 2 },
		minSpan: { col: 2, row: 1 },
		body: {} as never
	},
	{
		id: 'b',
		title: 'B',
		description: '',
		defaultSpan: { col: 2, row: 1 },
		minSpan: { col: 1, row: 1 },
		body: {} as never
	}
];

describe('reconcileLayout', () => {
	it('appends registry widgets missing from the stored layout', () => {
		const out = reconcileLayout({ entries: [] }, defs);
		expect(out.map((e) => e.id)).toEqual(['a', 'b']);
		expect(out[0].colSpan).toBe(3); // default span
	});

	it('drops unknown ids — a removed widget cannot ghost the arrangement', () => {
		const out = reconcileLayout(
			{
				entries: [
					{ id: 'a', colSpan: 2, rowSpan: 1, hidden: false },
					{ id: 'ghost', colSpan: 1, rowSpan: 1, hidden: false }
				]
			},
			defs
		);
		expect(out.map((e) => e.id)).toEqual(['a', 'b']);
	});

	it('clamps spans to the grid (6) and the widget minimum', () => {
		const out = reconcileLayout(
			{ entries: [{ id: 'a', colSpan: 99, rowSpan: 0, hidden: false }] },
			defs
		);
		expect(out[0].colSpan).toBe(6);
		expect(out[0].rowSpan).toBe(1); // minSpan.row
	});
});

describe('placeEntry / moveEntry', () => {
	const layout = {
		entries: [
			{ id: 'a', colSpan: 1, rowSpan: 1, hidden: false },
			{ id: 'b', colSpan: 1, rowSpan: 1, hidden: false }
		]
	};

	it('places before a target; null target = last', () => {
		// placing 'a' before 'b' keeps it first — the order IS the position
		expect(placeEntry(layout.entries, 'a', 'b').map((e) => e.id)).toEqual(['a', 'b']);
		expect(placeEntry(layout.entries, 'b', 'a').map((e) => e.id)).toEqual(['b', 'a']);
		expect(placeEntry(layout.entries, 'a', null).map((e) => e.id)).toEqual(['b', 'a']);
	});

	it('keyboard move swaps with the order neighbor', () => {
		expect(moveEntry(layout.entries, 'a', 1).map((e) => e.id)).toEqual(['b', 'a']);
		expect(moveEntry(layout.entries, 'a', -1).map((e) => e.id)).toEqual(['a', 'b']);
	});

	it('unknown drag ids are refused, never guessed at', () => {
		expect(placeEntry(layout.entries, 'ghost', 'a')).toEqual(layout.entries);
	});
});

describe('sanitizeLayout', () => {
	it('rejects non-object garbage; unknown ids are FILTERED (reconcile drops them anyway)', () => {
		expect(sanitizeLayout(null, defs)).toBeNull();
		expect(sanitizeLayout('x', defs)).toBeNull();
		const filtered = sanitizeLayout(
			{
				entries: [
					{ id: 'ghost', colSpan: 1, rowSpan: 1 },
					{ id: 'a', colSpan: 1, rowSpan: 1 }
				]
			},
			defs
		);
		expect(filtered?.entries.map((e) => e.id)).toEqual(['a']);
	});

	it('accepts a valid stored layout', () => {
		const stored = { entries: [{ id: 'a', colSpan: 3, rowSpan: 2, hidden: false }] };
		expect(sanitizeLayout(stored, defs)?.entries).toHaveLength(1);
	});
});

describe('clampSpan', () => {
	it('respects the grid width and the widget minimum', () => {
		expect(clampSpan(defs[0], 99, 99)).toEqual({ colSpan: 6, rowSpan: 4 });
		expect(clampSpan(defs[0], 1, 1)).toEqual({ colSpan: 2, rowSpan: 1 });
	});
});
