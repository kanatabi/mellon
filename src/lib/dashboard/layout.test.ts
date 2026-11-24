import { describe, expect, it } from 'vitest';
import {
	clampSpan,
	migrateLayout,
	moveEntry,
	placeEntry,
	reconcileLayout,
	sanitizeLayout,
	spanHeightPx
} from './layout.ts';
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

	it('clamps spans to the grid (12) and the widget minimum', () => {
		const out = reconcileLayout(
			{ entries: [{ id: 'a', colSpan: 99, rowSpan: 0, hidden: false }] },
			defs
		);
		expect(out[0].colSpan).toBe(12);
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
		expect(clampSpan(defs[0], 99, 99)).toEqual({ colSpan: 12, rowSpan: 8 });
		expect(clampSpan(defs[0], 1, 1)).toEqual({ colSpan: 2, rowSpan: 1 });
	});
});

describe('migrateLayout (the B3 ×2 schema bump)', () => {
	it('unversioned layouts scale colSpan and rowSpan ×2 — same visual size', () => {
		const old = {
			entries: [
				{ id: 'a', colSpan: 3, rowSpan: 2, hidden: false },
				{ id: 'b', colSpan: 6, rowSpan: 4, hidden: true }
			]
		};
		const migrated = migrateLayout(old)!;
		expect(migrated.version).toBe(2); // stamped: migrates exactly once
		expect(migrated.entries[0]).toEqual({ id: 'a', colSpan: 6, rowSpan: 4, hidden: false });
		expect(migrated.entries[1]).toEqual({ id: 'b', colSpan: 12, rowSpan: 8, hidden: true });
	});

	it('version-2 layouts pass through untouched — no double scaling', () => {
		const current = {
			version: 2,
			entries: [{ id: 'a', colSpan: 6, rowSpan: 4, hidden: false }]
		};
		expect(migrateLayout(current)).toEqual(current);
	});

	it('null stays null', () => {
		expect(migrateLayout(null)).toBeNull();
	});
});

describe('the finer grid constants', () => {
	it('a 2-unit rowSpan on the 44px unit = the old single 88px track + gap', () => {
		// the visual continuity of the ×2: two 44px tracks + one 16px gap
		// equals the old 88px track + 16px gap footprint
		expect(spanHeightPx(2)).toBe(104); // 2×44 + 16
	});
});
