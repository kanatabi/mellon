import { browser } from '$app/env';

/**
 * Per-section collapse + order state for the config sidebars (owner call
 * 2026-11-09): every labeled pane collapses individually to a vertical pill,
 * stacks strictly in one column, and MOVES freely — except the verb block:
 * the pinned pane (ACTIONS) is structurally first. The order list holds ONLY
 * movable ids; the pin is not expressible as data, so no persisted value,
 * no drag, and no keystroke can move it. Same arrow-bound lesson as Rail:
 * these are fields, not prototype methods — the markup passes references.
 */
export class SectionSet {
	movable: string[];
	pinned: string | null;
	order = $state<string[]>([]);
	open = $state<Record<string, boolean>>({});

	private storageKey = '';

	constructor(key: string, movable: string[], pinned: string | null = null) {
		this.movable = movable;
		this.pinned = pinned;
		this.order = [...movable];
		this.storageKey = `mellon.sections.${key}`;
	}

	init = () => {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (!raw) return;
			const v = JSON.parse(raw) as { order?: string[]; open?: Record<string, boolean> };
			// accept a stored order ONLY if it is exactly the movable set — a
			// hand-edited or stale value cannot smuggle the pin or drop a pane
			if (
				Array.isArray(v.order) &&
				v.order.length === this.movable.length &&
				this.movable.every((id) => v.order!.includes(id))
			) {
				this.order = v.order;
			}
			if (v.open && typeof v.open === 'object') this.open = v.open;
		} catch {
			/* corrupt store = defaults, never a crash */
		}
	};

	persist = () => {
		if (browser)
			localStorage.setItem(this.storageKey, JSON.stringify({ order: this.order, open: this.open }));
	};

	isOpen = (id: string) => this.open[id] !== false; // default: all open

	toggle = (id: string) => {
		this.open[id] = !this.isOpen(id);
		this.persist();
	};

	/** flex order: pinned leads, movables follow their sequence. */
	pos = (id: string) => (id === this.pinned ? -1 : this.order.indexOf(id));

	/** keyboard: Alt+↑/↓ — swaps with the neighbor in the MOVABLE list only
	 *  (index 0 moving up onto ACTIONS is a silent no-op: the pin is a wall). */
	move = (id: string, dir: -1 | 1) => {
		const i = this.order.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= this.order.length) return;
		const next = [...this.order];
		[next[i], next[j]] = [next[j], next[i]];
		this.order = next;
		this.persist();
	};

	/** drop: land dragId before/after targetId (both movable; illegal drops
	 *  simply are not offered as targets) */
	moveTo = (dragId: string, targetId: string, after: boolean) => {
		if (dragId === targetId || !this.order.includes(dragId) || !this.order.includes(targetId))
			return;
		const next = this.order.filter((id) => id !== dragId);
		const at = next.indexOf(targetId) + (after ? 1 : 0);
		next.splice(at, 0, dragId);
		this.order = next;
		this.persist();
	};

	reset = () => {
		this.order = [...this.movable];
		this.persist();
	};
}

export const postSections = new SectionSet(
	'post',
	['title', 'subtitle', 'slug', 'date', 'tags', 'media', 'export', 'timeline'],
	'actions'
);
export const deskSections = new SectionSet('desk', ['sort', 'dates', 'tags']);
export const photosSections = new SectionSet('photos', ['sort', 'dates', 'collections']);
