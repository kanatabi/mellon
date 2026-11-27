/**
 * The dashboard layout store — the RUNES layer over the pure semantics
 * (`layout.ts`, the coordinate model) and the STORAGE SEAM (the spine
 * ruling: localStorage now, a server impl swaps in without touching the
 * grid/registry/components). Per-USER arrangement: the key carries the
 * username, so family members on one browser each get their own home.
 */
import { WIDGETS, widgetHeld, type WidgetDef as WidgetDefT } from './widgets/registry.ts';
import {
	clampEntry,
	compact,
	firstFit,
	LAYOUT_VERSION,
	migrateLayout,
	nudgeEntry,
	reconcileLayout,
	resolveDrop,
	sanitizeLayout,
	type DashboardLayout,
	type WidgetLayoutEntry
} from './layout.ts';

/** The storage seam (R6): localStorage today; a server settings table is
 *  the SECOND implementation — the grid/registry never notice. */
export interface DashboardLayoutStorage {
	load(key: string): DashboardLayout | null;
	save(key: string, layout: DashboardLayout): void;
}

export const browserLayoutStorage: DashboardLayoutStorage = {
	load(key) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? (JSON.parse(raw) as DashboardLayout) : null;
		} catch {
			return null; // corrupt store = defaults, never a crash
		}
	},
	save(key, layout) {
		try {
			localStorage.setItem(key, JSON.stringify(layout));
		} catch {
			/* a full/failed store is a lost arrangement, never a crash */
		}
	}
};

export class DashboardLayoutStore {
	entries = $state<WidgetLayoutEntry[]>([]);
	private storage: DashboardLayoutStorage;
	private key = 'mellon.dashboard';

	/** The live drag preview: the widget being swept and its target cell.
	 *  While set, `view` renders the RESOLVED shadow layout — other
	 *  widgets glide out of the way through their position transitions —
	 *  and nothing persists until the release. */
	private dragPreview = $state<{ id: string; x: number; y: number } | null>(null);

	/** What the canvas renders: the real entries, or the shadow layout of
	 *  an in-flight drag. */
	view = $derived.by(() => {
		const p = this.dragPreview;
		if (!p) return this.entries;
		const e = this.entries.find((x) => x.id === p.id);
		const def = WIDGETS.find((d) => d.id === p.id);
		if (!e || !def) return this.entries;
		return resolveDrop(this.entries, clampEntry(def, { ...e, x: p.x, y: p.y }));
	});

	constructor(registry: WidgetDefT[], storage: DashboardLayoutStorage) {
		this.storage = storage;
		// the registry-validated seed: stored layout reconciled, or defaults
		this.entries = reconcileLayout(null, registry);
	}

	/** Per-user init: reconcile the stored layout against the registry and
	 *  clamp every placement (the drift pin — lumen's truth over the
	 *  browser). FIRST-RUN SEED (the owner call, Round D): no stored
	 *  payload at all means a brand-new user — every registry widget
	 *  their scopes allow lands at its default span; ANY existing
	 *  payload (even an empty canvas — the picker model) is respected
	 *  literally. Runs ONCE per username: the page's $effect re-fires on
	 *  every hydration/navigation, and an effect that both writes AND
	 *  reads `entries` self-triggers to depth-exceeded — so this method
	 *  never reads `this.entries` (the save captures the local) and
	 *  no-ops when the user is already loaded. */
	private loadedKey = '';

	init(username: string, registry: WidgetDefT[], held: (scope?: string) => boolean = () => true) {
		if (typeof window === 'undefined') return;
		const key = `mellon.dashboard.${username}`;
		if (key === this.loadedKey) return;
		this.loadedKey = key;
		this.key = key;
		const raw = this.storage.load(key);
		const stored = migrateLayout(sanitizeLayout(raw, registry));
		let next = reconcileLayout(stored, registry).map((e) => {
			const def = registry.find((d) => d.id === e.id)!;
			return clampEntry(def, e);
		});
		if (raw === null) {
			// first run ever for this user: seed the scope-held defaults
			next = [];
			for (const def of registry) {
				if (!widgetHeld(def, held)) continue;
				const slot = firstFit(next, def.defaultSpan.col, def.defaultSpan.row);
				next.push(
					clampEntry(def, {
						id: def.id,
						x: slot.x,
						y: slot.y,
						w: def.defaultSpan.col,
						h: def.defaultSpan.row
					})
				);
			}
			next = compact(next);
		}
		this.entries = next;
		this.storage.save(key, { entries: next, version: LAYOUT_VERSION });
	}

	persist() {
		if (typeof window !== 'undefined')
			this.storage.save(this.key, { entries: this.entries, version: LAYOUT_VERSION });
	}

	visible = () => this.entries;

	/** ADD (the picker's verb): place a registry widget at the first
	 *  free slot with its default span. Already placed = no-op. */
	add = (id: string, registry: WidgetDefT[]) => {
		const def = registry.find((d) => d.id === id);
		if (!def || this.entries.some((e) => e.id === id)) return false;
		const slot = firstFit(this.entries, def.defaultSpan.col, def.defaultSpan.row);
		this.entries = [
			...this.entries,
			clampEntry(def, { id, x: slot.x, y: slot.y, w: def.defaultSpan.col, h: def.defaultSpan.row })
		];
		this.persist();
		return true;
	};

	/** ADD MANY: selection order = placement order; persists once. */
	addMany = (ids: string[], registry: WidgetDefT[]) => {
		let added = false;
		for (const id of ids) {
			const def = registry.find((d) => d.id === id);
			if (!def || this.entries.some((e) => e.id === id)) continue;
			const slot = firstFit(this.entries, def.defaultSpan.col, def.defaultSpan.row);
			this.entries = [
				...this.entries,
				clampEntry(def, {
					id,
					x: slot.x,
					y: slot.y,
					w: def.defaultSpan.col,
					h: def.defaultSpan.row
				})
			];
			added = true;
		}
		if (added) this.persist();
	};

	/** DELETE (the placed-or-absent model): gone from the canvas AND the
	 *  stored layout — the picker shows it unselected; re-adding gives
	 *  the default span at a free slot (the old position is not kept). */
	delete = (id: string) => {
		if (!this.entries.some((e) => e.id === id)) return;
		this.entries = this.entries.filter((e) => e.id !== id);
		this.persist();
	};

	/** The resize verb: set w/h on ONE widget (x/y unchanged). `persist` =
	 *  false during a grip DRAG (the live preview); the release persists
	 *  once. A resize into neighbors resolves like a drop (they yield). */
	setSpan = (id: string, w: number, h: number, registry: WidgetDefT[], persist = true) => {
		const def = registry.find((d) => d.id === id);
		if (!def) return;
		const entry = this.entries.find((e) => e.id === id);
		if (!entry) return;
		const resized = clampEntry(def, { ...entry, w, h });
		this.entries = resolveDrop(this.entries, resized);
		if (persist) this.persist();
	};

	/** Free placement: put a widget at an absolute cell (the C2 drag's
	 *  landing; keyboard nudges route through `nudge`). */
	setPosition = (id: string, x: number, y: number, registry: WidgetDefT[]) => {
		const def = registry.find((d) => d.id === id);
		const entry = this.entries.find((e) => e.id === id);
		if (!def || !entry) return;
		this.entries = resolveDrop(this.entries, clampEntry(def, { ...entry, x, y }));
		this.dragPreview = null;
		this.persist();
	};

	/** The in-flight drag: preview the target cell (no persist). */
	previewPosition = (id: string, x: number, y: number, registry: WidgetDefT[]) => {
		const def = registry.find((d) => d.id === id);
		const entry = this.entries.find((e) => e.id === id);
		if (!def || !entry) return;
		const clamped = clampEntry(def, { ...entry, x, y });
		this.dragPreview = { id, x: clamped.x, y: clamped.y };
	};

	/** The drag died without a landing (cancel). */
	clearPreview = () => {
		this.dragPreview = null;
	};

	/** Keyboard nudge: whole cells, clamped, collision-resolved. */
	nudge = (id: string, dx: number, dy: number, registry: WidgetDefT[]) => {
		this.entries = nudgeEntry(this.entries, id, dx, dy, registry);
		this.persist();
	};

	reset = (registry: WidgetDefT[]) => {
		this.entries = reconcileLayout(null, registry);
		this.persist();
	};
}

export type DashboardLayoutEntry = WidgetLayoutEntry;

/** The home's ONE layout store — created at module scope so the palette,
 *  grid and tray all read the same arrangement. */
export const dashboardLayout = new DashboardLayoutStore(WIDGETS, browserLayoutStorage);
export type { DashboardLayout };
