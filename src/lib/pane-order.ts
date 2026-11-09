/**
 * Pure pane-order semantics (no runes, no browser — the testable heart of
 * the collapsible sidebars). SectionSet holds the $state; every decision
 * lands here, so the drag/drop corruption class has unit coverage that runs
 * anywhere vitest runs.
 */

/** flex order value: header owns -1 externally; the pinned pane is 0 and
 *  movables start at 1 (no negatives for panes — nothing can out-order the
 *  pin by accident). */
export function posOf(pinned: string | null, order: string[], id: string): number {
	if (id === pinned) return 0;
	const idx = order.indexOf(id);
	return (pinned ? 1 : 0) + (idx < 0 ? 0 : idx);
}

/** drag landing: place dragId immediately before beforeId (null = last;
 *  the pinned id as target means "first among the movables"; unknown ids
 *  are refused, never guessed at). */
export function placeInto(
	order: string[],
	pinned: string | null,
	dragId: string,
	beforeId: string | null
): string[] {
	if (!order.includes(dragId) || dragId === pinned) return order;
	const next = order.filter((id) => id !== dragId);
	let at: number;
	if (beforeId == null) at = next.length;
	else if (beforeId === pinned) at = 0;
	else {
		at = next.indexOf(beforeId);
		if (at < 0) at = next.length;
	}
	next.splice(at, 0, dragId);
	return next;
}

/** accept-or-reject a persisted order: must be exactly the movable set. */
export function sanitizeOrder(stored: unknown, movable: string[]): string[] | null {
	if (!Array.isArray(stored)) return null;
	const ok =
		stored.length === movable.length &&
		stored.every((id) => typeof id === 'string' && movable.includes(id as string));
	return ok ? (stored as string[]) : null;
}
