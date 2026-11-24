/**
 * Dashboard layout semantics — the PURE heart of the widget home, in the
 * COORDINATE model (the C round): every widget carries { id, x, y, w, h,
 * hidden } on a 24-column canvas with fixed 44px rows — the Grafana
 * classic schema. Free placement means holes stay holes; a small engine
 * (collision, vertical-gravity compaction, drop resolution) keeps the
 * canvas sane. No runes, no browser — the testable layer.
 */
import type { WidgetDef } from './widgets/registry.ts';

/** One placed widget: WHERE (x/y) and HOW BIG (w/h) — the four numbers
 *  Grafana stores. x/w are canvas columns (1/24 steps), y/h are 44px rows.
 *  Schema v4: NO hidden flag — a widget is placed or absent (the picker
 *  owns availability; deleted widgets stay deleted across reloads). */
export interface WidgetLayoutEntry {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface DashboardLayout {
	entries: WidgetLayoutEntry[];
	/** The storage schema version. 4 = placed-or-absent (no hidden). */
	version?: number;
}

/** The canvas: 24 columns at every md+ viewport (percent widths make it
 *  responsive — no per-breakpoint doubling), rows of 44px + 16px gap. */
export const GRID_COLS = 24;
export const ROW_UNIT_PX = 44;
export const GRID_GAP_PX = 16;
/** Generous height ceiling (16 rows ≈ 944px) — the old 8 capped the very
 *  tall cards the owner asked for. */
export const MAX_ROW_SPAN = 16;
export const LAYOUT_VERSION = 4;
/** The height a widget occupies for a given rowSpan (tracks + inner gaps). */
export function spanHeightPx(rowSpan: number): number {
	return rowSpan * ROW_UNIT_PX + (rowSpan - 1) * GRID_GAP_PX;
}

/**
 * The column geometry with the GUTTER (the react-grid-layout margin
 * rule): the CELL pitch is (canvasWidth + gap) / 24 and each widget
 * renders one gap narrower — adjacent cells keep exactly `gap` px
 * between them, and a full-width widget spans the canvas exactly.
 * (The rows already follow this shape — that's why vertical gaps work.)
 */
export function columnLeftPx(x: number, canvasWidth: number): number {
	return (x * (canvasWidth + GRID_GAP_PX)) / GRID_COLS;
}
export function columnWidthPx(w: number, canvasWidth: number): number {
	return Math.max(1, (w * (canvasWidth + GRID_GAP_PX)) / GRID_COLS - GRID_GAP_PX);
}
/** The same geometry as responsive CSS: percentages + the gap in calc,
 *  so the browser re-derives it on every resize without JS. */
export function columnLeftStyle(x: number): string {
	return `calc((100% + ${GRID_GAP_PX}px) * ${x} / ${GRID_COLS})`;
}
export function columnWidthStyle(w: number): string {
	return `calc((100% + ${GRID_GAP_PX}px) * ${w} / ${GRID_COLS} - ${GRID_GAP_PX}px)`;
}
/** The canvas height for a given bottom edge (y + h). */
export function canvasHeightPx(entries: WidgetLayoutEntry[]): number {
	const bottom = entries.reduce((m, e) => Math.max(m, e.y + e.h), 0);
	return bottom === 0 ? 0 : spanHeightPx(bottom);
}

/** Do two placements overlap? (Half-open cells: touching edges don't.) */
export function collides(a: WidgetLayoutEntry, b: WidgetLayoutEntry): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Clamp an entry to the widget's minimum, the canvas width and the row
 *  ceiling — x can never push a widget past the right edge. */
export function clampEntry(def: WidgetDef, e: WidgetLayoutEntry): WidgetLayoutEntry {
	return {
		...e,
		w: Math.min(GRID_COLS, Math.max(def.minSpan.col, Math.round(e.w))),
		h: Math.min(MAX_ROW_SPAN, Math.max(def.minSpan.row, Math.round(e.h))),
		x: Math.min(
			GRID_COLS - Math.min(GRID_COLS, Math.max(def.minSpan.col, e.w)),
			Math.max(0, Math.round(e.x))
		),
		y: Math.max(0, Math.round(e.y))
	};
}

/**
 * Vertical-gravity compaction (the Grafana rule the owner confirmed):
 * process top-down, pull each widget up while the cells above it are
 * free. Gaps with something occupying above STAY — holes are legal.
 */
export function compact(entries: WidgetLayoutEntry[]): WidgetLayoutEntry[] {
	// process top-down (lower items must see raised neighbors), but write
	// back IN INPUT ORDER — the store's array order stays user-stable
	const sorted = [...entries].sort((a, b) => a.y - b.y || a.x - b.x);
	const moved = new Map(sorted.map((e) => [e.id, { ...e }]));
	for (const id of moved.keys()) {
		let cur = moved.get(id)!;
		while (cur.y > 0) {
			const raised = { ...cur, y: cur.y - 1 };
			if ([...moved.values()].some((o) => o.id !== id && collides(raised, o))) break;
			moved.set(id, raised);
			cur = raised;
		}
	}
	return entries.map((e) => moved.get(e.id) ?? e);
}

/**
 * Drop resolution: place `moved` at its target, push every widget it
 * overlaps DOWN below it (cascading — a pushed widget may overlap the
 * next), then compact. The canvas never keeps an overlap.
 */
export function resolveDrop(
	entries: WidgetLayoutEntry[],
	moved: WidgetLayoutEntry
): WidgetLayoutEntry[] {
	if (!entries.some((e) => e.id === moved.id)) return entries;
	let out = entries.map((e) => (e.id === moved.id ? { ...moved } : { ...e }));
	const moving = out.find((e) => e.id === moved.id)!;
	const others = () => out.filter((e) => e.id !== moved.id);
	for (let guard = 0; guard < out.length + 1; guard++) {
		const hit = others().find((o) => collides(moving, o));
		if (!hit) break;
		out = out.map((e) => (e.id === hit.id ? { ...e, y: moving.y + moving.h } : e));
	}
	return compact(out);
}

/** Keyboard nudge: move by whole cells, clamped to the canvas, resolving
 *  collisions like a drop. */
export function nudgeEntry(
	entries: WidgetLayoutEntry[],
	id: string,
	dx: number,
	dy: number,
	registry: WidgetDef[]
): WidgetLayoutEntry[] {
	const e = entries.find((p) => p.id === id);
	const def = registry.find((d) => d.id === id);
	if (!e || !def) return entries;
	const moved = clampEntry(def, { ...e, x: e.x + dx, y: e.y + dy });
	return resolveDrop(entries, moved);
}

/**
 * The FIRST-FIT slot (the picker's add verb): scan top-down for the
 * first free position where a widget of w×h fits — holes get filled
 * before the canvas grows. Nothing free within the scan bound lands at
 * the bottom-left. Shared with the v2 migration's packing.
 */
export function firstFit(
	entries: WidgetLayoutEntry[],
	w: number,
	h: number
): { x: number; y: number } {
	const free = (x: number, y: number): boolean =>
		!entries.some((e) => x < e.x + e.w && e.x < x + w && y < e.y + e.h && e.y < y + h);
	const width = Math.min(GRID_COLS, w);
	for (let y = 0; y < 400; y++) {
		for (let x = 0; x + width <= GRID_COLS; x++) {
			if (free(x, y)) return { x, y };
		}
	}
	const bottom = entries.reduce((m, e) => Math.max(m, e.y + e.h), 0);
	return { x: 0, y: bottom };
}

/**
 * Registry-validated layout (v4): unknown ids DROP, positions clamp,
 * and the result compacts. Placed-or-absent: the registry's unplaced
 * widgets are NOT appended (deleted widgets stay deleted — the picker
 * owns availability; the add verb appends explicitly).
 */
export function reconcileLayout(
	stored: DashboardLayout | null,
	registry: WidgetDef[]
): WidgetLayoutEntry[] {
	const byId = new Map(registry.map((d) => [d.id, d]));
	const out: WidgetLayoutEntry[] = [];
	const seen = new Set<string>();
	for (const entry of stored?.entries ?? []) {
		const def = byId.get(entry.id);
		if (!def || seen.has(entry.id)) continue;
		seen.add(entry.id);
		out.push(clampEntry(def, entry));
	}
	return compact(out);
}

/**
 * The schema migration, chained: v2 order shapes → v3 coordinates
 * (first-fit packing, w = colSpan×2), then EVERYTHING pre-v4 loses the
 * hidden flag — v3's unpinned entries become DELETED under the
 * placed-or-absent model (the picker re-adds them on demand). The
 * result stamps v4. Migrates by SHAPE (a stamp can lie).
 */
export function migrateLayout(stored: DashboardLayout | null): DashboardLayout | null {
	if (!stored) return null;
	// trust the stamp only if it is honest: a pre-v4-shaped payload with
	// a v4 stamp (hand-edited storage) migrates by SHAPE, not by stamp
	const looksV4 =
		stored.entries.length === 0 || ('x' in stored.entries[0] && !('hidden' in stored.entries[0]));
	if (stored.version === LAYOUT_VERSION && looksV4) return stored;
	// occupancy: rows of 24 cells
	const rows: boolean[][] = [];
	const free = (x: number, y: number, w: number, h: number): boolean => {
		for (let r = y; r < y + h; r++) {
			for (let c = x; c < x + w; c++) if (rows[r]?.[c]) return false;
		}
		return true;
	};
	const mark = (x: number, y: number, w: number, h: number) => {
		for (let r = y; r < y + h; r++) {
			rows[r] ??= Array(GRID_COLS).fill(false);
			for (let c = x; c < x + w; c++) rows[r][c] = true;
		}
	};
	const isV2Shape = stored.entries.length > 0 && 'colSpan' in stored.entries[0];
	const entries: WidgetLayoutEntry[] = stored.entries
		.map((raw) => {
			if (isV2Shape) {
				const e = raw as unknown as {
					id: string;
					colSpan: number;
					rowSpan: number;
					hidden: boolean;
				};
				const w = Math.min(GRID_COLS, e.colSpan * 2);
				const h = e.rowSpan;
				let placed = { x: 0, y: 0 };
				outer: for (let y = 0; y < 400; y++) {
					for (let x = 0; x + w <= GRID_COLS; x++) {
						if (free(x, y, w, h)) {
							placed = { x, y };
							break outer;
						}
					}
				}
				mark(placed.x, placed.y, w, h);
				return { id: e.id, x: placed.x, y: placed.y, w, h, hidden: Boolean(e.hidden) };
			}
			return raw as WidgetLayoutEntry & { hidden?: boolean };
		})
		.filter((e) => !('hidden' in e && e.hidden))
		.map((e) => {
			const out = { ...e } as unknown as Record<string, unknown>;
			delete out.hidden;
			return out as unknown as WidgetLayoutEntry;
		});
	return { version: LAYOUT_VERSION, entries };
}

/** sanitize a persisted layout: accept the v4 coordinate shape, the v3
 *  coordinate shape (with hidden — the migration reads it), and the v2
 *  order shape; anything else is rejected wholesale. The version stamp
 *  passes through. */
export function sanitizeLayout(stored: unknown, registry: WidgetDef[]): DashboardLayout | null {
	if (!stored || typeof stored !== 'object') return null;
	const raw = (stored as { entries?: unknown }).entries;
	if (!Array.isArray(raw)) return null;
	const known = new Set(registry.map((d) => d.id));
	const isCoordinate = (e: unknown): boolean =>
		!!e &&
		typeof (e as WidgetLayoutEntry).id === 'string' &&
		known.has((e as WidgetLayoutEntry).id) &&
		typeof (e as WidgetLayoutEntry).x === 'number' &&
		typeof (e as WidgetLayoutEntry).y === 'number' &&
		typeof (e as WidgetLayoutEntry).w === 'number' &&
		typeof (e as WidgetLayoutEntry).h === 'number';
	const isV2 = (e: unknown): boolean =>
		!!e &&
		typeof (e as { id?: unknown }).id === 'string' &&
		known.has((e as { id: string }).id) &&
		typeof (e as { colSpan?: unknown }).colSpan === 'number' &&
		typeof (e as { rowSpan?: unknown }).rowSpan === 'number';
	const entries = raw.filter((e) => isCoordinate(e) || isV2(e));
	if (entries.length === 0) return null;
	const version = (stored as { version?: unknown }).version;
	return { entries, ...(typeof version === 'number' ? { version } : {}) } as DashboardLayout;
}
