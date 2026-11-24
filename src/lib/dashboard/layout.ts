/**
 * Dashboard layout semantics — the PURE heart of the widget home (no runes,
 * no browser — the testable layer, the pane-order.ts pattern). The runes
 * store (`dashboard.svelte.ts`) holds $state; every decision lands here so
 * the corruption class has unit coverage that runs anywhere vitest runs.
 */
import type { WidgetDef } from './widgets/registry.ts';

/** One placed widget: which, how big, visible or not (pinned vs un-pinned). */
export interface WidgetLayoutEntry {
	id: string;
	colSpan: number;
	rowSpan: number;
	hidden: boolean;
}

export interface DashboardLayout {
	entries: WidgetLayoutEntry[];
	/** The storage schema version (2 = the 12-col grid, 44px rows).
	 *  Unversioned layouts are the original 6-col/88px schema. */
	version?: number;
}

export const GRID_COLS = 12; // md+; 24 on xl (the same grid, finer stepping)
export const MAX_ROW_SPAN = 8;
/** The row unit is FIXED (unlike the content-sized rows of a plain grid):
 *  every widget row track is 44px tall + the 16px gap — resize math and
 *  span previews both divide by this constant (the Grafana model: fixed
 *  pixel rows, content scrolls inside the card; 44px tracks give the
 *  30px-Grafana fineness of height steps). */
export const ROW_UNIT_PX = 44;
export const GRID_GAP_PX = 16;
/** The storage schema this code writes — older layouts migrate ×2. */
export const LAYOUT_VERSION = 2;
/** The height a widget occupies for a given rowSpan (tracks + inner gaps). */
export function spanHeightPx(rowSpan: number): number {
	return rowSpan * ROW_UNIT_PX + (rowSpan - 1) * GRID_GAP_PX;
}

/**
 * The schema migration (B3 doubled the grid resolution): a layout saved
 * before the ×2 (no version stamp) carries 6-grid colSpans and 88px-unit
 * rowSpans — scale BOTH ×2 so every stored arrangement renders the same
 * visual size on the finer grid, and stamp it so it migrates exactly
 * once. Version-2 layouts pass through untouched; garbage stays null.
 */
export function migrateLayout(stored: DashboardLayout | null): DashboardLayout | null {
	if (!stored) return null;
	if (stored.version === LAYOUT_VERSION) return stored;
	return {
		version: LAYOUT_VERSION,
		entries: stored.entries.map((e) => ({
			...e,
			colSpan: e.colSpan * 2,
			rowSpan: e.rowSpan * 2
		}))
	};
}

/** Clamp a layout entry to the grid's bounds and the widget's own minimum. */
export function clampSpan(
	def: WidgetDef,
	colSpan: number,
	rowSpan: number
): { colSpan: number; rowSpan: number } {
	return {
		colSpan: Math.min(GRID_COLS, Math.max(def.minSpan.col, Math.round(colSpan))),
		rowSpan: Math.min(MAX_ROW_SPAN, Math.max(def.minSpan.row, Math.round(rowSpan)))
	};
}

/**
 * Registry-validated layout: unknown ids DROP (a removed widget cannot
 * ghost the arrangement), registry widgets missing from the stored layout
 * APPEND with their default span, spans clamp to the grid + the widget's
 * minimum, and order follows the stored entries (new widgets land last).
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
		out.push({
			id: entry.id,
			...clampSpan(def, entry.colSpan, entry.rowSpan),
			hidden: Boolean(entry.hidden)
		});
	}
	for (const def of registry) {
		if (seen.has(def.id)) continue;
		seen.add(def.id);
		out.push({
			id: def.id,
			...clampSpan(def, def.defaultSpan.col, def.defaultSpan.row),
			hidden: false
		});
	}
	return out;
}

/** drag landing inside the ORDER list (the grid places by order × dense
 *  flow): place dragId immediately before beforeId (null = last). */
export function placeEntry(
	entries: WidgetLayoutEntry[],
	dragId: string,
	beforeId: string | null
): WidgetLayoutEntry[] {
	if (dragId === beforeId || !entries.some((e) => e.id === dragId)) return entries;
	const next = entries.filter((e) => e.id !== dragId);
	const at =
		beforeId == null
			? next.length
			: Math.max(
					0,
					next.findIndex((e) => e.id === beforeId)
				);
	next.splice(at, 0, { ...entries.find((e) => e.id === dragId)! });
	return next;
}

/** keyboard parity: swap a widget with its ORDER neighbor. */
export function moveEntry(
	entries: WidgetLayoutEntry[],
	dragId: string,
	dir: -1 | 1
): WidgetLayoutEntry[] {
	const i = entries.findIndex((e) => e.id === dragId);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= entries.length) return entries;
	const next = [...entries];
	[next[i], next[j]] = [next[j], next[i]];
	return next;
}

/** sanitize a persisted layout: entries must reference KNOWN widgets and
 *  carry number spans — anything else is rejected wholesale (defaults).
 *  The version stamp passes through (the migration reads it). */
export function sanitizeLayout(stored: unknown, registry: WidgetDef[]): DashboardLayout | null {
	if (!stored || typeof stored !== 'object') return null;
	const raw = (stored as { entries?: unknown }).entries;
	if (!Array.isArray(raw)) return null;
	const known = new Set(registry.map((d) => d.id));
	const entries = raw.filter(
		(e) =>
			e &&
			typeof e === 'object' &&
			known.has((e as WidgetLayoutEntry).id) &&
			typeof (e as WidgetLayoutEntry).colSpan === 'number' &&
			typeof (e as WidgetLayoutEntry).rowSpan === 'number'
	) as WidgetLayoutEntry[];
	const version = (stored as { version?: unknown }).version;
	return { entries, ...(typeof version === 'number' ? { version } : {}) };
}
