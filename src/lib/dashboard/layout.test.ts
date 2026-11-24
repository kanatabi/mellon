import { describe, expect, it } from 'vitest';
import {
	canvasHeightPx,
	clampEntry,
	collides,
	compact,
	GRID_COLS,
	migrateLayout,
	nudgeEntry,
	reconcileLayout,
	resolveDrop,
	sanitizeLayout,
	spanHeightPx
} from './layout.ts';
import type { WidgetLayoutEntry } from './layout.ts';
import type { WidgetDef as WidgetDefT } from './widgets/registry.ts';

/**
 * The coordinate engine (the C round): free placement on a 24-column
 * canvas — collision, gravity compaction, drop resolution, and the
 * v2 order-model migration. The registry here is a FIXED two-widget
 * stand-in; the real one reads the live registry (whose drift the
 * palette test pins).
 */
const defs: WidgetDefT[] = [
	{
		id: 'a',
		title: 'A',
		description: '',
		defaultSpan: { col: 6, row: 6 },
		minSpan: { col: 2, row: 2 },
		body: {} as never
	},
	{
		id: 'b',
		title: 'B',
		description: '',
		defaultSpan: { col: 6, row: 6 },
		minSpan: { col: 2, row: 2 },
		body: {} as never
	}
];
const defOf = (id: string) => defs.find((d) => d.id === id)!;

const at = (id: string, x: number, y: number, w = 6, h = 6): WidgetLayoutEntry => ({
	id,
	x,
	y,
	w,
	h,
	hidden: false
});

describe('collides', () => {
	it('overlapping rects collide; touching edges do not', () => {
		expect(collides(at('a', 0, 0), at('b', 1, 1))).toBe(true);
		expect(collides(at('a', 0, 0, 6, 6), at('b', 6, 0))).toBe(false); // edge-touch
		expect(collides(at('a', 0, 0, 6, 6), at('b', 0, 6))).toBe(false);
	});
});

describe('clampEntry', () => {
	it('respects the widget minimum, the canvas width and the row ceiling', () => {
		const clamped = clampEntry(defOf('a'), { id: 'a', x: 99, y: -5, w: 99, h: 0, hidden: false });
		expect(clamped.w).toBe(GRID_COLS); // the canvas ceiling
		expect(clamped.h).toBe(2); // the widget minimum
		expect(clamped.x).toBe(0); // a full-width widget starts at 0
		expect(clamped.y).toBe(0);
	});

	it('x can never push the widget past the right edge', () => {
		expect(clampEntry(defOf('a'), { id: 'a', x: 20, y: 0, w: 6, h: 6, hidden: false }).x).toBe(18);
	});
});

describe('compact (vertical gravity)', () => {
	it('pulls widgets up while the cells above are free', () => {
		const out = compact([at('a', 0, 0), at('b', 12, 10)]);
		expect(out.find((e) => e.id === 'b')!.y).toBe(0); // nothing above x12
	});

	it('stops when the columns above are occupied — holes stay holes', () => {
		const out = compact([at('a', 0, 0), at('b', 12, 0), at('c', 0, 8, 6, 6)]);
		const lower = out.find((e) => e.id === 'c')!;
		expect(lower.y).toBe(6); // rises only until it meets 'a' (x0-5)
	});

	it('never reorders or loses widgets', () => {
		const out = compact([at('b', 12, 4), at('a', 0, 0)]);
		expect(out.map((e) => e.id)).toEqual(['b', 'a']);
	});
});

describe('resolveDrop', () => {
	it('a drop onto an occupied cell pushes the occupant below, then compacts', () => {
		const out = resolveDrop([at('a', 0, 0), at('b', 12, 0)], at('b', 0, 0));
		expect(out.find((e) => e.id === 'b')!.y).toBe(0);
		expect(out.find((e) => e.id === 'a')!.y).toBe(6); // pushed under
	});

	it('cascades: a drop mid-stack re-settles the stack without overlap', () => {
		const out = resolveDrop([at('a', 0, 0), at('b', 0, 6)], at('b', 0, 3));
		// gravity settles b on top; a yields below — and nothing overlaps
		expect(out.find((e) => e.id === 'b')!.y).toBe(0);
		expect(out.find((e) => e.id === 'a')!.y).toBe(6);
		expect(collides(out[0], out[1])).toBe(false);
	});

	it('an id that is not on the canvas is refused, never guessed at', () => {
		expect(resolveDrop([at('a', 0, 0)], at('ghost', 0, 0))).toEqual([at('a', 0, 0)]);
	});
});

describe('nudgeEntry (keyboard)', () => {
	it('moves by whole cells and resolves collisions like a drop', () => {
		const out = nudgeEntry([at('a', 0, 0), at('b', 6, 0)], 'a', 1, 0, defs);
		expect(out.find((e) => e.id === 'a')!.x).toBe(1);
		expect(out.find((e) => e.id === 'b')!.y).toBe(6); // pushed under a
	});

	it('clamps at the canvas edges', () => {
		const out = nudgeEntry([at('a', 0, 0)], 'a', -1, -1, defs);
		expect(out.find((e) => e.id === 'a')).toEqual(at('a', 0, 0));
	});

	it('an unknown id is a no-op', () => {
		const layout = [at('a', 0, 0)];
		expect(nudgeEntry(layout, 'ghost', 1, 0, defs)).toEqual(layout);
	});
});

describe('reconcileLayout (v3)', () => {
	it('appends registry widgets at the first free slot under everything', () => {
		const out = reconcileLayout({ version: 3, entries: [at('a', 0, 0)] }, defs);
		const b = out.find((e) => e.id === 'b')!;
		expect(b.y).toBe(6); // below a, bottom-left
	});

	it('drops unknown ids and clamps positions', () => {
		const out = reconcileLayout(
			{ version: 3, entries: [at('a', 20, 0), at('ghost', 0, 0, 6, 6)] },
			defs
		);
		expect(out.map((e) => e.id)).toEqual(['a', 'b']);
		expect(out[0].x).toBe(18);
	});
});

describe('migrateLayout (the v2 order model → coordinates)', () => {
	it('packs the old order with w = colSpan×2 — same visual arrangement', () => {
		const v2 = {
			entries: [
				{ id: 'a', colSpan: 6, rowSpan: 6, hidden: false },
				{ id: 'b', colSpan: 6, rowSpan: 6, hidden: false }
			]
		};
		const migrated = migrateLayout(v2 as never)!;
		expect(migrated.version).toBe(3);
		expect(migrated.entries).toEqual([at('a', 0, 0, 12, 6), at('b', 12, 0, 12, 6)]);
	});

	it('full-width old widgets stack below one another', () => {
		const v2 = {
			entries: [
				{ id: 'a', colSpan: 12, rowSpan: 4, hidden: false },
				{ id: 'b', colSpan: 12, rowSpan: 4, hidden: false }
			]
		};
		const migrated = migrateLayout(v2 as never)!;
		expect(migrated.entries.map((e) => e.y)).toEqual([0, 4]);
	});

	it('a v3 payload passes through untouched; a lying stamp migrates by shape', () => {
		const v3 = { version: 3, entries: [at('a', 2, 2)] };
		expect(migrateLayout(v3)).toEqual(v3);
		const lying = { version: 3, entries: [{ id: 'a', colSpan: 6, rowSpan: 6, hidden: false }] };
		expect(migrateLayout(lying as never)!.entries[0]).toHaveProperty('x', 0);
	});

	it('null stays null', () => {
		expect(migrateLayout(null)).toBeNull();
	});
});

describe('sanitizeLayout', () => {
	it('accepts v3 coordinates and the v2 order shape (the migration reads it)', () => {
		const v3 = sanitizeLayout({ version: 3, entries: [at('a', 0, 0)] }, defs);
		expect(v3?.entries).toHaveLength(1);
		const v2 = sanitizeLayout(
			{ entries: [{ id: 'a', colSpan: 6, rowSpan: 6, hidden: false }] },
			defs
		);
		expect(v2?.entries).toHaveLength(1);
	});

	it('rejects garbage, filters unknown ids, nulls out when nothing survives', () => {
		expect(sanitizeLayout(null, defs)).toBeNull();
		expect(sanitizeLayout('x', defs)).toBeNull();
		expect(
			sanitizeLayout({ entries: [{ id: 'ghost', x: 0, y: 0, w: 1, h: 1, hidden: false }] }, defs)
		).toBeNull();
	});
});

describe('the canvas geometry', () => {
	it('two 44px tracks + a gap = the 104px footprint; height follows the deepest bottom', () => {
		expect(spanHeightPx(2)).toBe(104);
		expect(canvasHeightPx([at('a', 0, 0, 6, 6), at('b', 12, 3, 6, 6)])).toBe(
			spanHeightPx(9) // b's bottom edge (3 + 6)
		);
	});
});
