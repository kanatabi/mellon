/**
 * The dashboard layout store — the RUNES layer over the pure semantics
 * (`layout.ts`, the pane-order.ts pattern) and the STORAGE SEAM (the spine
 * ruling: localStorage now, a server impl swaps in without touching the
 * grid/registry/components). Per-USER arrangement: the key carries the
 * username, so family members on one browser each get their own home.
 */
import { WIDGETS, type WidgetDef as WidgetDefT } from './widgets/registry.ts';
import {
	clampSpan,
	moveEntry,
	placeEntry,
	reconcileLayout,
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

	constructor(registry: WidgetDefT[], storage: DashboardLayoutStorage) {
		this.storage = storage;
		// the registry-validated seed: stored layout reconciled, or defaults
		this.entries = reconcileLayout(null, registry);
	}

	/** Per-user init: reconcile the stored layout against the registry and
	 *  clamp every span (the drift pin — lumen's truth over the browser).
	 *  Runs ONCE per username: the page's $effect re-fires on every
	 *  hydration/navigation, and an effect that both writes AND reads
	 *  `entries` self-triggers to depth-exceeded — so this method never
	 *  reads `this.entries` (the save captures the local) and no-ops when
	 *  the user is already loaded. */
	private loadedKey = '';

	init(username: string, registry: WidgetDefT[]) {
		if (typeof window === 'undefined') return;
		const key = `mellon.dashboard.${username}`;
		if (key === this.loadedKey) return;
		this.loadedKey = key;
		this.key = key;
		const stored = sanitizeLayout(this.storage.load(key), registry);
		const next = reconcileLayout(stored, registry).map((e) => {
			const def = registry.find((d) => d.id === e.id)!;
			return { ...e, ...clampSpan(def, e.colSpan, e.rowSpan) };
		});
		this.entries = next;
		this.storage.save(key, { entries: next });
	}

	persist() {
		if (typeof window !== 'undefined') this.storage.save(this.key, { entries: this.entries });
	}

	visible = () => this.entries.filter((e) => !e.hidden);

	isHidden = (id: string) => this.entries.find((e) => e.id === id)?.hidden ?? false;

	toggleHidden = (id: string) => {
		this.entries = this.entries.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e));
		this.persist();
	};

	/** the resize verb (the spine's free spans, clamped to min + grid).
	 *  `persist` = false during a grip DRAG (the live preview); the release
	 *  calls persist() once. */
	setSpan = (
		id: string,
		colSpan: number,
		rowSpan: number,
		registry: WidgetDefT[],
		persist = true
	) => {
		const def = registry.find((d) => d.id === id);
		if (!def) return;
		this.entries = this.entries.map((e) =>
			e.id === id ? { ...e, ...clampSpan(def, colSpan, rowSpan) } : e
		);
		if (persist) this.persist();
	};

	place = (dragId: string, beforeId: string | null) => {
		this.entries = placeEntry(this.entries, dragId, beforeId);
		this.persist();
	};

	move = (dragId: string, dir: -1 | 1) => {
		this.entries = moveEntry(this.entries, dragId, dir);
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
